import type { VarianceRecovery } from './variance-recovery-schema.js';

export type VarianceRecoveryInput = {
  query: string;
  sourceRefs?: string[];
  rankedCards?: Array<Record<string, unknown>>;
  lokiData?: unknown;
  clusterTags?: unknown[];
  promptCacheKey?: string;
  degraded?: boolean;
};

export type VarianceRecoveryContext = {
  sourceRefs: string[];
  rankedCards: Array<Record<string, unknown>>;
  varianceRecovery: VarianceRecovery;
};

export declare function buildVarianceRecoveryContext(
  input: VarianceRecoveryInput
): Promise<VarianceRecoveryContext>;
