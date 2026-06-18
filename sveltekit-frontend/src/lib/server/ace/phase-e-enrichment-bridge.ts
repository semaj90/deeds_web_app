/**
 * Phase E Enrichment Bridge — Wire enrichment data into ACE context
 *
 * Unified interface that pulls enriched metadata into the ACE retrieval pipeline:
 * 1. Feature community provenance (community_id, community_confidence, community_source)
 * 2. Karpathy authority blending (pagerank + attention + authority scores)
 * 3. Neo4j topological context (higher-hop neighbors via USED_CONCEPT/SIMILAR_TOPOLOGY)
 * 4. SOM cluster routing (20×20 grid, centroid distance)
 * 5. Autoencoder latent representation (768 → 64)
 *
 * Domain-aware enrichment: Apply boosts selectively based on query domain
 * (LLM/database/monitoring → apply; API/packets/error → skip)
 *
 * ALL data sourced from atlas_packets (canonical ledger) or Redis cache (for speed).
 */

import { pool } from '$lib/server/db/client.js';
import { getRedis } from '$lib/server/redis.js';

// Domain enrichment policy — which domains benefit from community/karpathy boosts
const DOMAIN_ENRICHMENT_POLICY: Record<string, boolean> = {
  // Apply enrichment (positive impact)
  llm: true, database: true, monitoring: true, types: true, features: true,
  security: true, graph: true,
  // Skip enrichment (negative/neutral impact)
  api: false, packets: false, error: false, forms: false, ui: false,
  cache: false, auth: false, validation: false, testing: false, perf: false,
  infra: false, events: false, retrieval: false
};

export interface Phase5EnrichedPacket {
  packet_id: string;
  source_ref: string;
  feature_id: string;
  feature_label: string;
  community_id?: string;
  community_confidence?: number;
  community_source?: 'qdrant' | 'feature_bucket' | 'feature_mode' | 'global_fallback';
  karpathy_blend?: {
    pagerank: number;
    attention: number;
    authority: number;
    blended: number; // 0.4*pr + 0.3*attn + 0.3*auth
  };
  topological_neighbors?: Array<{
    neighbor_id: string;
    source_ref: string;
    edge_type: 'USED_CONCEPT' | 'SIMILAR_TOPOLOGY';
    distance_hops: number;
  }>;
  som_cell?: {
    row: number;
    col: number;
    cluster_id: string;
    centroid_distance?: number;
  };
  latent_64?: number[]; // Autoencoder compressed, length 64
  enrichment_timestamp?: string;
}

/**
 * Detect query domain from text keywords
 */
export function detectQueryDomain(queryText: string): string {
  const keywords: Record<string, string[]> = {
    llm: ['llm', 'model', 'inference', 'embedding', 'generation', 'prompt', 'completion', 'attention', 'transformer'],
    database: ['schema', 'table', 'column', 'migration', 'query', 'index', 'relationship', 'constraint'],
    monitoring: ['metric', 'log', 'trace', 'alert', 'dashboard', 'performance', 'latency'],
    types: ['type', 'interface', 'union', 'generic', 'constraint', 'typescript'],
    features: ['feature', 'flag', 'experiment', 'variant', 'ab-test'],
    security: ['auth', 'encrypt', 'hash', 'token', 'secret', 'permission', 'ssl'],
    graph: ['node', 'edge', 'path', 'traversal', 'neo4j', 'cypher'],
    api: ['endpoint', 'route', 'rest', 'http', 'request', 'response', 'status'],
    packets: ['packet', 'chunk', 'embedding', 'vector', 'payload'],
    error: ['error', 'exception', 'crash', 'failure', 'panic'],
  };

  const lower = queryText.toLowerCase();
  let bestDomain = 'unknown';
  let bestScore = 0;

  for (const [domain, words] of Object.entries(keywords)) {
    const score = words.filter(w => lower.includes(w)).length;
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  }

  return bestDomain;
}

/**
 * Fetch enriched packet metadata from Postgres (canonical ledger)
 * Lightweight — only essential fields for ACE context.
 */
export async function fetchEnrichedPackets(
  sourceRefs: string[]
): Promise<Map<string, Phase5EnrichedPacket>> {
  if (sourceRefs.length === 0) return new Map();

  try {
    const queryResult = await pool.query(
      `SELECT packet_id, source_ref, feature_id, feature_label, community_id,
              community_confidence, community_source
       FROM atlas_packets
       WHERE source_ref = ANY($1::text[])`,
      sourceRefs
    );
    const rows = queryResult.rows as any[];

    const packetsBySourceRef = new Map<string, Phase5EnrichedPacket>();
    for (const row of rows) {
      packetsBySourceRef.set(row.source_ref, {
        packet_id: row.packet_id,
        source_ref: row.source_ref,
        feature_id: row.feature_id,
        feature_label: row.feature_label,
        community_id: row.community_id ?? undefined,
        community_confidence: row.community_confidence ?? undefined,
        community_source: (row.community_source as any) ?? undefined,
      });
    }

    return packetsBySourceRef;
  } catch (err) {
    console.error('[Phase E] Fetch enriched packets failed:', err);
    return new Map();
  }
}

/**
 * Fetch Karpathy GPU authority blending scores from Redis cache
 * O(1) per file, stored during Phase E enrichment run.
 */
