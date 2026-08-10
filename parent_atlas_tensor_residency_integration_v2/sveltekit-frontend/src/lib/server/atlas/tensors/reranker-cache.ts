export interface RerankerCacheKeyInput {
  queryHash: string;
  candidateSetHash: string;
  representationRevision: string;
  featureRevision: string;
  rerankerRevision: string;
  modelRevision: string;
  precision: string;
}

export interface CachedRerankResult {
  packetKeys: readonly string[];
  scores: readonly number[];
  createdAtMs: number;
  expiresAtMs: number;
}

export function rerankerCacheKey(x: RerankerCacheKeyInput): string {
  return ['atlas:rerank', x.rerankerRevision, x.modelRevision, x.precision, x.representationRevision, x.featureRevision, x.queryHash, x.candidateSetHash].join(':');
}

export function cacheResultValid(result: CachedRerankResult, nowMs: number): boolean {
  return result.packetKeys.length === result.scores.length && result.expiresAtMs > nowMs && result.scores.every(Number.isFinite);
}
