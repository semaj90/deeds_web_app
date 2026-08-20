import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const RETRIEVAL_EVIDENCE_FAMILIES = ['LEXICAL', 'SEMANTIC', 'AST', 'GRAPH'] as const;
export const RETRIEVAL_EXECUTORS = [
  'QDRANT_BM25',
  'QDRANT_HNSW',
  'QDRANT_EXACT',
  'CUVS_BRUTE_FORCE',
  'CUVS_CAGRA',
  'CUVS_HNSW_CPU',
  'FAISS_CPU',
  'FAISS_GPU_CUVS',
  'VALKEY_HNSW',
  'VALKEY_FLAT',
  'POSTGRES_PGVECTOR_EXACT',
  'POSTGRES_PGVECTOR_HNSW',
] as const;

export const retrievalExecutorDescriptorSchema = z.object({
  executor_id: id,
  executor: z.enum(RETRIEVAL_EXECUTORS),
  evidence_family: z.enum(RETRIEVAL_EVIDENCE_FAMILIES),
  exact: z.boolean(),
  approximate: z.boolean(),
  mutable_index: z.boolean(),
  build_location: z.enum(['CPU', 'GPU', 'DATABASE']),
  search_location: z.enum(['CPU_RAM', 'GPU_VRAM', 'NVME_MMAP', 'DATABASE']),
  persistence: z.enum(['EPHEMERAL', 'LOCAL_NVME', 'DATABASE', 'VALKEY_RAM']),
  semantic_lane_vote: z.union([z.literal(0), z.literal(1)]),
  format_owner: z.enum(['QDRANT', 'CUVS', 'FAISS', 'VALKEY', 'PGVECTOR', 'NONE']),
  format_revision: revision.nullable().default(null),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.exact === value.approximate) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'executor must be exactly one of exact or approximate' });
  }
  if (value.evidence_family !== 'SEMANTIC' && value.semantic_lane_vote !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['semantic_lane_vote'], message: 'only semantic executors can participate in semantic-family voting' });
  }
});
export type RetrievalExecutorDescriptorV1 = z.infer<typeof retrievalExecutorDescriptorSchema>;

export const retrievalExecutorPolicySchema = z.object({
  schema: z.literal('atlas.retrieval-executor-policy.v1').default('atlas.retrieval-executor-policy.v1'),
  policy_revision: revision,
  lexical_owner: z.literal('QDRANT_BM25'),
  semantic_exact_oracle: z.literal('CUVS_BRUTE_FORCE'),
  semantic_lane_votes: z.literal(1),
  executors: z.array(retrievalExecutorDescriptorSchema).min(1),
  hnsw_interop: z.object({
    cuvs_cagra_to_hnsw_allowed: z.boolean().default(true),
    require_cpu_hierarchy_for_generic_hnswlib_compatibility: z.literal(true).default(true),
    serialization_is_experimental: z.literal(true).default(true),
    preferred_portable_interop: z.literal('FAISS_GPU_CUVS').default('FAISS_GPU_CUVS'),
  }).strict(),
  valkey_cache: z.object({
    role: z.literal('HOT_RETRIEVAL_CACHE'),
    vector_algorithm: z.enum(['HNSW', 'FLAT']).default('HNSW'),
    vector_dimension: z.union([z.literal(64), z.literal(128), z.literal(768)]).default(64),
    float_type: z.literal('FLOAT32').default('FLOAT32'),
    exact_source_of_truth: z.literal(false).default(false),
    cache_key_requires_revision: z.literal(true).default(true),
    cache_key_requires_checksum: z.literal(true).default(true),
  }).strict(),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  const semanticVotes = value.executors
    .filter((executor) => executor.evidence_family === 'SEMANTIC')
    .reduce((sum, executor) => sum + executor.semantic_lane_vote, 0);
  if (semanticVotes > value.semantic_lane_votes) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['executors'], message: 'semantic executors cannot inflate the single semantic-family vote' });
  }
});
export type RetrievalExecutorPolicyV1 = z.infer<typeof retrievalExecutorPolicySchema>;

export const retrievalIndexGenerationReceiptSchema = z.object({
  schema: z.literal('atlas.retrieval-index-generation-receipt.v1').default('atlas.retrieval-index-generation-receipt.v1'),
  receipt_id: id,
  executor: z.enum(RETRIEVAL_EXECUTORS),
  source_snapshot_revision: revision,
  semantic_snapshot_revision: revision.nullable().default(null),
  row_identity_checksum: checksum.nullable().default(null),
  index_generation: revision,
  build_parameters: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  source_vector_count: z.number().int().nonnegative(),
  source_dimension: z.number().int().positive().nullable().default(null),
  index_checksum: checksum.nullable().default(null),
  exact_oracle_receipt_id: id.nullable().default(null),
  recall_at_k: z.number().finite().min(0).max(1).nullable().default(null),
  status: z.enum(['WRITTEN_UNPROVEN', 'VERIFIED', 'REJECTED']),
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.status === 'VERIFIED' && value.executor !== 'CUVS_BRUTE_FORCE' && value.executor !== 'QDRANT_EXACT' && value.executor !== 'POSTGRES_PGVECTOR_EXACT' && value.exact_oracle_receipt_id === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['exact_oracle_receipt_id'], message: 'verified approximate executor requires exact-oracle receipt' });
  }
});
export type RetrievalIndexGenerationReceiptV1 = z.infer<typeof retrievalIndexGenerationReceiptSchema>;

