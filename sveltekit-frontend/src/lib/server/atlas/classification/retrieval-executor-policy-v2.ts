import { z } from 'zod';
import type { QueryClassificationV2 } from './query-classification-v2.js';

export const SemanticRepresentationAuthorityV2Schema = z.enum(['semantic_512','semantic_768']);
export type SemanticRepresentationAuthorityV2 = z.infer<typeof SemanticRepresentationAuthorityV2Schema>;

export const RetrievalExecutorIdV2Schema = z.enum([
  'postgres_fts',
  'qdrant_bm25',
  'qdrant_minicoil',
  'qdrant_splade',
  'qdrant_hnsw',
  'pgvector_exact',
  'cuvs_bruteforce',
  'cuvs_cagra',
  'cuvs_vamana_build',
  'diskann_vamana',
  'ast_structural',
  'graph_bounded',
  'cross_encoder_reranker',
]);
export type RetrievalExecutorIdV2 = z.infer<typeof RetrievalExecutorIdV2Schema>;

export const RetrievalExecutorCapabilityV2Schema = z.object({
  id: RetrievalExecutorIdV2Schema,
  status: z.enum(['PROVEN_AVAILABLE','CONFIGURED_UNPROVEN','UNAVAILABLE']),
  logicalLane: z.enum(['lexical','sparse','semantic','ast','graph','rerank']),
  mode: z.enum(['query','build','query-and-build']),
  supportedRepresentations: z.array(SemanticRepresentationAuthorityV2Schema),
  exact: z.boolean(),
  approximate: z.boolean(),
  gpu: z.boolean(),
  persistentIndex: z.boolean(),
  onDiskCapable: z.boolean(),
  evidenceAuthority: z.literal(false),
  notes: z.string().min(1),
}).strict();
export type RetrievalExecutorCapabilityV2 = z.infer<typeof RetrievalExecutorCapabilityV2Schema>;

