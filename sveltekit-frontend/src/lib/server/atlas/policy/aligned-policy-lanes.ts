import { z } from 'zod';

/**
 * Alignment boundary for Parent Atlas policy inputs.
 *
 * Representation/signal/executor/runtime remain independent identities:
 * - BM25/BM42 are lexical sparse signals, not inverses of dense embeddings.
 * - cosine/semantic_768 are semantic signals.
 * - PageRank/HITS/Leiden/KAG/hypergraph facts are graph/relational signals.
 * - HMM/Viterbi describe workflow-state sequencing, not retrieval evidence.
 * - DSPy may optimize a shadow program/policy, but cannot bypass legal state
 *   transitions, exact-promotion gates, or mutation validation.
 */
export const AtlasLogicalLaneSchema = z.enum([
  'lexical',
  'semantic',
  'ast',
  'graph',
  'hypergraph',
  'policy',
  'model',
  'tool',
]);
export type AtlasLogicalLane = z.infer<typeof AtlasLogicalLaneSchema>;

export const AlignedSignalKindSchema = z.enum([
  'BM25',
  'BM42_EXPERIMENTAL',
  'POSTGRES_TS_RANK',
  'DENSE_COSINE',
  'LATENT_128',
  'LATENT_64',
  'AST_EVIDENCE',
  'PAGERANK',
  'HITS_HUB',
  'HITS_AUTHORITY',
  'LEIDEN_COMMUNITY',
  'KAG_RELATION',
  'NARY_HYPEREDGE',
  'QUATERNION_AFFINITY',
  'HMM_POSTERIOR',
  'VITERBI_STATE_PATH',
  'EXECUTION_SUCCESS',
  'RESOURCE_PRESSURE',
]);
export type AlignedSignalKind = z.infer<typeof AlignedSignalKindSchema>;

export const SignalAuthoritySchema = z.enum([
  'CANONICAL_FACT',
  'EXACT_RETRIEVAL_SCORE',
  'APPROXIMATE_RETRIEVAL_SCORE',
  'DERIVED_FEATURE',
  'POLICY_STATE_ONLY',
]);

export const AlignedPolicySignalV1Schema = z.object({
  kind: AlignedSignalKindSchema,
  logicalLane: AtlasLogicalLaneSchema,
  authority: SignalAuthoritySchema,
  value: z.number().finite().nullable(),
  representationId: z.string().min(1).nullable(),
  representationRevision: z.string().min(1).nullable(),
  algorithmRevision: z.string().min(1),
  evidenceRefs: z.array(z.string().min(1)).max(128),
}).strict().superRefine((signal, ctx) => {
  if ((signal.kind === 'BM25' || signal.kind === 'BM42_EXPERIMENTAL' || signal.kind === 'POSTGRES_TS_RANK') && signal.logicalLane !== 'lexical') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['logicalLane'], message: 'sparse/term ranking belongs to lexical lane' });
  }
  if ((signal.kind === 'DENSE_COSINE' || signal.kind === 'LATENT_128' || signal.kind === 'LATENT_64') && signal.logicalLane !== 'semantic') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['logicalLane'], message: 'dense/latent signal belongs to semantic lane' });
  }
  if ((signal.kind === 'PAGERANK' || signal.kind === 'HITS_HUB' || signal.kind === 'HITS_AUTHORITY' || signal.kind === 'LEIDEN_COMMUNITY' || signal.kind === 'KAG_RELATION') && signal.logicalLane !== 'graph') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['logicalLane'], message: 'graph analytics must remain in the graph vote group' });
  }
  if (signal.kind === 'NARY_HYPEREDGE' && signal.logicalLane !== 'hypergraph') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['logicalLane'], message: 'n-ary incidence belongs to hypergraph lane' });
  }
  if ((signal.kind === 'HMM_POSTERIOR' || signal.kind === 'VITERBI_STATE_PATH') && (signal.logicalLane !== 'policy' || signal.authority !== 'POLICY_STATE_ONLY')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['authority'], message: 'HMM/Viterbi are policy-state signals, not retrieval authority' });
  }
  if ((signal.kind === 'LATENT_128' || signal.kind === 'LATENT_64') && signal.authority !== 'DERIVED_FEATURE') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['authority'], message: 'latent128/64 remain derived routing features until explicit promotion' });
  }
  if (signal.kind === 'BM42_EXPERIMENTAL' && signal.authority === 'CANONICAL_FACT') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['authority'], message: 'BM42 is a retrieval signal, never a canonical fact' });
  }
});
export type AlignedPolicySignalV1 = z.infer<typeof AlignedPolicySignalV1Schema>;

export const AtlasGpuPrimitiveSchema = z.enum([
  'CUBLASLT_GEMM',
  'CUBLASDX_FUSED_GEMM',
  'CUVS_BRUTE_FORCE',
  'CUVS_CAGRA',
  'CUGRAPH_PAGERANK',
  'CUGRAPH_HITS',
  'CUGRAPH_LEIDEN',
  'CUGRAPH_BFS_SSSP',
  'PYTORCH_TOPK',
  'PYTORCH_ENCODER',
  'PYTORCH_CROSS_ENCODER',
  'TRITON_CUSTOM',
  'CPU_SERVICE',
]);
export type AtlasGpuPrimitive = z.infer<typeof AtlasGpuPrimitiveSchema>;

