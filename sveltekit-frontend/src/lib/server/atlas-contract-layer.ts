/**
 * @file src/lib/server/atlas-contract-layer.ts
 * @description Atlas Contract Layer — enforces provenance, lineage, and no-placeholder guarantees.
 *
 * Every retrieval returns a lineage chain that can never be lost:
 * - packet_key (stable identity)
 * - feature_id (domain classification)
 * - source_ref (code location)
 * - qdrant_point_id (vector identity)
 * - community_id (cluster membership)
 * - som_coordinates (topology position)
 *
 * Every response includes:
 * - provenance (which tier returned data, latency, cache status)
 * - confidence (0-1 score based on source)
 * - escalation_chain (what was attempted)
 */

export interface LineageChain {
  packet_key: string;
  feature_id: string;
  source_ref: string;
  qdrant_point_id?: string;
  community_id?: string | null;
  som_cluster?: number;
  som_row?: number;
  som_col?: number;
}

export interface Provenance {
  source: 'redis' | 'qdrant' | 'som' | 'kmeans' | 'neo4j' | 'postgres' | 'rg' | 'not_found';
  query_time_ms: number;
  cache_hit: boolean;
  retrieval_attempts: string[]; // All tiers attempted
  confidence: number; // 0.95 = redis, 0.85 = qdrant, 0.75 = som, 0.65 = kmeans, 0.55 = neo4j, 0.4 = postgres, 0.2 = rg
}

export interface AtlasContractResponse<T> {
  ok: boolean;
  status: 'FOUND' | 'NOT_FOUND' | 'DEGRADED';
  data: T[];
  lineage: LineageChain[]; // Never empty on success
  provenance: Provenance;
  safe_next_action?: string; // If NOT_FOUND: "ask user" or "create new file"
  error?: string;
}

export interface PlaceholderPolicy {
  allowed: false; // Never allow placeholders
  exceptions: {
    atlas_packets: never;
    qdrant: never;
    neo4j: never;
    som: never;
    kmeans: never;
    rg: never;
    user_approved: boolean; // Only if explicitly approved
  };
}

export class AtlasContractViolation extends Error {
  constructor(
    public violation: 'PLACEHOLDER_CREATED' | 'MISSING_LINEAGE' | 'FAKE_APPLY' | 'SIMULATED_SUCCESS',
    message: string
  ) {
    super(message);
    this.name = 'AtlasContractViolation';
  }
}

/**
 * Ensure every result carries complete lineage
 */
export function validateLineageChain(data: any[]): LineageChain[] {
  const lineage: LineageChain[] = [];

  for (const item of data) {
    // Reject items missing critical lineage fields
    if (!item.packet_key) {
      throw new AtlasContractViolation(
        'MISSING_LINEAGE',
        `packet_key is required but missing on item: ${JSON.stringify(item).slice(0, 100)}`
      );
    }
    if (!item.feature_id) {
      throw new AtlasContractViolation(
        'MISSING_LINEAGE',
        `feature_id is required but missing on packet ${item.packet_key}`
      );
    }
    if (!item.source_ref) {
      throw new AtlasContractViolation(
        'MISSING_LINEAGE',
        `source_ref is required but missing on packet ${item.packet_key}`
      );
    }

    lineage.push({
      packet_key: item.packet_key,
      feature_id: item.feature_id,
      source_ref: item.source_ref,
      qdrant_point_id: item.qdrant_point_id,
      community_id: item.community_id,
      som_cluster: item.som_cluster,
      som_row: item.som_row,
      som_col: item.som_col
    });
  }

  if (lineage.length === 0) {
    throw new AtlasContractViolation(
      'MISSING_LINEAGE',
      'No results passed lineage validation. Empty data array.'
    );
  }

  return lineage;
}

/**
 * Calculate confidence based on retrieval source
 */