export const DEFAULT_RETRIEVAL_EXECUTOR_CAPABILITIES_V2: readonly RetrievalExecutorCapabilityV2[] = [
  { id:'postgres_fts', status:'PROVEN_AVAILABLE', logicalLane:'lexical', mode:'query-and-build', supportedRepresentations:[], exact:true, approximate:false, gpu:false, persistentIndex:true, onDiskCapable:true, evidenceAuthority:false, notes:'PostgreSQL FTS baseline; algorithm provenance remains POSTGRES_FTS_TS_RANK[_CD], not BM25.' },
  { id:'qdrant_bm25', status:'CONFIGURED_UNPROVEN', logicalLane:'sparse', mode:'query-and-build', supportedRepresentations:[], exact:true, approximate:false, gpu:false, persistentIndex:true, onDiskCapable:true, evidenceAuthority:false, notes:'Qdrant sparse BM25; requires IDF-enabled sparse vector configuration and proof.' },
  { id:'qdrant_minicoil', status:'CONFIGURED_UNPROVEN', logicalLane:'sparse', mode:'query-and-build', supportedRepresentations:[], exact:true, approximate:false, gpu:false, persistentIndex:true, onDiskCapable:true, evidenceAuthority:false, notes:'Exact-term contextual sparse challenger; IDF modifier required.' },
  { id:'qdrant_splade', status:'CONFIGURED_UNPROVEN', logicalLane:'sparse', mode:'query-and-build', supportedRepresentations:[], exact:true, approximate:false, gpu:false, persistentIndex:true, onDiskCapable:true, evidenceAuthority:false, notes:'Sparse vocabulary-expansion challenger for lexical mismatch.' },
  { id:'qdrant_hnsw', status:'CONFIGURED_UNPROVEN', logicalLane:'semantic', mode:'query-and-build', supportedRepresentations:['semantic_512','semantic_768'], exact:false, approximate:true, gpu:false, persistentIndex:true, onDiskCapable:true, evidenceAuthority:false, notes:'Persistent semantic ANN. Active representation must match the admitted corpus contract.' },
  { id:'pgvector_exact', status:'CONFIGURED_UNPROVEN', logicalLane:'semantic', mode:'query', supportedRepresentations:['semantic_512','semantic_768'], exact:true, approximate:false, gpu:false, persistentIndex:true, onDiskCapable:true, evidenceAuthority:false, notes:'Bounded relational exact reference when a representation-qualified column/snapshot is proven.' },
  { id:'cuvs_bruteforce', status:'CONFIGURED_UNPROVEN', logicalLane:'semantic', mode:'query', supportedRepresentations:['semantic_512','semantic_768'], exact:true, approximate:false, gpu:true, persistentIndex:false, onDiskCapable:false, evidenceAuthority:false, notes:'GPU exact oracle over the same admitted representation snapshot.' },
  { id:'cuvs_cagra', status:'CONFIGURED_UNPROVEN', logicalLane:'semantic', mode:'query-and-build', supportedRepresentations:['semantic_512','semantic_768'], exact:false, approximate:true, gpu:true, persistentIndex:false, onDiskCapable:false, evidenceAuthority:false, notes:'GPU graph ANN challenger; one semantic lane contribution only.' },
  { id:'cuvs_vamana_build', status:'CONFIGURED_UNPROVEN', logicalLane:'semantic', mode:'build', supportedRepresentations:['semantic_512','semantic_768'], exact:false, approximate:true, gpu:true, persistentIndex:false, onDiskCapable:false, evidenceAuthority:false, notes:'GPU Vamana index construction/serialization capability; not treated as a query executor until search support is separately proven.' },
  { id:'diskann_vamana', status:'CONFIGURED_UNPROVEN', logicalLane:'semantic', mode:'query-and-build', supportedRepresentations:['semantic_512','semantic_768'], exact:false, approximate:true, gpu:false, persistentIndex:true, onDiskCapable:true, evidenceAuthority:false, notes:'DiskANN/Vamana SSD-oriented ANN challenger.' },
  { id:'ast_structural', status:'PROVEN_AVAILABLE', logicalLane:'ast', mode:'query', supportedRepresentations:[], exact:true, approximate:false, gpu:false, persistentIndex:false, onDiskCapable:false, evidenceAuthority:false, notes:'Tree-sitter/ast-grep structural evidence.' },
  { id:'graph_bounded', status:'PROVEN_AVAILABLE', logicalLane:'graph', mode:'query', supportedRepresentations:[], exact:false, approximate:false, gpu:false, persistentIndex:true, onDiskCapable:true, evidenceAuthority:false, notes:'Bounded revision-qualified graph expansion.' },
  { id:'cross_encoder_reranker', status:'CONFIGURED_UNPROVEN', logicalLane:'rerank', mode:'query', supportedRepresentations:[], exact:false, approximate:false, gpu:false, persistentIndex:false, onDiskCapable:false, evidenceAuthority:false, notes:'Second-stage query-document relevance scorer; model and license are separate promotion decisions.' },
] as const;

export interface RetrievalResourceEnvelopeV2 {
  gpuAvailable: boolean;
  allowGpuAnn: boolean;
  allowDiskAnn: boolean;
  allowSparseNeural: boolean;
  allowReranker: boolean;
  maxCandidates: number;
  maxGraphHops: number;
}

export interface RetrievalExecutorPlanV2 {
  schema: 'atlas.retrieval-executor-plan.v2';
  semanticRepresentation: SemanticRepresentationAuthorityV2;
  lexical: RetrievalExecutorIdV2[];
  sparse: RetrievalExecutorIdV2[];
  semantic: RetrievalExecutorIdV2[];
  ast: RetrievalExecutorIdV2[];
  graph: RetrievalExecutorIdV2[];
  rerank: RetrievalExecutorIdV2[];
  buildOnly: RetrievalExecutorIdV2[];
  candidateBudget: number;
  graphHops: number;
  oneVotePerLogicalLane: true;
  evidenceAuthority: false;
  canonicalWritesAllowed: false;
  decisions: string[];
}

function admitted(capabilities: readonly RetrievalExecutorCapabilityV2[]): Map<RetrievalExecutorIdV2, RetrievalExecutorCapabilityV2> {
  return new Map(capabilities.filter((c) => c.status === 'PROVEN_AVAILABLE').map((c) => [c.id, c]));
}