export const retrievalCacheEntrySchema = z.object({
  schema: z.literal('atlas.retrieval-cache-entry.v1').default('atlas.retrieval-cache-entry.v1'),
  cache_key: z.string().min(1),
  cache_revision: revision,
  executor: z.enum(['VALKEY_HNSW', 'VALKEY_FLAT']),
  candidate_id: id,
  source_revision: revision,
  representation_revision: revision,
  row_identity_checksum: checksum,
  content_checksum: checksum,
  expires_at_epoch_ms: z.number().int().positive(),
  canonical_authority: z.literal(false).default(false),
}).strict();
export type RetrievalCacheEntryV1 = z.infer<typeof retrievalCacheEntrySchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function retrievalPolicyChecksum(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export function defaultRetrievalExecutorPolicy(policyRevision: string): RetrievalExecutorPolicyV1 {
  return retrievalExecutorPolicySchema.parse({
    policy_revision: policyRevision,
    lexical_owner: 'QDRANT_BM25',
    semantic_exact_oracle: 'CUVS_BRUTE_FORCE',
    semantic_lane_votes: 1,
    executors: [
      { executor_id: 'lexical:qdrant-bm25', executor: 'QDRANT_BM25', evidence_family: 'LEXICAL', exact: true, approximate: false, mutable_index: true, build_location: 'DATABASE', search_location: 'DATABASE', persistence: 'DATABASE', semantic_lane_vote: 0, format_owner: 'QDRANT', format_revision: null },
      { executor_id: 'semantic:cuvs-exact', executor: 'CUVS_BRUTE_FORCE', evidence_family: 'SEMANTIC', exact: true, approximate: false, mutable_index: false, build_location: 'GPU', search_location: 'GPU_VRAM', persistence: 'EPHEMERAL', semantic_lane_vote: 1, format_owner: 'CUVS', format_revision: null },
      { executor_id: 'semantic:cagra', executor: 'CUVS_CAGRA', evidence_family: 'SEMANTIC', exact: false, approximate: true, mutable_index: true, build_location: 'GPU', search_location: 'GPU_VRAM', persistence: 'LOCAL_NVME', semantic_lane_vote: 0, format_owner: 'CUVS', format_revision: null },
      { executor_id: 'semantic:cuvs-hnsw-cpu', executor: 'CUVS_HNSW_CPU', evidence_family: 'SEMANTIC', exact: false, approximate: true, mutable_index: true, build_location: 'GPU', search_location: 'CPU_RAM', persistence: 'LOCAL_NVME', semantic_lane_vote: 0, format_owner: 'CUVS', format_revision: null },
      { executor_id: 'semantic:faiss-cuvs', executor: 'FAISS_GPU_CUVS', evidence_family: 'SEMANTIC', exact: false, approximate: true, mutable_index: true, build_location: 'GPU', search_location: 'CPU_RAM', persistence: 'LOCAL_NVME', semantic_lane_vote: 0, format_owner: 'FAISS', format_revision: null },
      { executor_id: 'semantic:valkey-hot', executor: 'VALKEY_HNSW', evidence_family: 'SEMANTIC', exact: false, approximate: true, mutable_index: true, build_location: 'CPU', search_location: 'CPU_RAM', persistence: 'VALKEY_RAM', semantic_lane_vote: 0, format_owner: 'VALKEY', format_revision: null },
      { executor_id: 'semantic:pg-exact', executor: 'POSTGRES_PGVECTOR_EXACT', evidence_family: 'SEMANTIC', exact: true, approximate: false, mutable_index: true, build_location: 'DATABASE', search_location: 'DATABASE', persistence: 'DATABASE', semantic_lane_vote: 0, format_owner: 'PGVECTOR', format_revision: null },
      { executor_id: 'semantic:qdrant-hnsw', executor: 'QDRANT_HNSW', evidence_family: 'SEMANTIC', exact: false, approximate: true, mutable_index: true, build_location: 'DATABASE', search_location: 'NVME_MMAP', persistence: 'DATABASE', semantic_lane_vote: 0, format_owner: 'QDRANT', format_revision: null },
    ],
    hnsw_interop: {},
    valkey_cache: {},
    canonical_authority: false,
  });
}