export async function fetchKarpathyAuthorityScores(
  sourceRefs: string[]
): Promise<Map<string, any>> {
  if (sourceRefs.length === 0) return new Map();

  try {
    const redis = await getRedis();
    const result = new Map<string, any>();

    for (const ref of sourceRefs) {
      const cached = await redis.hget('gpu:karpathy:scores', ref);
      if (cached) {
        result.set(ref, JSON.parse(cached as string));
      }
    }

    return result;
  } catch (err) {
    console.warn('[Phase E] Karpathy scores fetch failed, continuing without:', err);
    return new Map();
  }
}

/**
 * Apply Phase E enrichment boosts to retrieval scores
 * Domain-aware: only apply boosts if domain benefits from enrichment
 *
 * Boost calculation (domain-dependent):
 * - Community confidence: ×0.1 (additive to base score, then multiply by 1.0 + factor)
 * - Karpathy authority: ×0.15 (apply authority.blend directly as weight)
 * - SOM cluster match: ×0.08 (if in same or adjacent SOM cell)
 */
export function applyPhase5EnrichmentBoost(
  baseScore: number,
  enriched: Phase5EnrichedPacket,
  context: {
    queryClusterId?: string;
    userCommunityId?: string;
    domain?: string;
  }
): number {
  let boostedScore = baseScore;

  // Check if this domain should receive enrichment boosts
  const domain = context.domain || 'unknown';
  const shouldEnrich = DOMAIN_ENRICHMENT_POLICY[domain] ?? false;

  if (!shouldEnrich) {
    // Skip enrichment for this domain — return base score unchanged
    return boostedScore;
  }

  // Community confidence boost (if user is in same community and domain permits)
  if (enriched.community_confidence && context.userCommunityId === enriched.community_id) {
    boostedScore *= 1.0 + enriched.community_confidence * 0.1;
  }

  // Karpathy authority boost (if available and domain permits)
  if (enriched.karpathy_blend?.blended) {
    boostedScore *= 1.0 + enriched.karpathy_blend.blended * 0.15;
  }

  // SOM cluster match boost (if in same cluster)
  if (enriched.som_cell && context.queryClusterId === enriched.som_cell.cluster_id) {
    boostedScore *= 1.0 + 0.08;
  }

  return boostedScore;
}

/**
 * Fetch topological neighbors via Neo4j (higher-hop context)
 * Returns USED_CONCEPT and SIMILAR_TOPOLOGY edges up to depth=2.
 */
export async function fetchTopologicalNeighbors(
  packetId: string,
  depth: number = 2
): Promise<Phase5EnrichedPacket['topological_neighbors']> {
  // TODO: Wire Neo4j query when Neo4j client is available
  // For now, return empty (Neo4j edges seeded by phase-d-enrich-qdrant.mjs)
  return [];
}

/**
 * Integration point: Enrich retrieval chunks with Phase E metadata
 * Call this on the final ranked list before token budgeting.
 */
export async function enrichRetrievalChunksPhase5(
  chunks: Array<{ source_ref: string; score: number }>,
  context: {
    queryClusterId?: string;
    userCommunityId?: string;
    domain?: string;
  }
): Promise<Array<{ source_ref: string; score: number; enriched?: Phase5EnrichedPacket }>> {
  const sourceRefs = chunks.map((c) => c.source_ref);

  // Fetch enrichment data in parallel
  const [enrichedMap, karpathyMap] = await Promise.all([
    fetchEnrichedPackets(sourceRefs),
    fetchKarpathyAuthorityScores(sourceRefs),
  ]);

  // Merge and apply boosts
  return chunks.map((chunk) => {
    const enriched = enrichedMap.get(chunk.source_ref);
    const karpathy = karpathyMap.get(chunk.source_ref);

    if (enriched && karpathy) {
      enriched.karpathy_blend = karpathy;
    }

    if (enriched) {
      return {
        source_ref: chunk.source_ref,
        score: applyPhase5EnrichmentBoost(chunk.score, enriched, context),
        enriched,
      };
    }

    return {
      source_ref: chunk.source_ref,
      score: chunk.score,
    };
  });
}

/**
 * Health check: Verify Phase E enrichment data is available
 * Called during ACE startup to confirm all enrichment lanes completed.
 */
export async function checkPhase5EnrichmentHealth(): Promise<{
  healthy: boolean;
  metrics: {
    postgres_packets_with_community: number;
    redis_karpathy_keys: number;
  };
}> {
  try {
    // Check Postgres
    const pgRes = await pool.query(
      `SELECT COUNT(*) as count FROM atlas_packets WHERE community_id IS NOT NULL`
    );
    const pgCount = parseInt(String(pgRes.rows[0]?.count ?? '0'), 10);

    // Check Redis
    let redisCount = 0;
    try {
      const redis = await getRedis();
      redisCount = await redis.hlen('gpu:karpathy:scores');
    } catch {
      // Redis optional
    }

    return {
      healthy: pgCount > 0,
      metrics: {
        postgres_packets_with_community: pgCount,
        redis_karpathy_keys: redisCount,
      },
    };
  } catch (err) {
    console.error('[Phase E] Health check failed:', err);
    return {
      healthy: false,
      metrics: {
        postgres_packets_with_community: 0,
        redis_karpathy_keys: 0,
      },
    };
  }
}