function push(target: RetrievalExecutorIdV2[], id: RetrievalExecutorIdV2, map: Map<RetrievalExecutorIdV2, RetrievalExecutorCapabilityV2>, representation?: SemanticRepresentationAuthorityV2): void {
  const capability = map.get(id);
  if (!capability) return;
  if (representation && !capability.supportedRepresentations.includes(representation)) return;
  if (!target.includes(id)) target.push(id);
}

export function compileRetrievalExecutorPlanV2(input: {
  classification: QueryClassificationV2;
  semanticRepresentation: SemanticRepresentationAuthorityV2;
  envelope: RetrievalResourceEnvelopeV2;
  capabilities?: readonly RetrievalExecutorCapabilityV2[];
}): RetrievalExecutorPlanV2 {
  const caps = input.capabilities ?? DEFAULT_RETRIEVAL_EXECUTOR_CAPABILITIES_V2;
  const map = admitted(caps);
  const c = input.classification;
  const lexical: RetrievalExecutorIdV2[] = [], sparse: RetrievalExecutorIdV2[] = [], semantic: RetrievalExecutorIdV2[] = [];
  const ast: RetrievalExecutorIdV2[] = [], graph: RetrievalExecutorIdV2[] = [], rerank: RetrievalExecutorIdV2[] = [], buildOnly: RetrievalExecutorIdV2[] = [];
  const decisions: string[] = [];

  if (c.retrievalNeed.lexical >= 0.35 || c.retrievalNeed.exactSymbol >= 0.35) push(lexical, 'postgres_fts', map);

  if (input.envelope.allowSparseNeural && c.retrievalNeed.lexical >= 0.5) {
    if (c.retrievalNeed.semantic >= 0.55 && c.retrievalNeed.exactSymbol < 0.8) push(sparse, 'qdrant_minicoil', map);
    else push(sparse, 'qdrant_bm25', map);
  }

  if (c.retrievalNeed.semantic >= 0.25 || c.abstained) {
    push(semantic, 'qdrant_hnsw', map, input.semanticRepresentation);
    if (input.envelope.gpuAvailable && input.envelope.allowGpuAnn) {
      push(semantic, 'cuvs_cagra', map, input.semanticRepresentation);
      push(semantic, 'cuvs_bruteforce', map, input.semanticRepresentation);
    }
    if (input.envelope.allowDiskAnn) push(semantic, 'diskann_vamana', map, input.semanticRepresentation);
    if (!semantic.some((id) => id === 'cuvs_bruteforce')) push(semantic, 'pgvector_exact', map, input.semanticRepresentation);
  }

  if (c.retrievalNeed.ast >= 0.35 || c.retrievalNeed.exactSymbol >= 0.65) push(ast, 'ast_structural', map);
  if (c.retrievalNeed.graph >= 0.35 && c.expectedDepth.graphHops > 0) push(graph, 'graph_bounded', map);
  if (input.envelope.allowReranker && c.expectedDepth.rerankBudget > 0 && c.confidence < 0.95) push(rerank, 'cross_encoder_reranker', map);
  push(buildOnly, 'cuvs_vamana_build', map, input.semanticRepresentation);

  if (semantic.length === 0 && (c.retrievalNeed.semantic >= 0.25 || c.abstained)) decisions.push('semantic_requested_but_no_proven_executor');
  if (sparse.length === 0 && input.envelope.allowSparseNeural && c.retrievalNeed.lexical >= 0.5) decisions.push('sparse_requested_but_no_proven_executor');

  return {
    schema:'atlas.retrieval-executor-plan.v2',
    semanticRepresentation: input.semanticRepresentation,
    lexical, sparse, semantic, ast, graph, rerank, buildOnly,
    candidateBudget: Math.max(8, Math.min(c.expectedDepth.candidateBudget, input.envelope.maxCandidates)),
    graphHops: Math.max(0, Math.min(c.expectedDepth.graphHops, input.envelope.maxGraphHops)),
    oneVotePerLogicalLane:true,
    evidenceAuthority:false,
    canonicalWritesAllowed:false,
    decisions,
  };
}
