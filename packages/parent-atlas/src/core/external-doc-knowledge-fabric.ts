import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const EXTERNAL_DOC_FETCHERS = [
  'FIRECRAWL_V2',
  'BEAUTIFULSOUP_HTTP',
  'LDR_DISCOVERY',
] as const;

export const externalDocSourceSchema = z.object({
  schema: z.literal('atlas.external-doc-source.v1').default('atlas.external-doc-source.v1'),
  source_id: id,
  source_revision: revision,
  title: z.string().min(1),
  base_urls: z.array(z.string().url()).min(1),
  allowed_domains: z.array(z.string().min(1)).min(1),
  authority_class: z.enum(['OFFICIAL_PRIMARY', 'PRIMARY_PROJECT', 'REPUTABLE_SECONDARY', 'DISCOVERY_ONLY']),
  default_fetcher: z.enum(EXTERNAL_DOC_FETCHERS),
  output_namespace: z.string().regex(/^docs\/\.okf\/[a-zA-Z0-9_./-]+$/),
  include_paths: z.array(z.string()).default([]),
  exclude_paths: z.array(z.string()).default([]),
  maximum_pages: z.number().int().positive().max(100_000).default(500),
  maximum_depth: z.number().int().nonnegative().max(16).default(4),
  canonical_authority: z.literal(false).default(false),
}).strict();
export type ExternalDocSourceV1 = z.infer<typeof externalDocSourceSchema>;

export const externalDocFetchReceiptSchema = z.object({
  schema: z.literal('atlas.external-doc-fetch-receipt.v1').default('atlas.external-doc-fetch-receipt.v1'),
  fetch_id: id,
  source_id: id,
  source_revision: revision,
  requested_url: z.string().url(),
  resolved_url: z.string().url(),
  fetcher: z.enum(EXTERNAL_DOC_FETCHERS),
  http_status: z.number().int().min(100).max(599),
  content_type: z.string().min(1).nullable().default(null),
  etag: z.string().min(1).nullable().default(null),
  last_modified: z.string().min(1).nullable().default(null),
  fetched_at: z.string().datetime(),
  raw_content_checksum: checksum,
  normalized_content_checksum: checksum,
  parser: z.string().min(1),
  parser_revision: revision,
  title: z.string().min(1),
  language: z.string().min(1).default('en'),
  outgoing_urls: z.array(z.string().url()).max(20_000).default([]),
  canonical_authority: z.literal(false).default(false),
}).strict();
export type ExternalDocFetchReceiptV1 = z.infer<typeof externalDocFetchReceiptSchema>;

export const DOC_DOMAIN_CLASSES = [
  'documentation', 'api', 'retrieval', 'graph', 'gpu', 'database', 'cache', 'agent',
  'workflow', 'protocol', 'security', 'testing', 'training', 'model_runtime', 'configuration',
  'error_fixing', 'other',
] as const;

export const DOC_ONTOLOGY_CLASSES = [
  'API', 'ENDPOINT', 'TYPE', 'FUNCTION', 'CLASS', 'MODULE', 'CONFIG', 'ERROR', 'ALGORITHM',
  'MODEL', 'TRAINING', 'RETRIEVAL', 'GRAPH', 'RELATIONSHIP', 'STORAGE', 'PROTOCOL', 'SECURITY',
  'TEST', 'METRIC', 'TOOL', 'WORKFLOW', 'CONCEPT', 'OTHER',
] as const;

export const lexicalTokenEvidenceSchema = z.object({
  token_id: id,
  text: z.string().min(1),
  lemma: z.string().min(1).nullable().default(null),
  upos: z.string().min(1).nullable().default(null),
  xpos: z.string().min(1).nullable().default(null),
  morphology: z.string().nullable().default(null),
  dependency_relation: z.string().min(1).nullable().default(null),
  head_token_index: z.number().int().nonnegative().nullable().default(null),
  start_char: z.number().int().nonnegative(),
  end_char: z.number().int().positive(),
  producer: z.enum(['STANZA', 'RULE_BASED']),
  producer_revision: revision,
  model_revision: revision.nullable().default(null),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.end_char <= value.start_char) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['end_char'], message: 'end_char must be greater than start_char' });
  }
  if (value.producer === 'STANZA' && value.model_revision === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['model_revision'], message: 'Stanza evidence must record model_revision' });
  }
});
export type LexicalTokenEvidenceV1 = z.infer<typeof lexicalTokenEvidenceSchema>;

export const ontologyParticipantSchema = z.object({
  role: z.string().min(1),
  text: z.string().min(1),
  normalized_text: z.string().min(1),
  ontology_class: z.enum(DOC_ONTOLOGY_CLASSES),
  start_char: z.number().int().nonnegative().nullable().default(null),
  end_char: z.number().int().positive().nullable().default(null),
}).strict().superRefine((value, ctx) => {
  if ((value.start_char === null) !== (value.end_char === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['start_char'], message: 'participant span must be fully present or absent' });
  }
  if (value.start_char !== null && value.end_char !== null && value.end_char <= value.start_char) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['end_char'], message: 'participant end_char must exceed start_char' });
  }
});

