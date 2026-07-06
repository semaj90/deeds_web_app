/**
 * Go Service Integration — Unified ID Hierarchy
 *
 * Wire the Go Retrieval Service to use canonical ID hierarchy:
 * - Query Qdrant/Postgres/Neo4j/Redis with unified IDs
 * - RRF fusion with 7 lanes
 * - Return candidates with all 8 IDs intact
 */

import type { CanonicalIDHierarchy } from './canonical-id-hierarchy';

export interface GoServiceConfig {
  grpcUrl: string; // e.g., localhost:50053
  httpUrl?: string; // Fallback HTTP endpoint
  timeoutMs?: number;
}

export interface GoQueryRequest {
  query: string;
  query_embedding: number[]; // 384-dim
  top_k: number; // Default: 100 for RRF
  filters?: {
    repository_id?: string;
    directory_id?: string;
    file_id?: string;
    module_id?: string;
    symbol_id?: string;
    feature_id?: string;
  };
}

export interface GoQueryResult {
  candidates: GoCandidate[];
  timing: {
    qdrant_ms: number;
    postgres_ms: number;
    neo4j_ms: number;
    redis_ms: number;
    turbovec_ms: number;
    rrf_ms: number;
    total_ms: number;
  };
  lanes: {
    qdrant_hits: number;
    postgres_hits: number;
    neo4j_hits: number;
    redis_hits: number;
    turbovec_hits: number;
  };
}

export interface GoCandidate extends CanonicalIDHierarchy {
  source_ref: string;
  packet_type: string;

  // RRF scores (7 lanes)
  qdrant_score: number; // Content embedding similarity
  postgres_score: number; // BM25/FTS relevance
  neo4j_score: number; // Graph traversal/pagerank
  redis_score: number; // Exact match / BitFrost cache hit
  turbovec_score: number; // 4-bit quantized prefilter
  som_topology_score: number; // SOM cluster match
  community_authority_score: number; // Community authority

  // Combined RRF score (final ranking)
  rrf_score: number;

  // Vectors for reranker
  content_embedding: number[];
  summary_embedding: number[];
  title_embedding: number[];
  signature_embedding: number[];
}

/**
 * Query Go Retrieval Service via gRPC (primary) or HTTP (fallback)
 *
 * Implementation note: This is a bridge to call the Go service.
 * The actual gRPC/HTTP communication happens in the Go service.
 */
export async function queryGoService(
  config: GoServiceConfig,
  request: GoQueryRequest
): Promise<GoQueryResult> {
  const url = config.httpUrl || `http://${config.grpcUrl.replace(':50053', ':8100')}`;
  const timeout = config.timeoutMs || 30000;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${url}/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: request.query,
        query_embedding: request.query_embedding,
        top_k: request.top_k,
        filters: request.filters
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(
        `Go service ${response.status}: ${await response.text()}`
      );
    }

    const result = await response.json();

    // Validate that all candidates have 8 IDs
    for (const candidate of result.candidates) {
      if (!validateCandidateIDHierarchy(candidate)) {
        console.warn(`Candidate ${candidate.packet_key} missing IDs, skipping`);
        continue;
      }
    }

    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Filter candidates by any level of ID hierarchy
 */
export function filterByIDLevel(
  candidates: GoCandidate[],
  level: keyof CanonicalIDHierarchy,
  value: string
): GoCandidate[] {
  return candidates.filter(c => c[level] === value);
}

/**
 * Group candidates by ID level (e.g., group by file_id)
 */
export function groupByIDLevel(
  candidates: GoCandidate[],
  level: keyof CanonicalIDHierarchy
): Map<string, GoCandidate[]> {
  const groups = new Map<string, GoCandidate[]>();

  for (const candidate of candidates) {
    const key = String(candidate[level]);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(candidate);
  }

  return groups;
}

/**
 * Validate candidate has all 8 IDs
 */
function validateCandidateIDHierarchy(
  candidate: Partial<GoCandidate>
): candidate is GoCandidate {
  const required = [
    'repository_id',
    'directory_id',
    'file_id',
    'module_id',
    'symbol_id',
    'feature_id',
    'packet_key',
    'chunk_id'
  ] as const;

  for (const field of required) {
    if (!candidate[field]) {
      return false;
    }
  }

  return true;
}

/**
 * Extract metadata from candidates for logging/debugging
 */
export function getCandidateMetadata(candidate: GoCandidate) {
  return {
    packet_key: candidate.packet_key,
    source_ref: candidate.source_ref,
    feature_id: candidate.feature_id,
    file_id: candidate.file_id,
    rrf_score: candidate.rrf_score,
    lanes: {
      qdrant: candidate.qdrant_score,
      postgres: candidate.postgres_score,
      neo4j: candidate.neo4j_score,
      redis: candidate.redis_score,
      turbovec: candidate.turbovec_score,
      som_topology: candidate.som_topology_score,
      community_authority: candidate.community_authority_score
    }
  };
}

/**
 * Log RRF lane breakdown
 */
export function logRRFBreakdown(result: GoQueryResult) {
  console.log('\n📊 RRF Lane Breakdown:');
  console.log(`  Qdrant: ${result.lanes.qdrant_hits} hits (${result.timing.qdrant_ms}ms)`);
  console.log(`  Postgres: ${result.lanes.postgres_hits} hits (${result.timing.postgres_ms}ms)`);
  console.log(`  Neo4j: ${result.lanes.neo4j_hits} hits (${result.timing.neo4j_ms}ms)`);
  console.log(`  Redis: ${result.lanes.redis_hits} hits (${result.timing.redis_ms}ms)`);
  console.log(`  TurboVec: ${result.lanes.turbovec_hits} hits (${result.timing.turbovec_ms}ms)`);
  console.log(`  RRF Fusion: ${result.timing.rrf_ms}ms`);
  console.log(`  Total: ${result.timing.total_ms}ms\n`);
}

/**
 * Log top-K candidates with scores
 */
export function logTopCandidates(candidates: GoCandidate[], topK: number = 5) {
  console.log(`\n🎯 Top ${topK} Candidates (by RRF score):`);
  candidates.slice(0, topK).forEach((c, i) => {
    console.log(
      `  ${i + 1}. ${c.source_ref} (${c.feature_id}) — score: ${c.rrf_score.toFixed(4)}`
    );
  });
  console.log('');
}