export const AtlasOperationKindSchema = z.enum([
  'LEXICAL_RETRIEVAL',
  'DENSE_EXACT_SEARCH',
  'DENSE_ANN_SEARCH',
  'LOW_RANK_PROJECTION',
  'FEATURE_RERANK',
  'CROSS_ENCODER_RERANK',
  'GRAPH_AUTHORITY',
  'GRAPH_HUB_AUTHORITY',
  'GRAPH_COMMUNITY',
  'GRAPH_TRAVERSAL',
  'NEURAL_ENCODING',
]);
export type AtlasOperationKind = z.infer<typeof AtlasOperationKindSchema>;

/** Executor preference only; it does not create a new logical evidence lane. */
export function preferredAtlasPrimitive(operation: AtlasOperationKind): AtlasGpuPrimitive {
  switch (operation) {
    case 'LEXICAL_RETRIEVAL': return 'CPU_SERVICE';
    case 'DENSE_EXACT_SEARCH': return 'CUVS_BRUTE_FORCE';
    case 'DENSE_ANN_SEARCH': return 'CUVS_CAGRA';
    case 'LOW_RANK_PROJECTION':
    case 'FEATURE_RERANK': return 'CUBLASLT_GEMM';
    case 'CROSS_ENCODER_RERANK': return 'PYTORCH_CROSS_ENCODER';
    case 'GRAPH_AUTHORITY': return 'CUGRAPH_PAGERANK';
    case 'GRAPH_HUB_AUTHORITY': return 'CUGRAPH_HITS';
    case 'GRAPH_COMMUNITY': return 'CUGRAPH_LEIDEN';
    case 'GRAPH_TRAVERSAL': return 'CUGRAPH_BFS_SSSP';
    case 'NEURAL_ENCODING': return 'PYTORCH_ENCODER';
  }
}

export const DspyPolicyAuthorityV1Schema = z.object({
  schema: z.literal('atlas.dspy-policy-authority.v1'),
  mode: z.enum(['OFF', 'SHADOW', 'CHALLENGER']),
  mayChooseAmongAllowedActions: z.boolean(),
  mayChangeLegalHmmTransitions: z.literal(false),
  mayBypassExactPromotion: z.literal(false),
  mayAuthorizeMutation: z.literal(false),
  mayCreateCanonicalFacts: z.literal(false),
  optimizerRevision: z.string().min(1).nullable(),
  heldOutMetricRevision: z.string().min(1).nullable(),
  producerRevision: z.string().min(1),
}).strict();
export type DspyPolicyAuthorityV1 = z.infer<typeof DspyPolicyAuthorityV1Schema>;

export function dspyShadowAuthority(input: {
  optimizerRevision?: string | null;
  heldOutMetricRevision?: string | null;
  producerRevision: string;
}): DspyPolicyAuthorityV1 {
  return DspyPolicyAuthorityV1Schema.parse({
    schema: 'atlas.dspy-policy-authority.v1',
    mode: 'SHADOW',
    mayChooseAmongAllowedActions: true,
    mayChangeLegalHmmTransitions: false,
    mayBypassExactPromotion: false,
    mayAuthorizeMutation: false,
    mayCreateCanonicalFacts: false,
    optimizerRevision: input.optimizerRevision ?? null,
    heldOutMetricRevision: input.heldOutMetricRevision ?? null,
    producerRevision: input.producerRevision,
  });
}

export const PrefillDecodeAlignmentV1Schema = z.object({
  schema: z.literal('atlas.prefill-decode-alignment.v1'),
  prefill: z.object({
    denseGemmPriority: z.literal(true),
    contextManifestRequired: z.literal(true),
    exactPromotedEvidenceRequired: z.literal(true),
  }).strict(),
  decode: z.object({
    recurrentStatePreserved: z.literal(true),
    fullAttentionKvCacheAccountedSeparately: z.literal(true),
    schedulerRuntimeOwnsBatching: z.boolean(),
  }).strict(),
  rerankerBeforePrefill: z.literal(true),
  producerRevision: z.string().min(1),
}).strict();

export function buildPrefillDecodeAlignment(input: {
  schedulerRuntimeOwnsBatching: boolean;
  producerRevision: string;
}) {
  return PrefillDecodeAlignmentV1Schema.parse({
    schema: 'atlas.prefill-decode-alignment.v1',
    prefill: { denseGemmPriority: true, contextManifestRequired: true, exactPromotedEvidenceRequired: true },
    decode: {
      recurrentStatePreserved: true,
      fullAttentionKvCacheAccountedSeparately: true,
      schedulerRuntimeOwnsBatching: input.schedulerRuntimeOwnsBatching,
    },
    rerankerBeforePrefill: true,
    producerRevision: input.producerRevision,
  });
}
