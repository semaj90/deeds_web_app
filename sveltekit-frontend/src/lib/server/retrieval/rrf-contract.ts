export type RrfLaneName =
  | 'bm42'
  | 'rg'
  | 'dense_384' // legacy-only compatibility lane
  | 'dense_768'
  | 'turbovec'
  | 'topology'
  | 'authority'
  | 'dispatcher';

/**
 * Compatibility identity status for legacy RRF callers while they converge on
 * SearchRuntime's canonical fusion boundary. Absence preserves the historical
 * assumption that a supplied packetKey is canonical; callers that know they
 * only have projection/source/local identity can now say so explicitly.
 */
export type RrfIdentityStatus =
  | 'canonical'
  | 'projection_exact'
  | 'source_group'
  | 'degraded';

export interface RankedLaneHit {
  packetKey: string;
  lane: RrfLaneName;
  rank: number;
  rawScore: number;
  id?: string;
  score?: number;
  sourceRef?: string;
  metadata?: Record<string, unknown>;
  /** Symbol/version identity, when the caller has already hydrated it. */
  symbolVersionId?: string;
  /**
   * Exact canonical chunk identity. This disambiguates two legitimate chunks
   * that share one packetKey; it is consumed only when supplied, never derived.
   */
  canonicalChunkId?: string;
  /** Explicit trust tier for the identity carried by this hit. */
  identityStatus?: RrfIdentityStatus;
}

export interface LaneExecutionResult {
  lane: RrfLaneName;
  status: 'ok' | 'empty' | 'unavailable' | 'failed';
  hits: RankedLaneHit[];
  latencyMs: number;
  reason?: string;
}

export interface FusedHit {
  packetKey: string;
  fusionScore: number;
  sources: RankedLaneHit[];
  id?: string;
  rrfScore?: number;
  provenance?: Record<string, { rank: number; contribution: number }>;
  symbolVersionId?: string;
  canonicalChunkId?: string;
  identityStatus?: RrfIdentityStatus;
}

export const RRF_DEFAULT_WEIGHTS = {
  bm42: 1.0,
  rg: 1.0,
  dense_384: 1.0, // legacy-only compatibility lane
  dense_768: 1.0,
  turbovec: 0.9,
  topology: 0.8,
  authority: 0.6,
  dispatcher: 0.6,
} as const;