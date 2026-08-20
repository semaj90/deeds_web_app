import { z } from 'zod';

const revision = z.string().min(1);

export const computeDagStageSchema = z.object({
  stage: z.enum([
    'candidate_nomination',
    'identity_promotion',
    'relationship_retrieval',
    'relation_chain_search',
    'personalized_graph_rank',
    'derived_tensor_rerank',
    'exact_evidence_promotion',
    'sufficient_context_gate',
    'ace_materialization',
  ]),
  allowed_executors: z.array(z.enum([
    'cpu_reference',
    'postgres',
    'qdrant',
    'pytorch_gemm',
    'libtorch_gemm',
    'cuvs_bruteforce',
    'cuvs_cagra',
    'networkx',
    'neo4j_gds',
    'cugraph',
    'turbovec',
    'model_reranker',
  ])).min(1),
  canonical_authority: z.boolean(),
  maximum_candidates: z.number().int().positive().nullable().optional(),
  maximum_hops: z.number().int().positive().nullable().optional(),
  maximum_fanout: z.number().int().positive().nullable().optional(),
  notes: z.array(z.string().min(1)).default([]),
}).strict();

export const computeDagPolicySchema = z.object({
  schema: z.literal('atlas.compute-dag-policy.v1').default('atlas.compute-dag-policy.v1'),
  policy_revision: revision,
  source_snapshot_revision: revision,
  semantic_metric: z.enum(['cosine', 'inner_product', 'sqeuclidean']),
  semantic_dimensions: z.literal(768).default(768),
  one_semantic_lane_one_vote: z.literal(true).default(true),
  relation_chain_max_hops: z.number().int().positive().max(4).default(2),
  relation_fanout_limit: z.number().int().positive().default(20),
  candidate_limit: z.number().int().positive().default(128),
  tensor_core_stages: z.array(z.enum(['candidate_nomination', 'derived_tensor_rerank'])).default(['candidate_nomination', 'derived_tensor_rerank']),
  stages: z.array(computeDagStageSchema).min(1),
  producer_revision: revision,
}).strict();

export type ComputeDagStageV1 = z.infer<typeof computeDagStageSchema>;
export type ComputeDagPolicyV1 = z.infer<typeof computeDagPolicySchema>;

/**
 * Default bounded execution policy. Canonical authority exists only at explicit
 * identity/evidence/materialization boundaries; ANN, PPR, low-rank, SOM,
 * interpolation, Tensor Core GEMM and learned rerankers remain derived compute.
 */
export function buildDefaultHypergraphComputeDag(input: {
  policy_revision: string;
  source_snapshot_revision: string;
  semantic_metric?: ComputeDagPolicyV1['semantic_metric'];
  candidate_limit?: number;
  relation_chain_max_hops?: number;
  relation_fanout_limit?: number;
  producer_revision: string;
}): ComputeDagPolicyV1 {
  const candidateLimit = input.candidate_limit ?? 128;
  const maxHops = input.relation_chain_max_hops ?? 2;
  const fanout = input.relation_fanout_limit ?? 20;
  return computeDagPolicySchema.parse({
    policy_revision: input.policy_revision,
    source_snapshot_revision: input.source_snapshot_revision,
    semantic_metric: input.semantic_metric ?? 'cosine',
    candidate_limit: candidateLimit,
    relation_chain_max_hops: maxHops,
    relation_fanout_limit: fanout,
    producer_revision: input.producer_revision,
    stages: [
      {
        stage: 'candidate_nomination',
        allowed_executors: ['postgres', 'qdrant', 'pytorch_gemm', 'libtorch_gemm', 'cuvs_bruteforce', 'cuvs_cagra', 'turbovec'],
        canonical_authority: false,
        maximum_candidates: candidateLimit,
        notes: ['All dense executors reconcile into one logical semantic vote.', 'Exact reference remains available as fallback.'],
      },
      {
        stage: 'identity_promotion',
        allowed_executors: ['postgres'],
        canonical_authority: true,
        maximum_candidates: candidateLimit,
        notes: ['Projection IDs and ordinals never become canonical IDs.'],
      },
      {
        stage: 'relationship_retrieval',
        allowed_executors: ['postgres', 'qdrant', 'cuvs_bruteforce', 'cuvs_cagra'],
        canonical_authority: false,
        maximum_candidates: candidateLimit,
        maximum_fanout: fanout,
        notes: ['N-ary relationship facts remain canonical in PostgreSQL; vector executors nominate relationship IDs only.'],
      },
      {
        stage: 'relation_chain_search',
        allowed_executors: ['cpu_reference', 'postgres', 'networkx', 'neo4j_gds', 'cugraph'],
        canonical_authority: false,
        maximum_hops: maxHops,
        maximum_fanout: fanout,
        notes: ['Traverse lossless entity↔relationship incidence structure; never HNSW/CAGRA proximity edges.'],
      },
      {
        stage: 'personalized_graph_rank',
        allowed_executors: ['cpu_reference', 'networkx', 'neo4j_gds', 'cugraph'],
        canonical_authority: false,
        maximum_hops: maxHops,
        notes: ['PPR/PageRank affect relevance/priority only.'],
      },
      {
        stage: 'derived_tensor_rerank',
        allowed_executors: ['cpu_reference', 'pytorch_gemm', 'libtorch_gemm', 'model_reranker'],
        canonical_authority: false,
        maximum_candidates: candidateLimit,
        notes: ['SVD/PCA/low-rank/Tang-inspired sampling/SOM/interpolation/CrossEncoder are challengers and derived signals.'],
      },
      {
        stage: 'exact_evidence_promotion',
        allowed_executors: ['postgres'],
        canonical_authority: true,
        maximum_candidates: candidateLimit,
        notes: ['Derived scores cannot create canonical relationships without evidence inspection/promotion.'],
      },
      {
        stage: 'sufficient_context_gate',
        allowed_executors: ['cpu_reference', 'postgres'],
        canonical_authority: false,
        notes: ['Decides retrieve-more versus synthesize; does not create facts.'],
      },
      {
        stage: 'ace_materialization',
        allowed_executors: ['postgres'],
        canonical_authority: true,
        notes: ['CanonicalAcePacketEnvelope remains packet identity owner; HyperGraph payload attaches validated evidence.'],
      },
    ],
  });
}
