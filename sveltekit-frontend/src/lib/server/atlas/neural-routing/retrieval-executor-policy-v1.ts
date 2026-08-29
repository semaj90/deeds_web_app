import { z } from 'zod';
import type { QueryClassificationV2 } from './query-classification-v2.js';

/**
 * NLP-2: deterministic mapping from learned logical needs -> concrete executors.
 *
 * LANE != EXECUTOR remains mandatory. The classifier predicts needs. This policy
 * selects currently-available infrastructure under a resource envelope.
 */
export const RetrievalExecutorIdV1Schema = z.enum([
  'postgres_fts',
  'qdrant_bm25',
  'qdrant_minicoil',
  'qdrant_splade',
  'qdrant_hnsw_768',
  'pgvector_exact_768',
  'cuvs_bruteforce_768',
  'cuvs_cagra_768',
  'cuvs_vamana_768',
  'diskann_vamana_768',
  'ast_structural',
  'graph_bounded',
  'cross_encoder_reranker',
]);
export type RetrievalExecutorIdV1 = z.infer<typeof RetrievalExecutorIdV1Schema>;

export const RetrievalExecutorCapabilityV1Schema = z.object({
  id: RetrievalExecutorIdV1Schema,
  available: z.boolean(),
  logicalLane: z.enum(['lexical', 'sparse', 'semantic', 'ast', 'graph', 'rerank']),
  exact: z.boolean(),
  approximate: z.boolean(),
  gpu: z.boolean(),
  persistentIndex: z.boolean(),
  onDiskCapable: z.boolean(),
  evidenceAuthority: z.literal(false),
  notes: z.string().min(1),
}).strict();
export type RetrievalExecutorCapabilityV1 = z.infer<typeof RetrievalExecutorCapabilityV1Schema>;

export const RetrievalResourceEnvelopeV1Schema = z.object({
  gpuAvailable: z.boolean(),
  freeVramBytes: z.number().int().nonnegative(),
  allowGpuAnn: z.boolean(),
  allowDiskAnn: z.boolean(),
  allowReranker: z.boolean(),
  maxCandidates: z.number().int().min(8).max(4096),
  maxGraphHops: z.number().int().min(0).max(6),
}).strict();
export type RetrievalResourceEnvelopeV1 = z.infer<typeof RetrievalResourceEnvelopeV1Schema>;

export const RetrievalPlanV1Schema = z.object({
  schema: z.literal('atlas.retrieval-plan.v1'),
  classificationDigest: z.string().length(64),
  semanticExecutors: z.array(RetrievalExecutorIdV1Schema),
  sparseExecutors: z.array(RetrievalExecutorIdV1Schema),
  lexicalExecutors: z.array(RetrievalExecutorIdV1Schema),
  astExecutors: z.array(RetrievalExecutorIdV1Schema),
  graphExecutors: z.array(RetrievalExecutorIdV1Schema),
  rerankExecutors: z.array(RetrievalExecutorIdV1Schema),
  candidateBudget: z.number().int().min(8).max(4096),
  graphHops: z.number().int().min(0).max(6),
  rerankBudget: z.number().int().min(0).max(256),
  oneVotePerLogicalLane: z.literal(true),
  evidenceAuthority: z.literal(false),
  decisions: z.array(z.string().min(1)),
}).strict();
export type RetrievalPlanV1 = z.infer<typeof RetrievalPlanV1Schema>;

