export type RrfLaneName =
  | 'bm42'
  | 'rg'
  | 'dense_384'
  | 'dense_768'
  | 'turbovec'
  | 'topology'
  | 'authority'
  | 'dispatcher';

export interface RankedLaneHit {
  packetKey: string;
  lane: RrfLaneName;
  rank: number;
  rawScore: number;
  sourceRef?: string;
  metadata?: Record<string, unknown>;
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
}

export const RRF_DEFAULT_WEIGHTS = {
  bm42: 1.0,
  rg: 1.0,
  dense_384: 1.0,
  dense_768: 1.0,
  turbovec: 0.9,
  topology: 0.8,
  authority: 0.6,
  dispatcher: 0.6,
} as const;