export function confidenceFromSource(source: Provenance['source']): number {
  const confidenceMap: Record<string, number> = {
    redis: 0.95, // Exact cache hit, highest confidence
    qdrant: 0.85, // Semantic search, well-trained vectors
    som: 0.75, // Topology neighbors, pre-computed
    kmeans: 0.65, // Cluster membership, less precise
    neo4j: 0.55, // Graph traversal, depends on edge quality
    postgres: 0.4, // BM25 full-text, keyword-based (low precision)
    rg: 0.2, // Regex fallback, last resort
    not_found: 0.0
  };
  return confidenceMap[source] || 0.0;
}

/**
 * Enforce placeholder policy — reject any fake data
 */
export function enforceNoPlaceholders(data: any[]): void {
  for (const item of data) {
    // Check for obvious placeholder patterns
    if (item.packet_key === 'placeholder' || item.packet_key?.startsWith('temp_') || item.packet_key === '') {
      throw new AtlasContractViolation(
        'PLACEHOLDER_CREATED',
        `Placeholder packet_key detected: "${item.packet_key}". Only real Atlas packets allowed.`
      );
    }

    if (item.feature_id === 'unknown' || item.feature_id === '' || !item.feature_id) {
      throw new AtlasContractViolation(
        'PLACEHOLDER_CREATED',
        `Placeholder feature_id detected: "${item.feature_id}". Must map to canonical feature.`
      );
    }

    if (!item.source_ref || item.source_ref.includes('mock') || item.source_ref.includes('fake')) {
      throw new AtlasContractViolation(
        'PLACEHOLDER_CREATED',
        `Placeholder source_ref detected: "${item.source_ref}". Must reference real codebase location.`
      );
    }

    if (item.qdrant_point_id === 'simulated' || item.qdrant_point_id === '') {
      throw new AtlasContractViolation(
        'PLACEHOLDER_CREATED',
        `Placeholder qdrant_point_id detected. Qdrant search must be real.`
      );
    }

    // Check for "fake apply" patterns
    if (item.applied === true && !item.apply_hash) {
      throw new AtlasContractViolation(
        'FAKE_APPLY',
        `Item claims applied=true but missing apply_hash. Apply must be real and audited.`
      );
    }
  }
}

/**
 * Build retrieval escalation chain — attempt all tiers
 */
export async function escalabeRetrievalChain(
  query: string,
  options: {
    redis?: () => Promise<any[]>;
    qdrant?: () => Promise<any[]>;
    som?: () => Promise<any[]>;
    kmeans?: () => Promise<any[]>;
    neo4j?: () => Promise<any[]>;
    postgres?: () => Promise<any[]>;
    rg?: () => Promise<any[]>;
  }
): Promise<{ data: any[]; source: Provenance['source']; attempts: string[] }> {
  const attempts: string[] = [];
  const startTime = Date.now();

  // Tier 1: Redis cache
  if (options.redis) {
    attempts.push('redis');
    try {
      const result = await options.redis();
      if (result.length > 0) {
        return {
          data: result,
          source: 'redis',
          attempts
        };
      }
    } catch (err) {
      console.error('[atlas-contract] Redis tier failed:', err);
    }
  }

  // Tier 2: Qdrant semantic
  if (options.qdrant) {
    attempts.push('qdrant');
    try {
      const result = await options.qdrant();
      if (result.length > 0) {
        return {
          data: result,
          source: 'qdrant',
          attempts
        };
      }
    } catch (err) {
      console.error('[atlas-contract] Qdrant tier failed:', err);
    }
  }

  // Tier 3: SOM neighborhood
  if (options.som) {
    attempts.push('som');
    try {
      const result = await options.som();
      if (result.length > 0) {
        return {
          data: result,
          source: 'som',
          attempts
        };
      }
    } catch (err) {
      console.error('[atlas-contract] SOM tier failed:', err);
    }
  }

  // Tier 4: K-means community
  if (options.kmeans) {
    attempts.push('kmeans');
    try {
      const result = await options.kmeans();
      if (result.length > 0) {
        return {
          data: result,
          source: 'kmeans',
          attempts
        };
      }
    } catch (err) {
      console.error('[atlas-contract] KMeans tier failed:', err);
    }
  }

  // Tier 5: Neo4j bounded k-hop
  if (options.neo4j) {
    attempts.push('neo4j');
    try {
      const result = await options.neo4j();
      if (result.length > 0) {
        return {
          data: result,
          source: 'neo4j',
          attempts
        };
      }
    } catch (err) {
      console.error('[atlas-contract] Neo4j tier failed:', err);
    }
  }

  // Tier 6: PostgreSQL BM25
  if (options.postgres) {
    attempts.push('postgres');
    try {
      const result = await options.postgres();
      if (result.length > 0) {
        return {
          data: result,
          source: 'postgres',
          attempts
        };
      }
    } catch (err) {
      console.error('[atlas-contract] PostgreSQL tier failed:', err);
    }
  }

  // Tier 7: RG (regex fallback)
  if (options.rg) {
    attempts.push('rg');
    try {
      const result = await options.rg();
      if (result.length > 0) {
        return {
          data: result,
          source: 'rg',
          attempts
        };
      }
    } catch (err) {
      console.error('[atlas-contract] RG fallback tier failed:', err);
    }
  }

  // All tiers exhausted
  return {
    data: [],
    source: 'not_found',
    attempts
  };
}