export const DEFAULT_RETRIEVAL_EXECUTOR_CAPABILITIES_V1: readonly RetrievalExecutorCapabilityV1[] = [
  { id: 'postgres_fts', available: true, logicalLane: 'lexical', exact: true, approximate: false, gpu: false, persistentIndex: true, onDiskCapable: true, evidenceAuthority: false, notes: 'Canonical relational lexical baseline.' },
  { id: 'qdrant_bm25', available: false, logicalLane: 'sparse', exact: true, approximate: false, gpu: false, persistentIndex: true, onDiskCapable: true, evidenceAuthority: false, notes: 'Qdrant sparse BM25 with collection-level IDF modifier after proof.' },
  { id: 'qdrant_minicoil', available: false, logicalLane: 'sparse', exact: true, approximate: false, gpu: false, persistentIndex: true, onDiskCapable: true, evidenceAuthority: false, notes: 'Context-sensitive exact-term sparse challenger; IDF modifier required.' },
  { id: 'qdrant_splade', available: false, logicalLane: 'sparse', exact: true, approximate: false, gpu: false, persistentIndex: true, onDiskCapable: true, evidenceAuthority: false, notes: 'Sparse vocabulary-expansion challenger.' },
  { id: 'qdrant_hnsw_768', available: true, logicalLane: 'semantic', exact: false, approximate: true, gpu: false, persistentIndex: true, onDiskCapable: true, evidenceAuthority: false, notes: 'Persistent broad ANN over EmbeddingGemma semantic_768.' },
  { id: 'pgvector_exact_768', available: true, logicalLane: 'semantic', exact: true, approximate: false, gpu: false, persistentIndex: true, onDiskCapable: true, evidenceAuthority: false, notes: 'Bounded relational exact cosine/reference lane.' },
  { id: 'cuvs_bruteforce_768', available: false, logicalLane: 'semantic', exact: true, approximate: false, gpu: true, persistentIndex: false, onDiskCapable: false, evidenceAuthority: false, notes: 'GPU exact cosine oracle when RAPIDS sidecar is proven available.' },
  { id: 'cuvs_cagra_768', available: false, logicalLane: 'semantic', exact: false, approximate: true, gpu: true, persistentIndex: false, onDiskCapable: false, evidenceAuthority: false, notes: 'GPU graph ANN challenger.' },
  { id: 'cuvs_vamana_768', available: false, logicalLane: 'semantic', exact: false, approximate: true, gpu: true, persistentIndex: false, onDiskCapable: false, evidenceAuthority: false, notes: 'GPU Vamana build/search challenger where supported.' },
  { id: 'diskann_vamana_768', available: false, logicalLane: 'semantic', exact: false, approximate: true, gpu: false, persistentIndex: true, onDiskCapable: true, evidenceAuthority: false, notes: 'Microsoft DiskANN/Vamana SSD-oriented challenger after isolated proof.' },
  { id: 'ast_structural', available: true, logicalLane: 'ast', exact: true, approximate: false, gpu: false, persistentIndex: false, onDiskCapable: false, evidenceAuthority: false, notes: 'Tree-sitter/ast-grep structural evidence lane.' },
  { id: 'graph_bounded', available: true, logicalLane: 'graph', exact: false, approximate: false, gpu: false, persistentIndex: true, onDiskCapable: true, evidenceAuthority: false, notes: 'Bounded revision-qualified graph expansion.' },
  { id: 'cross_encoder_reranker', available: false, logicalLane: 'rerank', exact: false, approximate: false, gpu: false, persistentIndex: false, onDiskCapable: false, evidenceAuthority: false, notes: 'Top-K second-stage relevance scorer; model/license selected separately.' },
] as const;

function availableById(capabilities: readonly RetrievalExecutorCapabilityV1[]): Map<RetrievalExecutorIdV1, RetrievalExecutorCapabilityV1> {
  return new Map(capabilities.filter((item) => item.available).map((item) => [item.id, item]));
}

function pushIfAvailable(target: RetrievalExecutorIdV1[], id: RetrievalExecutorIdV1, map: Map<RetrievalExecutorIdV1, RetrievalExecutorCapabilityV1>): void {
  if (map.has(id) && !target.includes(id)) target.push(id);
}

