export type SemanticSeedExecutor = 'QDRANT' | 'CAGRA_HOT_SHARD';
export type SemanticOracleExecutor = 'CUVS_BRUTE_FORCE';

export interface SemanticSeedRequestV1 {
  candidatePoolEstimate: number;
  topK: number;
  hotShardAvailable: boolean;
  cagraProven: boolean;
  qdrantAvailable: boolean;
  freeGpuBytes: number;
  estimatedShardBytes?: number | null;
  requireExactOracle?: boolean;
}

export interface SemanticSeedDecisionV1 {
  executor: SemanticSeedExecutor;
  semanticVoteKey: 'semantic';
  topK: number;
  oracle?: SemanticOracleExecutor;
  oracleReason?: string;
  rationale: string[];
}

/**
 * Production semantic seed policy.
 *
 * Qdrant is the persistent/default semantic_768 executor. CAGRA is admitted only
 * when a hot shard is already resident/available and its semantic parity has been
 * proven. cuVS brute-force is never returned as the production executor: it is a
 * smoke/parity/Recall@K oracle only.
 */
export function chooseSemanticSeedExecutor(request: SemanticSeedRequestV1): SemanticSeedDecisionV1 {
  const topK = Math.max(1, Math.floor(request.topK));
  const rationale: string[] = [];

  if (
    request.hotShardAvailable &&
    request.cagraProven &&
    Number.isFinite(request.estimatedShardBytes) &&
    Number(request.estimatedShardBytes) <= request.freeGpuBytes
  ) {
    rationale.push('hot CAGRA shard available and fits current GPU budget');
    return {
      executor: 'CAGRA_HOT_SHARD',
      semanticVoteKey: 'semantic',
      topK,
      oracle: request.requireExactOracle ? 'CUVS_BRUTE_FORCE' : undefined,
      oracleReason: request.requireExactOracle ? 'small-fixture/Recall@K parity only' : undefined,
      rationale,
    };
  }

  if (!request.qdrantAvailable) {
    throw new Error('NO_PRODUCTION_SEMANTIC_SEED_EXECUTOR: Qdrant unavailable and no proven resident CAGRA shard');
  }

  rationale.push('Qdrant persistent semantic_768 executor selected');
  if (request.hotShardAvailable && !request.cagraProven) rationale.push('CAGRA shard ignored because semantic parity is not proven');
  if (request.hotShardAvailable && Number(request.estimatedShardBytes) > request.freeGpuBytes) rationale.push('CAGRA shard ignored because it exceeds current GPU budget');

  return {
    executor: 'QDRANT',
    semanticVoteKey: 'semantic',
    topK,
    oracle: request.requireExactOracle ? 'CUVS_BRUTE_FORCE' : undefined,
    oracleReason: request.requireExactOracle ? 'small-fixture/Recall@K parity only' : undefined,
    rationale,
  };
}