export const ontologyTupleSchema = z.object({
  schema: z.literal('atlas.external-doc-ontology-tuple.v1').default('atlas.external-doc-ontology-tuple.v1'),
  tuple_id: id,
  predicate: z.string().min(1),
  predicate_lemma: z.string().min(1).nullable().default(null),
  participants: z.array(ontologyParticipantSchema).min(2).max(32),
  degree: z.number().int().min(2).max(32),
  extraction_method: z.enum(['STANZA_DEPENDENCY', 'RULE_PATTERN', 'LANGEXTRACT_GROUNDED']),
  evidence_span_refs: z.array(id).min(1),
  confidence: z.number().finite().min(0).max(1),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.degree !== value.participants.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['degree'], message: 'degree must equal participants.length' });
  }
});
export type OntologyTupleV1 = z.infer<typeof ontologyTupleSchema>;

export const externalDocChunkSchema = z.object({
  schema: z.literal('atlas.external-doc-chunk.v1').default('atlas.external-doc-chunk.v1'),
  chunk_id: id,
  source_id: id,
  source_revision: revision,
  fetch_id: id,
  source_url: z.string().url(),
  document_checksum: checksum,
  chunk_checksum: checksum,
  ordinal: z.number().int().nonnegative(),
  heading_path: z.array(z.string().min(1)).max(16).default([]),
  start_char: z.number().int().nonnegative(),
  end_char: z.number().int().positive(),
  text: z.string().min(1),
  language: z.string().min(1).default('en'),
  domain_class: z.enum(DOC_DOMAIN_CLASSES),
  ontology_classes: z.array(z.enum(DOC_ONTOLOGY_CLASSES)).default([]),
  lexical_tokens: z.array(lexicalTokenEvidenceSchema).max(8192).default([]),
  ontology_tuples: z.array(ontologyTupleSchema).max(2048).default([]),
  outgoing_urls: z.array(z.string().url()).max(4096).default([]),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.end_char <= value.start_char) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['end_char'], message: 'chunk end_char must exceed start_char' });
  }
});
export type ExternalDocChunkV1 = z.infer<typeof externalDocChunkSchema>;

export const externalDocDerivedFeaturesSchema = z.object({
  schema: z.literal('atlas.external-doc-derived-features.v1').default('atlas.external-doc-derived-features.v1'),
  chunk_id: id,
  feature_revision: revision,
  semantic_snapshot_revision: revision,
  semantic_dimension: z.literal(768),
  embedding_checksum: checksum,
  low_rank_revision: revision.nullable().default(null),
  low_rank_rank: z.number().int().positive().max(768).nullable().default(null),
  low_rank_row_l2_sq: z.number().finite().nonnegative().nullable().default(null),
  tang_sampling_weight: z.number().finite().min(0).max(1).nullable().default(null),
  pagerank: z.number().finite().nonnegative().nullable().default(null),
  ppr: z.number().finite().nonnegative().nullable().default(null),
  kmeans_cluster: z.number().int().nonnegative().nullable().default(null),
  kmeans_probability: z.number().finite().min(0).max(1).nullable().default(null),
  som_row: z.number().int().min(0).max(19).nullable().default(null),
  som_column: z.number().int().min(0).max(19).nullable().default(null),
  hamming_signature_checksum: checksum.nullable().default(null),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if ((value.som_row === null) !== (value.som_column === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['som_row'], message: 'SOM row/column must be present together' });
  }
  if ((value.low_rank_rank === null) !== (value.low_rank_revision === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['low_rank_rank'], message: 'low-rank rank/revision must be present together' });
  }
});
export type ExternalDocDerivedFeaturesV1 = z.infer<typeof externalDocDerivedFeaturesSchema>;

export const qdrantExternalDocsProjectionPlanSchema = z.object({
  schema: z.literal('atlas.qdrant-external-docs-projection-plan.v1').default('atlas.qdrant-external-docs-projection-plan.v1'),
  collection: z.literal('external_programming_docs_768').default('external_programming_docs_768'),
  projection_revision: revision,
  vector_dimension: z.literal(768),
  distance: z.enum(['Cosine', 'Dot']).default('Cosine'),
  retain_original_vectors: z.literal(true).default(true),
  quantization: z.enum(['NONE', 'SCALAR_INT8', 'BINARY_2BIT', 'TURBOQUANT', 'PRODUCT']),
  quantized_search_rescore: z.literal(true).default(true),
  oversampling: z.number().finite().min(1).max(16).default(2),
  payload_indexes: z.array(z.enum([
    'source_id', 'source_revision', 'domain_class', 'ontology_classes', 'language',
    'kmeans_cluster', 'som_cell', 'document_checksum', 'chunk_checksum', 'producer_revision',
  ])).default([
    'source_id', 'source_revision', 'domain_class', 'ontology_classes', 'language',
    'kmeans_cluster', 'som_cell', 'document_checksum', 'chunk_checksum',
  ]),
  strict_filtering_required: z.boolean().default(true),
  canonical_authority: z.literal(false).default(false),
}).strict();
export type QdrantExternalDocsProjectionPlanV1 = z.infer<typeof qdrantExternalDocsProjectionPlanSchema>;