export function compileRetrievalPlanV1(
  classification: QueryClassificationV2,
  envelope: RetrievalResourceEnvelopeV1,
  capabilities: readonly RetrievalExecutorCapabilityV1[] = DEFAULT_RETRIEVAL_EXECUTOR_CAPABILITIES_V1,
): RetrievalPlanV1 {
  const available = availableById(capabilities);
  const semanticExecutors: RetrievalExecutorIdV1[] = [];
  const sparseExecutors: RetrievalExecutorIdV1[] = [];
  const lexicalExecutors: RetrievalExecutorIdV1[] = [];
  const astExecutors: RetrievalExecutorIdV1[] = [];
  const graphExecutors: RetrievalExecutorIdV1[] = [];
  const rerankExecutors: RetrievalExecutorIdV1[] = [];
  const decisions: string[] = [];
  const effectiveCandidateBudget = Math.min(classification.budget.candidateBudget, envelope.maxCandidates);

  if (classification.retrievalNeeds.lexicalExact >= 0.35 || classification.retrievalNeeds.exactSymbol >= 0.35) {
    pushIfAvailable(lexicalExecutors, 'postgres_fts', available);
    decisions.push('lexical_exact_requested');
  }

  if (classification.retrievalNeeds.sparseContextual >= 0.55) {
    pushIfAvailable(sparseExecutors, 'qdrant_minicoil', available);
    if (sparseExecutors.length === 0) pushIfAvailable(sparseExecutors, 'qdrant_bm25', available);
    decisions.push('sparse_contextual_requested');
  } else if (classification.retrievalNeeds.sparseExpansion >= 0.55) {
    pushIfAvailable(sparseExecutors, 'qdrant_splade', available);
    decisions.push('sparse_expansion_requested');
  } else if (classification.retrievalNeeds.lexicalExact >= 0.65) {
    pushIfAvailable(sparseExecutors, 'qdrant_bm25', available);
  }

  if (classification.retrievalNeeds.semantic >= 0.25) {
    pushIfAvailable(semanticExecutors, 'qdrant_hnsw_768', available);

    if (envelope.gpuAvailable && envelope.allowGpuAnn) {
      if (effectiveCandidateBudget >= 512) pushIfAvailable(semanticExecutors, 'cuvs_cagra_768', available);
      pushIfAvailable(semanticExecutors, 'cuvs_bruteforce_768', available);
    }

    if (envelope.allowDiskAnn && effectiveCandidateBudget >= 1024) {
      pushIfAvailable(semanticExecutors, 'diskann_vamana_768', available);
    }

    if (!semanticExecutors.includes('cuvs_bruteforce_768')) {
      pushIfAvailable(semanticExecutors, 'pgvector_exact_768', available);
    }
    decisions.push('semantic_requested');
  }

  if (classification.retrievalNeeds.ast >= 0.35 || classification.retrievalNeeds.exactSymbol >= 0.65) {
    pushIfAvailable(astExecutors, 'ast_structural', available);
  }

  if (classification.retrievalNeeds.graph >= 0.35 && classification.budget.graphHops > 0) {
    pushIfAvailable(graphExecutors, 'graph_bounded', available);
  }

  if (envelope.allowReranker && classification.budget.rerankBudget > 0 && classification.confidence < 0.95) {
    pushIfAvailable(rerankExecutors, 'cross_encoder_reranker', available);
  }

  return RetrievalPlanV1Schema.parse({
    schema: 'atlas.retrieval-plan.v1',
    classificationDigest: classification.queryDigest,
    semanticExecutors,
    sparseExecutors,
    lexicalExecutors,
    astExecutors,
    graphExecutors,
    rerankExecutors,
    candidateBudget: Math.min(classification.budget.candidateBudget, envelope.maxCandidates),
    graphHops: Math.min(classification.budget.graphHops, envelope.maxGraphHops),
    rerankBudget: envelope.allowReranker ? classification.budget.rerankBudget : 0,
    oneVotePerLogicalLane: true,
    evidenceAuthority: false,
    decisions,
  });
}
