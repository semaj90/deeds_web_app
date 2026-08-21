export type LlmCacheTier =
  | 'L1_exact'
  | 'L1_redis'
  | 'L2_semantic'
  | 'L2_qdrant'
  | 'L3_ollama'
  | 'L3_llama_server'
  | 'L4_none';

export interface LlmCacheTrace {
  modelRole: string;
  cacheTier: LlmCacheTier;
  tokenizerFamily: 'gemma';
  provider: 'bifrost' | 'ollama' | 'llama-server' | 'tiered-llm-cache' | 'turboquant';
  latencyMs?: number;
  similarity?: number;
}
