/**
 * query-router.ts
 *
 * Routes a query through the full retrieval stack and assembles a real ACEFullPacket.
 * No mocks. Each lane is tried in order; results are merged and ranked.
 *
 * Route order (cheapest → most expensive):
 *   1. Redis hot packet      — exact query hash hit (0ms)
 *   2. sourceRef lookup      — if query looks like a file path (1ms)
 *   3. SOM cluster lookup    — if cluster_id known from prior context (1ms)
 *   4. Qdrant dense search   — embed query → ANN (50-200ms)
 *   5. Parent Atlas expand   — feature/lane expansion from Qdrant hits (10ms)
 *   6. Neo4j neighbors       — graph hop from matched source_refs (50ms)
 *
 * Output: AceFullPacket with all fields populated from real data.
 */

import { ENV } from '$lib/server/env.server.js';
import { getValkeyClient } from '$lib/server/cache/valkey-client.js';
import {
  writeAcePacket,
  readAcePacketBySourceRef,
  readAcePacketByCluster,
  makeQueryHash,
  validateAcePacket,
  type AceFullPacket,
} from './ace-packet-store.js';
import { readSomPacketById } from './som-packet-store.js';
import { readCardBySourceRef, normalizeCardId, cardIdVariants } from './nes-chrom-card-store.js';
import { nearestCluster } from '$lib/server/retrieval/centroid-cache.js';
import crypto from 'crypto';

// ── Embed query via embeddinggemma :8081 or Ollama fallback ──────────────

async function embedQuery(query: string): Promise<number[] | null> {
  const embedUrl = ENV.OLLAMA_EMBED_BASE_URL ?? ENV.OLLAMA_BASE_URL;
  const model = ENV.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';

  const isV1 = embedUrl.includes('8081') || embedUrl.includes('/v1');
  const targetUrl = isV1
    ? `${embedUrl.replace(/\/v1\/embeddings$/, '').replace(/\/$/, '')}/v1/embeddings`
    : `${embedUrl.replace(/\/$/, '')}/api/embeddings`;

  const body = isV1
    ? { model, input: query }
    : { model, prompt: query };

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    if (isV1) {
      return data.data?.[0]?.embedding ?? null;
    }
    return data.embedding ?? null;
  } catch {
    if (isV1) {
      try {
        const fallbackUrl = `${embedUrl.replace(/\/$/, '')}/api/embeddings`;
        const res = await fetch(fallbackUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt: query }),
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) {
          const data = await res.json() as { embedding?: number[] };
          return data.embedding ?? null;
        }
      } catch { /* ignore fallback error */ }
    }
    return null;
  }
}

// ── Qdrant dense search ───────────────────────────────────────────────────

interface QdrantHit {
  id: string | number;
  score: number;
  payload: Record<string, unknown>;
}

