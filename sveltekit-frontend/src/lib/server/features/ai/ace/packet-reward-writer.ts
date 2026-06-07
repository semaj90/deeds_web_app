/**
 * packet-reward-writer.ts
 *
 * Records RL reward outcomes and XGBoost feature snapshots for
 * route_runtime_packets after a user signal arrives.
 *
 * Also maintains the route_token_map for symbolic state compression:
 *   source_ref → concept_id → feature_id → token_hint
 *
 * Design:
 *   - All writes are fire-and-forget (non-blocking to the request path)
 *   - XGBoost features are extracted from the live packet + Redis prior-reward cache
 *   - Token hints follow the format <FEATURE_UPPER_SNAKE> (e.g. <ACE_CONTEXT>)
 */

import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import { getRedis } from '$lib/server/redis.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RewardSignal {
  packetUuid: string;
  accepted?: boolean;
  rejected?: boolean;
  edited?: boolean;
  cited?: boolean;
}

interface PacketRow {
  packet_uuid: string;
  query_hash: string | null;
  prompt_hash: string | null;
  feature_id: string | null;
  source_refs: unknown;
  som_cluster: string | null;
  qdrant_hits: number | null;
  latency_ms: number | null;
  response_tokens: number | null;
  captured_at: Date | null;
  reward: string | null;
}

// ── Token hint derivation ─────────────────────────────────────────────────────

function toTokenHint(featureId: string | null, sourceRef: string): string {
  const base = featureId ?? sourceRef.split('/').filter(Boolean).pop()?.replace(/\.[^.]+$/, '') ?? 'unknown';
  return `<${base.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}>`;
}

// ── XGBoost feature extraction ────────────────────────────────────────────────

