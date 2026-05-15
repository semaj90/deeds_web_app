export type LlmCacheTier =
  | 'L1_exact'
  | 'L1_redis'
  | 'L2_semantic'
  | 'L2_qdrant'
  | 'L3_ollama'
  | 'L4_none';

export interface LlmCacheTrace {
  modelRole: string;
  cacheTier: LlmCacheTier;
  tokenizerFamily: 'gemma';
  provider: 'bifrost' | 'ollama' | 'tiered-llm-cache' | 'turboquant';
  latencyMs?: number;
  similarity?: number;
}