async function qdrantSearch(embedding: number[], limit = 10, collection = 'codebase_chunks_768'): Promise<QdrantHit[]> {
  const qdrantUrl = ENV.QDRANT_URL ?? 'http://127.0.0.1:6333';
  try {
    const res = await fetch(`${qdrantUrl}/collections/${collection}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: {
          name: 'content',
          vector: embedding,
        },
        limit,
        with_payload: true,
        with_vector: false,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { result?: QdrantHit[] };
    return data.result ?? [];
  } catch {
    return [];
  }
}

// ── Neo4j neighbor expansion ──────────────────────────────────────────────

async function neo4jNeighbors(sourceRef: string, limit = 5): Promise<string[]> {
  const neo4jUrl = process.env.NEO4J_URL ?? 'bolt://localhost:7687';
  // Lightweight HTTP check — if Neo4j HTTP is up, query it
  try {
    const res = await fetch(`${neo4jUrl.replace('bolt://', 'http://').replace(':7687', ':7474')}/db/neo4j/tx/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Basic ' + Buffer.from('neo4j:neo4j').toString('base64') },
      body: JSON.stringify({
        statements: [{
          statement: `MATCH (f:CodebaseFile {id: $ref})-[:IMPORTS|DYNAMIC_IMPORTS|USES_COMPONENT|USES_STORE|SIMILAR_TOPOLOGY]-(n) RETURN n.id LIMIT $limit`,
          parameters: { ref: sourceRef, limit },
        }],
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return [];
    const data = await res.json() as { results?: Array<{ data: Array<{ row: string[] }> }> };
    return (data.results?.[0]?.data ?? []).map(d => d.row[0]).filter(Boolean);
  } catch {
    return [];
  }
}

// ── Source ref detection ──────────────────────────────────────────────────

function looksLikeSourceRef(query: string): string | null {
  // Matches patterns like "valkey-client.ts", "src/lib/...", "file:src/..."
  if (/\.(ts|tsx|svelte|mjs|mts|js)(\b|$)/.test(query)) {
    return normalizeCardId(query.trim());
  }
  return null;
}

// ── Main query router ─────────────────────────────────────────────────────

export interface QueryRouterOpts {
  query: string;
  clusterHint?: string;    // "row:col" if caller knows the cluster
  featureHint?: string;    // feature_id if caller knows the feature
  limit?: number;
  collection?: string;
}

export interface RouteTrace {
  lane: string;
  hit: boolean;
  latency_ms: number;
}

export interface QueryRouterResult {
  packet: AceFullPacket;
  trace: RouteTrace[];
}

export async function routeQuery(opts: QueryRouterOpts): Promise<QueryRouterResult> {
  const { query, clusterHint, featureHint, limit = 10, collection = 'codebase_chunks_768' } = opts;
  const redis = getValkeyClient();
  const queryHash = makeQueryHash(query);
  const trace: RouteTrace[] = [];
  const start = Date.now();

  // Accumulators
  const sourceRefs: string[] = [];
  const featureIds: string[] = featureHint ? [featureHint] : [];
  const laneIds: string[] = [];
  const qdrantPointIds: (string | number)[] = [];
  const neo4jNeighborIds: string[] = [];
  const redisHotKeys: string[] = [];
  const engramIds: string[] = [];
  const snippets: AceFullPacket['ranked_cards'] = [];
  let clusterId: string | null = clusterHint ?? null;
  let somClusterFound: string | null = null;
  let cacheHit: AceFullPacket['cache_hit'] = 'none';

  // ── Lane 1: Redis hot packet (exact query hash) ────────────────────────
  {
    const t0 = Date.now();
    const hotKey = `bitfrost:retrieval:${queryHash}`;
    const cached = await redis.get(hotKey).catch(() => null);
    if (cached) {
      try {
        const prior = JSON.parse(cached) as { source_refs?: string[]; atlas_cluster_ids?: string[] };
        if (prior.source_refs?.length) {
          sourceRefs.push(...prior.source_refs);
          redisHotKeys.push(hotKey);
          cacheHit = 'redis';
          // Track engram query key for provenance
          const engramQueryKey = `ace:engram:query:${queryHash}`;
          engramIds.push(engramQueryKey);
          trace.push({ lane: 'redis-hot', hit: true, latency_ms: Date.now() - t0 });
        }
      } catch { /* ignore */ }
    } else {
      trace.push({ lane: 'redis-hot', hit: false, latency_ms: Date.now() - t0 });
    }
  }

  // ── Lane 2: sourceRef direct lookup ───────────────────────────────────
  const maybeRef = looksLikeSourceRef(query);
  if (maybeRef) {
    const t0 = Date.now();
    const existing = await readAcePacketBySourceRef(maybeRef).catch(() => null);
    if (existing) {
      sourceRefs.push(...existing.source_refs);
      featureIds.push(...existing.feature_ids);
      laneIds.push(...existing.lane_ids);
      qdrantPointIds.push(...existing.qdrant_point_ids);
      clusterId = existing.cluster_id ?? clusterId;
      cacheHit = 'redis';
      trace.push({ lane: 'source-ref', hit: true, latency_ms: Date.now() - t0 });
    } else {
      // Try the NES card store
      const card = await readCardBySourceRef(maybeRef).catch(() => null);
      if (card) {
        sourceRefs.push(card.source_ref);
        featureIds.push(...card.feature_ids);
        clusterId = card.cluster_id ?? clusterId;
        trace.push({ lane: 'nes-card', hit: true, latency_ms: Date.now() - t0 });
      } else {
        trace.push({ lane: 'source-ref', hit: false, latency_ms: Date.now() - t0 });
      }
    }
  }

  // ── Lane 3: SOM cluster lookup ────────────────────────────────────────
  if (clusterId && sourceRefs.length === 0) {
    const t0 = Date.now();
    const somPacket = await readAcePacketByCluster(
      ...clusterId.split(':').map(Number) as [number, number]
    ).catch(() => null);
    if (somPacket) {
      sourceRefs.push(...somPacket.source_refs);
      featureIds.push(...somPacket.feature_ids);
      cacheHit = 'redis';
      trace.push({ lane: 'som-cluster', hit: true, latency_ms: Date.now() - t0 });
    } else {
      // Try raw SOM packet store
      const somData = await readSomPacketById(clusterId).catch(() => null);
      if (somData) {
        sourceRefs.push(...somData.source_refs);
        featureIds.push(...somData.feature_ids);
        trace.push({ lane: 'som-packet', hit: true, latency_ms: Date.now() - t0 });
      } else {
        trace.push({ lane: 'som-cluster', hit: false, latency_ms: Date.now() - t0 });
      }
    }
  }

  // ── Lane 3.5: Centroid nearest-cluster lookup ─────────────────────────────
  // Embed query once and find the nearest precomputed cluster centroid.
  // Resolves a clusterId hint before Qdrant ANN, improving cluster-scoped recall.
  let sharedEmbedding: number[] | null = null;
  if (!clusterId) {
    const t0 = Date.now();
    const vec = await embedQuery(query);
    if (vec) {
      sharedEmbedding = vec;
      try {
        const nearest = await nearestCluster(vec, 50);
        if (nearest && nearest.similarity > 0.3) {
          clusterId = `cluster:${nearest.clusterId}`;
          somClusterFound = somClusterFound ?? clusterId;
          trace.push({ lane: 'centroid-nn', hit: true, latency_ms: Date.now() - t0 });
        } else {
          trace.push({ lane: 'centroid-nn', hit: false, latency_ms: Date.now() - t0 });
        }
      } catch {
        trace.push({ lane: 'centroid-nn', hit: false, latency_ms: Date.now() - t0 });
      }
    }
  }

  // ── Lane 4: Qdrant dense search ────────────────────────────────────────
  {
    const t0 = Date.now();
    const embedding = sharedEmbedding ?? await embedQuery(query);
    if (embedding) {
      const hits = await qdrantSearch(embedding, limit, collection);
      if (hits.length > 0) {
        for (const hit of hits) {
          qdrantPointIds.push(hit.id);
          const ref = (hit.payload.sourceRef ?? hit.payload.relativePath ?? hit.payload.file_path ?? '') as string;
          const normRef = normalizeCardId(ref);
          if (normRef && !sourceRefs.includes(normRef)) sourceRefs.push(normRef);

          // Extract Atlas fields from Qdrant payload — support both old and new field names
          // feature_ids: new name | phase_lane: old single string | tags: supplemental
          const rawFeatureIds = hit.payload.feature_ids as string[] | undefined;
          const phaseLane = hit.payload.phase_lane as string | undefined;
          const payloadTags = hit.payload.tags as string[] | undefined;
          const hitFeatures: string[] = rawFeatureIds?.length
            ? rawFeatureIds
            : phaseLane
              ? [phaseLane]
              : payloadTags?.slice(0, 2) ?? [];
          for (const f of hitFeatures) {
            if (f && !featureIds.includes(f)) featureIds.push(f);
          }

          // som_cluster (new) or derive from somRow/somCol or gpuCluster (existing payload formats)
          const hitCluster = (hit.payload.som_cluster as string | undefined)
            ?? (hit.payload.somRow != null && hit.payload.somCol != null
              ? `${hit.payload.somRow}:${hit.payload.somCol}`
              : undefined)
            ?? (hit.payload.gpuCluster != null
              ? `cluster:${hit.payload.gpuCluster}`
              : undefined);
          if (hitCluster) {
            if (!clusterId) clusterId = hitCluster;
            if (!somClusterFound) somClusterFound = hitCluster;
          }

          // feature_id label: top_feature (new) or feature_label or area (existing payload formats)
          const hitFeatureLabel = (hit.payload.top_feature ?? hit.payload.feature_label ?? hit.payload.area ?? null) as string | null;

          snippets.push({
            source_ref: normRef,
            score: hit.score,
            feature_id: hitFeatureLabel,
            snippet: ((hit.payload.text ?? hit.payload.content ?? '') as string).slice(0, 200),
          });
        }
        if (cacheHit === 'none') cacheHit = 'qdrant';
        trace.push({ lane: 'qdrant', hit: true, latency_ms: Date.now() - t0 });
        laneIds.push('qdrant');
      } else {
        trace.push({ lane: 'qdrant', hit: false, latency_ms: Date.now() - t0 });
      }
    } else {
      trace.push({ lane: 'qdrant', hit: false, latency_ms: Date.now() - t0 });
    }
  }

  // ── Lane 5: Neo4j neighbor expansion (top source_ref only) ────────────
  if (sourceRefs.length > 0) {
    const t0 = Date.now();
    const neighbors = await neo4jNeighbors(sourceRefs[0]).catch(() => [] as string[]);
    if (neighbors.length > 0) {
      neo4jNeighborIds.push(...neighbors);
      for (const n of neighbors.slice(0, 3)) {
        if (!sourceRefs.includes(n)) sourceRefs.push(n);
      }
      trace.push({ lane: 'neo4j', hit: true, latency_ms: Date.now() - t0 });
      laneIds.push('neo4j');
    } else {
      trace.push({ lane: 'neo4j', hit: false, latency_ms: Date.now() - t0 });
    }
  }

  // ── Assemble prompt context (top 5 snippets) ──────────────────────────
  const topSnippets = snippets
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const promptContext = topSnippets.length > 0
    ? topSnippets.map(s => `[${s.source_ref}]\n${s.snippet}`).join('\n\n')
    : `Query: ${query}\nNo matching context found in retrieval lanes.`;

  // ── Write packet ──────────────────────────────────────────────────────
  const packetInput = {
    query,
    query_hash: queryHash,
    source_refs: [...new Set(sourceRefs)],
    feature_ids: [...new Set(featureIds)],
    lane_ids: [...new Set(laneIds)],
    cluster_id: clusterId,
    workspace_task_id: featureHint ? `task:${featureHint}:query` : null,
    qdrant_point_ids: qdrantPointIds,
    neo4j_neighbor_ids: neo4jNeighborIds,
    redis_hot_keys: redisHotKeys,
    // Provenance fields — propagated from Qdrant payload + Neo4j expansion
    som_cluster: somClusterFound,
    engram_ids: engramIds,
    kag_hits: neo4jNeighborIds.length,
    dag_hits: 0,
    nes_chrom_packet_keys: [],
    prompt_context: promptContext,
    ranked_cards: topSnippets,
    cache_hit: cacheHit,
    latency_ms: Date.now() - start,
    degraded: sourceRefs.length === 0,
    ttl_seconds: 3_600,
  };

  const validation = validateAcePacket(packetInput);
  if (!validation.valid) {
    // Degrade gracefully — still write what we have
    packetInput.degraded = true;
  }

  const packet = await writeAcePacket(packetInput, { asLatest: true });

  // Log to Bifrost telemetry key for future hot-path reuse
  await redis.set(
    `bitfrost:retrieval:${queryHash}`,
    JSON.stringify({
      query_hash: queryHash,
      source_refs: packet.source_refs,
      qdrant_point_ids: packet.qdrant_point_ids,
      atlas_cluster_ids: packet.cluster_id ? [packet.cluster_id] : [],
      feature_ids: packet.feature_ids,
      som_cluster: packet.som_cluster,
      kag_hits: packet.kag_hits,
      cache_hit: packet.cache_hit,
      latency_ms: packet.latency_ms,
      logged_at: new Date().toISOString(),
    }),
    'EX', 7_200
  ).catch(() => {});

  return { packet, trace };
}