async function extractXgbFeatures(packet: PacketRow): Promise<{
  cacheAgeMs: number | null;
  sourceRefOverlap: number | null;
  qdrantScoreAvg: number | null;
  neo4jDepth: number | null;
  somClusterMatch: boolean | null;
  featureIdMatch: boolean | null;
  priorReward: number | null;
}> {
  let priorReward: number | null = null;
  let cacheAgeMs: number | null = null;
  let sourceRefOverlap: number | null = null;
  let somClusterMatch: boolean | null = null;
  let featureIdMatch: boolean | null = null;

  try {
    const redis = getRedis();

    // Prior reward for same feature_id
    if (packet.feature_id) {
      const priorKey = `rl:prior_reward:${packet.feature_id}`;
      const raw = await redis.get(priorKey);
      if (raw) priorReward = parseFloat(raw);
    }

    // Cache age: how stale is this prompt_hash in Redis
    if (packet.prompt_hash) {
      const cacheKey = `llm:cache:${packet.prompt_hash}`;
      const ttl = await redis.pttl(cacheKey); // ms remaining
      if (ttl > 0) {
        // TTL 3600s total; age = total - remaining
        cacheAgeMs = 3_600_000 - ttl;
      }
    }

    // Prior packet for same feature_id to compute source_ref overlap
    if (packet.feature_id && Array.isArray(packet.source_refs)) {
      const priorRefsKey = `rl:last_source_refs:${packet.feature_id}`;
      const priorRefsRaw = await redis.get(priorRefsKey);
      if (priorRefsRaw) {
        const priorRefs: string[] = JSON.parse(priorRefsRaw);
        const current = new Set<string>(packet.source_refs as string[]);
        const prior = new Set<string>(priorRefs);
        const intersection = [...current].filter(r => prior.has(r)).length;
        const union = new Set([...current, ...prior]).size;
        sourceRefOverlap = union > 0 ? intersection / union : 0;
      }
      // Update last_source_refs for next comparison
      await redis.setex(priorRefsKey, 86400, JSON.stringify(packet.source_refs));
    }

    // SOM cluster match: does this packet's cluster match the prior for same feature?
    if (packet.feature_id && packet.som_cluster) {
      const priorClusterKey = `rl:last_som_cluster:${packet.feature_id}`;
      const priorCluster = await redis.get(priorClusterKey);
      somClusterMatch = priorCluster === packet.som_cluster;
      await redis.setex(priorClusterKey, 86400, packet.som_cluster);
    }

    // Feature ID match: does the packet's feature_id match the route's expected feature?
    featureIdMatch = !!packet.feature_id;

  } catch {
    // Redis unavailable — degrade gracefully
  }

  return {
    cacheAgeMs,
    sourceRefOverlap,
    qdrantScoreAvg: null, // populated from route_packet_facts when available
    neo4jDepth: null,     // populated from route_packet_edges when available
    somClusterMatch,
    featureIdMatch,
    priorReward,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Record a user reward signal for a packet. Fire-and-forget.
 */
export function recordReward(signal: RewardSignal): void {
  void _recordReward(signal).catch(err =>
    console.error('[packet-reward-writer] recordReward error:', err)
  );
}

async function _recordReward(signal: RewardSignal): Promise<void> {
  // Fetch the originating packet
  const { rows } = await db.execute(sql`
    SELECT packet_uuid, query_hash, prompt_hash, feature_id,
           source_refs, som_cluster, qdrant_hits, latency_ms,
           response_tokens, captured_at, reward
    FROM route_runtime_packets
    WHERE packet_uuid = ${signal.packetUuid}::uuid
    LIMIT 1
  `);
  if (!rows.length) return;

  const packet = rows[0] as unknown as PacketRow;
  const xgb = await extractXgbFeatures(packet);

  await db.execute(sql`
    INSERT INTO route_packet_rewards (
      packet_uuid, accepted, rejected, edited, cited,
      latency_ms, token_cost,
      cache_age_ms, source_ref_overlap, qdrant_score_avg,
      neo4j_depth, som_cluster_match, feature_id_match, prior_reward
    ) VALUES (
      ${signal.packetUuid}::uuid,
      ${signal.accepted ?? null},
      ${signal.rejected ?? null},
      ${signal.edited ?? null},
      ${signal.cited ?? null},
      ${packet.latency_ms ?? null},
      ${packet.response_tokens ?? null},
      ${xgb.cacheAgeMs},
      ${xgb.sourceRefOverlap},
      ${xgb.qdrantScoreAvg},
      ${xgb.neo4jDepth},
      ${xgb.somClusterMatch},
      ${xgb.featureIdMatch},
      ${xgb.priorReward}
    )
    ON CONFLICT DO NOTHING
  `);

  // Update Redis prior_reward for this feature
  const routeSuccess = !!(signal.accepted || signal.cited);
  if (packet.feature_id) {
    try {
      const redis = getRedis();
      await redis.setex(
        `rl:prior_reward:${packet.feature_id}`,
        86400,
        routeSuccess ? '1' : '0'
      );
    } catch { /* non-fatal */ }
  }
}

/**
 * Upsert source_ref → token_hint mappings from a packet's source_refs.
 * Fire-and-forget.
 */
export function syncTokenMap(packetUuid: string, sourceRefs: string[], featureId: string | null): void {
  void _syncTokenMap(packetUuid, sourceRefs, featureId).catch(err =>
    console.error('[packet-reward-writer] syncTokenMap error:', err)
  );
}

async function _syncTokenMap(
  packetUuid: string,
  sourceRefs: string[],
  featureId: string | null
): Promise<void> {
  if (!sourceRefs.length) return;

  const refs = sourceRefs.slice(0, 20);

  for (let i = 0; i < refs.length; i++) {
    const ref = refs[i];
    const hint = toTokenHint(featureId, ref);

    // Normalize source_ref into flat join table for fast provenance queries
    await db.execute(sql`
      INSERT INTO route_packet_source_refs (packet_uuid, source_ref, feature_id, ref_index)
      VALUES (${packetUuid}::uuid, ${ref}, ${featureId}, ${i})
      ON CONFLICT (packet_uuid, source_ref) DO NOTHING
    `);

    await db.execute(sql`
      INSERT INTO route_token_map (source_ref, feature_id, token_hint, hit_count, last_seen_at)
      VALUES (${ref}, ${featureId}, ${hint}, 1, now())
      ON CONFLICT (source_ref) DO UPDATE SET
        hit_count    = route_token_map.hit_count + 1,
        last_seen_at = now(),
        feature_id   = COALESCE(route_token_map.feature_id, EXCLUDED.feature_id),
        token_hint   = EXCLUDED.token_hint
    `);
  }
}
