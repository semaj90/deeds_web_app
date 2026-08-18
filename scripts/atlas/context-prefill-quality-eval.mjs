#!/usr/bin/env node
/**
 * Parent Atlas ContextManifest / prefill quality evaluation plan.
 *
 * TODO(TEST-LATER): connect this plan to the existing context compiler, prompt
 * plan/prefill compiler, exact-promotion output, and model runtime receipts.
 * No cache or model calls happen in this stub.
 */

const variants = [
  {
    id: 'semantic-only',
    lanes: ['semantic'],
    exactPromotion: true,
    description: 'Canonical semantic baseline with proof-grade source promotion.',
  },
  {
    id: 'semantic-authority',
    lanes: ['semantic', 'pagerank'],
    exactPromotion: true,
    description: 'Adds cached global architectural authority.',
  },
  {
    id: 'semantic-nary-authority',
    lanes: ['semantic', 'pagerank', 'hypergraph'],
    exactPromotion: true,
    description: 'Adds bounded n-ary evidence under the request envelope.',
  },
  {
    id: 'resource-aware-full',
    lanes: ['semantic', 'ast', 'pagerank', 'hypergraph', 'som', 'hypersphere'],
    exactPromotion: true,
    description: 'All admitted signals, with missing optional evidence remaining null.',
  },
];

console.log(JSON.stringify({
  schema: 'atlas.context-prefill-quality-eval-plan.v1',
  status: 'PLAN_ONLY',
  variants,
  requiredIdentity: [
    'query_hash', 'workspace_revision', 'source_revision', 'graph_revision',
    'representation_revision', 'context_manifest_checksum', 'prompt_plan_checksum',
    'model_revision', 'adapter_revision', 'tokenizer_revision', 'tool_schema_revision',
  ],
  retrievalMetrics: [
    'recall_at_k', 'mrr', 'ndcg_at_k', 'exact_promotion_success_rate',
    'stale_evidence_rejection_rate',
  ],
  contextMetrics: [
    'selected_packets', 'selected_tokens', 'evidence_coverage', 'duplicate_evidence_rate',
    'unsupported_claim_rate',
  ],
  inferenceMetrics: [
    'prompt_eval_ms', 'generation_ms', 'kv_prefix_hit', 'execution_success_rate',
    'validation_pass_rate', 'hallucination_rate',
  ],
  costMetrics: [
    'retrieval_ms', 'graph_ms', 'hypergraph_ms', 'rerank_ms', 'gpu_peak_bytes',
    'tool_calls', 'context_tokens',
  ],
  promotionRule: {
    quality: 'must improve or remain within an explicit non-inferiority margin',
    proof: 'must not reduce exact-promotion or validation success',
    cost: 'must report marginal latency/tokens/VRAM; no free-cost assumptions',
  },
  todo: [
    'TODO(TEST-LATER): run identical revision-qualified queries through every variant.',
    'TODO(TEST-LATER): separate metadata cache hit from model KV/prefix hit.',
    'TODO(TEST-LATER): compare prefill checksum replay before claiming cache determinism.',
    'TODO(TEST-LATER): produce per-domain slices using the existing classifier prediction contract.',
    'TODO(TEST-LATER): keep cache warming out of relevance features.',
  ],
}, null, 2));