/**
 * Build contract response with full provenance and lineage
 */
export async function buildContractResponse<T>(
  query: string,
  retrieval: { data: T[]; source: Provenance['source']; attempts: string[] },
  queryTimeMs: number
): Promise<AtlasContractResponse<T>> {
  // If no data found, enforce safe fallback behavior
  if (retrieval.data.length === 0) {
    return {
      ok: false,
      status: 'NOT_FOUND',
      data: [],
      lineage: [],
      provenance: {
        source: 'not_found',
        query_time_ms: queryTimeMs,
        cache_hit: false,
        retrieval_attempts: retrieval.attempts,
        confidence: 0.0
      },
      safe_next_action: `No Atlas packets found for query "${query}". Safe actions:\n1. Ask user for clarification\n2. Create new feature and packet\n3. Expand search with topology expansion (if topology-aware mode enabled)`
    };
  }

  // Validate lineage on all results
  try {
    enforceNoPlaceholders(retrieval.data);
    const lineage = validateLineageChain(retrieval.data);

    return {
      ok: true,
      status: 'FOUND',
      data: retrieval.data,
      lineage,
      provenance: {
        source: retrieval.source,
        query_time_ms: queryTimeMs,
        cache_hit: retrieval.source === 'redis',
        retrieval_attempts: retrieval.attempts,
        confidence: confidenceFromSource(retrieval.source)
      }
    };
  } catch (err) {
    if (err instanceof AtlasContractViolation) {
      return {
        ok: false,
        status: 'DEGRADED',
        data: [],
        lineage: [],
        provenance: {
          source: 'not_found',
          query_time_ms: queryTimeMs,
          cache_hit: false,
          retrieval_attempts: retrieval.attempts,
          confidence: 0.0
        },
        error: `Contract violation: ${err.message}`,
        safe_next_action: 'Manual review required. Lineage validation failed.'
      };
    }
    throw err;
  }
}

/**
 * Contract-enforcing wrapper for Atlas queries
 */
export async function queryAtlasWithContract<T>(
  query: string,
  retrievalFn: (q: string) => Promise<{ data: T[]; source: Provenance['source']; attempts: string[] }>
): Promise<AtlasContractResponse<T>> {
  const startTime = Date.now();

  try {
    const retrieval = await retrievalFn(query);
    const queryTimeMs = Date.now() - startTime;
    return buildContractResponse(query, retrieval, queryTimeMs);
  } catch (err) {
    return {
      ok: false,
      status: 'DEGRADED',
      data: [],
      lineage: [],
      provenance: {
        source: 'not_found',
        query_time_ms: Date.now() - startTime,
        cache_hit: false,
        retrieval_attempts: [],
        confidence: 0.0
      },
      error: err instanceof Error ? err.message : 'Unknown error',
      safe_next_action: 'Check logs. Unexpected error during retrieval.'
    };
  }
}