export const externalDocsRetrievalPlanSchema = z.object({
  schema: z.literal('atlas.external-docs-retrieval-plan.v1').default('atlas.external-docs-retrieval-plan.v1'),
  plan_revision: revision,
  query_id: id,
  query_revision: revision,
  maximum_candidates: z.number().int().positive().max(100_000),
  semantic_prefetch_k: z.number().int().positive().max(100_000),
  exact_refine_k: z.number().int().positive().max(10_000),
  maximum_relation_hops: z.number().int().nonnegative().max(8).default(2),
  use_qdrant_hybrid_prefetch: z.boolean().default(true),
  use_quantized_prefetch: z.boolean().default(true),
  use_low_rank_sampling_challenger: z.boolean().default(true),
  use_pagerank_prior: z.boolean().default(true),
  use_nary_incidence_hops: z.boolean().default(true),
  use_kmeans_cluster_prior: z.boolean().default(true),
  use_som_neighborhood_prior: z.boolean().default(true),
  semantic_lane_votes: z.literal(1).default(1),
  exact_semantic_refinement_required: z.literal(true).default(true),
  exact_source_promotion_required: z.literal(true).default(true),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.exact_refine_k > value.semantic_prefetch_k) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['exact_refine_k'], message: 'exact_refine_k cannot exceed semantic_prefetch_k' });
  }
  if (value.semantic_prefetch_k > value.maximum_candidates) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['semantic_prefetch_k'], message: 'semantic_prefetch_k cannot exceed maximum_candidates' });
  }
});
export type ExternalDocsRetrievalPlanV1 = z.infer<typeof externalDocsRetrievalPlanSchema>;

export const externalDocsInferenceAlignmentSchema = z.object({
  schema: z.literal('atlas.external-docs-inference-alignment.v1').default('atlas.external-docs-inference-alignment.v1'),
  alignment_revision: revision,
  inference_runtime_id: id,
  inference_runtime_revision: revision,
  model_id: id,
  model_revision: revision,
  adapter_id: id.nullable().default(null),
  adapter_revision: revision.nullable().default(null),
  embedding_model_revision: revision,
  retrieval_plan_revision: revision,
  context_manifest_checksum: checksum,
  evidence_snapshot_revision: revision,
  qlora_training_examples_allowed: z.boolean().default(false),
  required_claim_verification_receipt_ids: z.array(id).default([]),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if ((value.adapter_id === null) !== (value.adapter_revision === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['adapter_id'], message: 'adapter id/revision must be present together' });
  }
  if (value.qlora_training_examples_allowed && value.required_claim_verification_receipt_ids.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['required_claim_verification_receipt_ids'], message: 'QLoRA examples require verified-claim receipts' });
  }
});
export type ExternalDocsInferenceAlignmentV1 = z.infer<typeof externalDocsInferenceAlignmentSchema>;

export const externalDocFabricManifestSchema = z.object({
  schema: z.literal('atlas.external-doc-fabric-manifest.v1').default('atlas.external-doc-fabric-manifest.v1'),
  manifest_revision: revision,
  workspace_revision: revision,
  source_snapshot_revision: revision,
  sources: z.array(externalDocSourceSchema).min(1),
  qdrant_projection: qdrantExternalDocsProjectionPlanSchema,
  som_grid: z.object({ rows: z.literal(20), columns: z.literal(20) }).default({ rows: 20, columns: 20 }),
  default_kmeans_clusters: z.number().int().positive().max(4096).default(64),
  default_low_rank: z.number().int().positive().max(768).default(64),
  producer_revision: revision,
  manifest_checksum: checksum,
}).strict();
export type ExternalDocFabricManifestV1 = z.infer<typeof externalDocFabricManifestSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function checksumExternalDocFabric(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export function buildExternalDocFabricManifest(
  input: Omit<z.input<typeof externalDocFabricManifestSchema>, 'schema' | 'manifest_checksum'>,
): ExternalDocFabricManifestV1 {
  const raw = { schema: 'atlas.external-doc-fabric-manifest.v1' as const, ...input };
  const manifest_checksum = checksumExternalDocFabric({ ...raw, manifest_checksum: undefined });
  return externalDocFabricManifestSchema.parse({ ...raw, manifest_checksum });
}

export function describeExternalDocKnowledgeFabric(): string {
  return [
    'External documentation is fetched into revisioned source artifacts; Firecrawl, BeautifulSoup and LDR discovery are transport/discovery mechanisms, never truth authorities.',
    'Stanza/POS, ontology tuples, semantic embeddings, PageRank/PPR, low-rank sampling, KMeans, SOM and Hamming signatures are derived observations joined by chunk identity and source revision.',
    'semantic_768 remains the full semantic representation; low-rank and quantized forms nominate candidates and must be refined against original vectors and exact source content.',
    'N-ary tuples preserve participant roles; graph traversal uses source links or relation incidence rather than promoting KNN proximity into canonical relationships.',
    'Qdrant is a retrieval projection with indexed payload filters; verified evidence, not scraped text or ranking scores alone, is required before QLoRA target creation or canonical mutation.',
  ].join(' ');
}
