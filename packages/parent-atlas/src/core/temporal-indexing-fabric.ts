import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const isoTimestamp = z.string().datetime({ offset: true });
const utf8Span = z.object({
  start_byte: z.number().int().nonnegative(),
  end_byte: z.number().int().nonnegative(),
}).strict().superRefine((value, ctx) => {
  if (value.end_byte < value.start_byte) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['end_byte'], message: 'end_byte must be >= start_byte' });
  }
});

/** Stable file identity and its exact admitted bytes. Derived consumers must retain this envelope. */
export const sourceArtifactSchema = z.object({
  schema: z.literal('atlas.source-artifact.v1').default('atlas.source-artifact.v1'),
  file_id: id,
  repo_id: id,
  workspace_revision: revision,
  canonical_source_ref: z.string().min(1),
  source_revision: revision,
  content_digest: checksum,
  byte_length: z.number().int().nonnegative(),
  mime_type: z.string().min(1),
  language: z.string().min(1),
  predecessor_source_revision: revision.nullable().default(null),
  supersedes_source_revision: revision.nullable().default(null),
  observed_at: isoTimestamp,
  admitted_at: isoTimestamp.nullable().default(null),
  retired_at: isoTimestamp.nullable().default(null),
  producer_id: id,
  producer_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.retired_at !== null && value.admitted_at !== null && value.retired_at < value.admitted_at) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['retired_at'], message: 'retired_at cannot precede admitted_at' });
  }
});
export type SourceArtifactV1 = z.infer<typeof sourceArtifactSchema>;

/** UTF-8 bytes are authoritative; editor UTF-16 positions are an optional projection only. */
export const sourceCoordinateMapSchema = z.object({
  schema: z.literal('atlas.source-coordinate-map.v1').default('atlas.source-coordinate-map.v1'),
  source_revision: revision,
  content_digest: checksum,
  offset_basis: z.literal('UTF8_SOURCE_BYTES_V1').default('UTF8_SOURCE_BYTES_V1'),
  line_starts_byte: z.array(z.number().int().nonnegative()).min(1),
  utf16_projection_revision: revision.nullable().default(null),
  coordinate_checksum: checksum,
  canonical_authority: z.literal(false).default(false),
}).strict();
export type SourceCoordinateMapV1 = z.infer<typeof sourceCoordinateMapSchema>;

export const documentObservationSchema = z.object({
  schema: z.literal('atlas.document-observation.v1').default('atlas.document-observation.v1'),
  observation_id: id,
  observation_kind: z.enum(['SECTION', 'HEADING', 'PARAGRAPH', 'AST_NODE', 'DIAGNOSTIC', 'CLAIM', 'LINK', 'TABLE', 'LOG_EVENT']),
  source_ref: z.string().min(1),
  source_revision: revision,
  workspace_revision: revision,
  span: utf8Span,
  utf16_projection: z.object({
    start_line: z.number().int().nonnegative(),
    start_character: z.number().int().nonnegative(),
    end_line: z.number().int().nonnegative(),
    end_character: z.number().int().nonnegative(),
  }).strict().nullable().default(null),
  text_checksum: checksum,
  producer_id: id,
  producer_revision: revision,
  evidence_refs: z.array(id).min(1),
  representation_revision: revision.nullable().default(null),
  canonical_authority: z.literal(false).default(false),
  observation_checksum: checksum,
}).strict();
export type DocumentObservationV1 = z.infer<typeof documentObservationSchema>;

export const knowledgeClaimSchema = z.object({
  schema: z.literal('atlas.knowledge-claim.v1').default('atlas.knowledge-claim.v1'),
  claim_id: id,
  claim_kind: z.enum(['FACT', 'OWNERSHIP', 'BEHAVIOR', 'CONTRACT', 'CHANGE', 'RECOMMENDATION', 'DIAGNOSTIC']),
  statement: z.string().min(1),
  evidence_refs: z.array(id).min(1),
  source_revision_set: z.array(revision).min(1),
  producer_id: id,
  producer_revision: revision,
  confidence: z.number().finite().min(0).max(1),
  authority_class: z.enum(['OBSERVATION', 'PROVISIONAL', 'REVIEWED', 'CANONICAL']),
  first_observed_revision: revision,
  last_confirmed_revision: revision,
  status: z.enum(['CURRENT', 'STALE_EVIDENCE', 'CONTRADICTED', 'SUPERSEDED', 'UNVERIFIED']),
  checksum,
  canonical_authority: z.literal(false).default(false),
}).strict();
export type KnowledgeClaimV1 = z.infer<typeof knowledgeClaimSchema>;

export const runManifestSchema = z.object({
  schema: z.literal('atlas.run-manifest.v1').default('atlas.run-manifest.v1'),
  run_id: id,
  request_id: id,
  workspace_revision: revision,
  producer_id: id,
  producer_revision: revision,
  input_refs: z.array(id).min(1),
  output_refs: z.array(id).default([]),
  started_at: isoTimestamp,
  completed_at: isoTimestamp.nullable().default(null),
  status: z.enum(['RUNNING', 'SUCCEEDED', 'FAILED', 'BLOCKED']),
  manifest_checksum: checksum,
  canonical_authority: z.literal(false).default(false),
}).strict();
export type RunManifestV1 = z.infer<typeof runManifestSchema>;

export const temporalDocumentIndexSchema = z.object({
  schema: z.literal('atlas.temporal-document-index.v1').default('atlas.temporal-document-index.v1'),
  index_id: id,
  workspace_revision: revision,
  source_snapshot_revision: revision,
  artifact_refs: z.array(id),
  observation_refs: z.array(id),
  claim_refs: z.array(id),
  delta_refs: z.array(id),
  source_revision_set_checksum: checksum,
  index_checksum: checksum,
  status: z.enum(['DRAFT', 'VALID', 'BLOCKED']),
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict();
export type TemporalDocumentIndexV1 = z.infer<typeof temporalDocumentIndexSchema>;

export const sourceChangedRangeSchema = z.object({
  start_byte: z.number().int().nonnegative(),
  old_end_byte: z.number().int().nonnegative(),
  new_end_byte: z.number().int().nonnegative(),
}).strict().superRefine((value, ctx) => {
  if (value.old_end_byte < value.start_byte || value.new_end_byte < value.start_byte) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'changed range endpoints must be >= start_byte' });
  }
});

export const sourceRevisionDeltaSchema = z.object({
  schema: z.literal('atlas.source-revision-delta.v1').default('atlas.source-revision-delta.v1'),
  source_ref: z.string().min(1),
  change_kind: z.enum(['ADDED', 'MODIFIED', 'DELETED', 'MOVED', 'UNCHANGED']),
  before_source_ref: z.string().min(1).nullable().default(null),
  before_revision: revision.nullable().default(null),
  after_revision: revision.nullable().default(null),
  before_checksum: checksum.nullable().default(null),
  after_checksum: checksum.nullable().default(null),
  changed_ranges: z.array(sourceChangedRangeSchema).default([]),
  semantic_dependents: z.array(z.string().min(1)).default([]),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.change_kind === 'UNCHANGED' && value.before_checksum !== value.after_checksum) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['change_kind'], message: 'UNCHANGED requires identical checksums' });
  }
  if (value.change_kind === 'ADDED' && (value.before_revision !== null || value.before_checksum !== null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['before_revision'], message: 'ADDED cannot carry before identity' });
  }
  if (value.change_kind === 'DELETED' && (value.after_revision !== null || value.after_checksum !== null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['after_revision'], message: 'DELETED cannot carry after identity' });
  }
  if (value.change_kind === 'MOVED' && value.before_source_ref === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['before_source_ref'], message: 'MOVED requires before_source_ref' });
  }
});
export type SourceRevisionDeltaV1 = z.infer<typeof sourceRevisionDeltaSchema>;

export const corpusCompressionPolicySchema = z.object({
  schema: z.literal('atlas.corpus-compression-policy.v1').default('atlas.corpus-compression-policy.v1'),
  policy_revision: revision,
  logical_dedupe: z.literal('SHA256_CONTENT_ADDRESS').default('SHA256_CONTENT_ADDRESS'),
  arrow_repeated_value_encoding: z.enum(['DICTIONARY', 'RUN_END', 'NONE']).default('DICTIONARY'),
  sparse_boolean_encoding: z.enum(['BITPACKED', 'CSR', 'COO']).default('BITPACKED'),
  ipc_compression: z.enum(['ZSTD', 'LZ4', 'NONE']).default('ZSTD'),
  direct_huffman_storage_contract: z.literal(false).default(false),
  logical_checksum_precedes_compression: z.literal(true).default(true),
  canonical_authority: z.literal(false).default(false),
}).strict();
export type CorpusCompressionPolicyV1 = z.infer<typeof corpusCompressionPolicySchema>;

export const visualObjectObservationSchema = z.object({
  schema: z.literal('atlas.visual-object-observation.v1').default('atlas.visual-object-observation.v1'),
  observation_id: id,
  source_ref: z.string().min(1),
  source_revision: revision,
  image_checksum: checksum,
  frame_ordinal: z.number().int().nonnegative().default(0),
  detector_family: z.enum(['TORCHVISION', 'NVIDIA_TAO', 'TENSORRT_ONNX', 'OTHER']),
  detector_model_revision: revision,
  class_label: z.string().min(1),
  confidence: z.number().finite().min(0).max(1),
  box_xyxy_pixels: z.tuple([
    z.number().finite().nonnegative(), z.number().finite().nonnegative(),
    z.number().finite().nonnegative(), z.number().finite().nonnegative(),
  ]),
  crop_checksum: checksum.nullable().default(null),
  evidence_refs: z.array(id).default([]),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  const [x1, y1, x2, y2] = value.box_xyxy_pixels;
  if (x2 <= x1 || y2 <= y1) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['box_xyxy_pixels'], message: 'object box must have positive area' });
  }
});
export type VisualObjectObservationV1 = z.infer<typeof visualObjectObservationSchema>;

export const MODALITY_OWNERS = [
  'TREE_SITTER_SYNTAX',
  'TREESITTER_CHUNKER_STRUCTURE',
  'TS_MORPH_TYPESCRIPT_SEMANTICS',
  'AST_GREP_PATTERN',
  'STANZA_LEXICAL',
  'LANGEXTRACT_GROUNDED_EXTRACTION',
  'SOUFFLE_RULES',
  'CODEQL_DATAFLOW',
  'VISION_OBJECT_DETECTION',
] as const;

export const modalityOwnerManifestSchema = z.object({
  schema: z.literal('atlas.modality-owner-manifest.v1').default('atlas.modality-owner-manifest.v1'),
  manifest_revision: revision,
  owners: z.array(z.object({
    owner: z.enum(MODALITY_OWNERS),
    modality: z.enum(['CODE', 'NATURAL_LANGUAGE', 'ONTOLOGY', 'IMAGE']),
    role: z.enum(['STRUCTURAL', 'SEMANTIC', 'RECOGNITION', 'RULE_INFERENCE', 'DATAFLOW']),
    canonical_authority: z.literal(false),
  }).strict()).min(1),
  canonical_authority: z.literal(false).default(false),
}).strict();
export type ModalityOwnerManifestV1 = z.infer<typeof modalityOwnerManifestSchema>;

export const temporalIndexActionSchema = z.object({
  source_ref: z.string().min(1),
  structural: z.enum(['REUSE', 'INCREMENTAL_REPARSE', 'FULL_REPARSE', 'TOMBSTONE']),
  typescript_semantics: z.enum(['REUSE', 'REENRICH_EXACT_SPANS', 'REENRICH_DEPENDENT_CLOSURE', 'TOMBSTONE', 'NOT_APPLICABLE']),
  semantic_768: z.enum(['REUSE', 'REEMBED_CHANGED_CHUNKS', 'DELETE_SOURCE_POINTS']),
  qdrant: z.enum(['NONE', 'UPSERT_CHANGED_POINTS', 'DELETE_SOURCE_POINTS']),
  graph: z.enum(['REUSE', 'APPLY_EDGE_DELTA', 'DELETE_SOURCE_EDGES']),
}).strict();

export const temporalIndexPlanSchema = z.object({
  schema: z.literal('atlas.temporal-index-plan.v1').default('atlas.temporal-index-plan.v1'),
  plan_id: id,
  workspace_revision: revision,
  previous_source_snapshot_revision: revision.nullable().default(null),
  source_snapshot_revision: revision,
  deltas: z.array(sourceRevisionDeltaSchema),
  actions: z.array(temporalIndexActionSchema),
  pagerank_policy: z.enum(['REUSE_IF_GRAPH_UNCHANGED', 'FULL_RECOMPUTE_WARM_START']),
  cagra_policy: z.enum(['REUSE_IF_SEMANTIC_UNCHANGED', 'EXTEND_ADDITIONS_ONLY', 'REBUILD_GENERATION']),
  graph_json_ingress: z.literal('JSONL_TO_CUDF_EDGE_TABLE').default('JSONL_TO_CUDF_EDGE_TABLE'),
  graph_compute_representation: z.literal('CUDF_EDGE_LIST').default('CUDF_EDGE_LIST'),
  canonical_semantic_dimension: z.literal(768),
  semantic_lane_votes: z.literal(1),
  plan_checksum: checksum,
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.actions.length !== value.deltas.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['actions'], message: 'one temporal action is required per source delta' });
  }
  const deltaRefs = value.deltas.map((item) => item.source_ref).sort();
  const actionRefs = value.actions.map((item) => item.source_ref).sort();
  if (JSON.stringify(deltaRefs) !== JSON.stringify(actionRefs)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['actions'], message: 'action source refs must exactly match delta source refs' });
  }
  const hasDeleteOrModify = value.deltas.some((item) => ['DELETED', 'MODIFIED', 'MOVED'].includes(item.change_kind));
  if (hasDeleteOrModify && value.cagra_policy === 'EXTEND_ADDITIONS_ONLY') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cagra_policy'], message: 'CAGRA extend is admitted only for pure additions; modified/deleted/moved rows require a new generation' });
  }
});
export type TemporalIndexPlanV1 = z.infer<typeof temporalIndexPlanSchema>;

export const structuralSnapshotValidationReceiptSchema = z.object({
  schema: z.literal('atlas.structural-snapshot-validation-receipt.v1').default('atlas.structural-snapshot-validation-receipt.v1'),
  receipt_id: id,
  workspace_revision: revision,
  source_snapshot_revision: revision,
  source_count: z.number().int().nonnegative(),
  changed_source_count: z.number().int().nonnegative(),
  validated_source_count: z.number().int().nonnegative(),
  native_provenance_count: z.number().int().nonnegative(),
  degraded_provenance_count: z.number().int().nonnegative(),
  tombstone_count: z.number().int().nonnegative(),
  changed_range_count: z.number().int().nonnegative(),
  row_identity_checksum: checksum,
  structural_snapshot_checksum: checksum,
  change_set_checksum: checksum,
  status: z.enum(['VALID', 'INVALID', 'BLOCKED']),
  diagnostics: z.array(z.string()).default([]),
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.validated_source_count > value.source_count) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['validated_source_count'], message: 'validated_source_count cannot exceed source_count' });
  }
  if (value.status === 'VALID' && value.validated_source_count !== value.source_count) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'VALID requires coverage of every source in the daily snapshot' });
  }
});
export type StructuralSnapshotValidationReceiptV1 = z.infer<typeof structuralSnapshotValidationReceiptSchema>;

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

export function temporalIndexChecksum(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export function classifyKnowledgeClaimFreshness(
  claim: KnowledgeClaimV1,
  changedSourceRevisions: readonly string[],
): KnowledgeClaimV1['status'] {
  if (claim.status === 'SUPERSEDED' || claim.status === 'CONTRADICTED') return claim.status;
  const changed = new Set(changedSourceRevisions);
  return claim.source_revision_set.some((sourceRevision) => changed.has(sourceRevision))
    ? 'STALE_EVIDENCE'
    : claim.status;
}

export function buildKnowledgeClaimChecksum(input: Omit<KnowledgeClaimV1, 'schema' | 'checksum' | 'canonical_authority'>): string {
  return temporalIndexChecksum({ schema: 'atlas.knowledge-claim.v1', ...input, canonical_authority: false });
}

export function buildRunManifest(input: Omit<RunManifestV1, 'schema' | 'manifest_checksum' | 'canonical_authority'>): RunManifestV1 {
  const raw = { schema: 'atlas.run-manifest.v1' as const, ...input, canonical_authority: false as const };
  return runManifestSchema.parse({ ...raw, manifest_checksum: temporalIndexChecksum(raw) });
}

export function buildTemporalDocumentIndex(input: Omit<TemporalDocumentIndexV1, 'schema' | 'index_checksum' | 'canonical_authority'>): TemporalDocumentIndexV1 {
  const raw = { schema: 'atlas.temporal-document-index.v1' as const, ...input, canonical_authority: false as const };
  return temporalDocumentIndexSchema.parse({ ...raw, index_checksum: temporalIndexChecksum(raw) });
}

export function buildTemporalIndexPlan(input: Omit<z.input<typeof temporalIndexPlanSchema>, 'schema' | 'actions' | 'plan_checksum' | 'canonical_authority' | 'plan_id'> & { plan_id?: string }): TemporalIndexPlanV1 {
  const deltas = input.deltas.map((item) => sourceRevisionDeltaSchema.parse(item));
  const plan_id = input.plan_id ?? `temporal-plan:${temporalIndexChecksum({
    workspace_revision: input.workspace_revision,
    source_snapshot_revision: input.source_snapshot_revision,
    deltas,
    producer_revision: input.producer_revision,
  })}`;
  const actions = deltas.map((delta) => ({
    source_ref: delta.source_ref,
    structural: delta.change_kind === 'UNCHANGED' ? 'REUSE' as const
      : delta.change_kind === 'DELETED' ? 'TOMBSTONE' as const
      : delta.change_kind === 'MODIFIED' && delta.changed_ranges.length > 0 ? 'INCREMENTAL_REPARSE' as const
      : 'FULL_REPARSE' as const,
    typescript_semantics: delta.change_kind === 'UNCHANGED' ? 'REUSE' as const
      : delta.change_kind === 'DELETED' ? 'TOMBSTONE' as const
      : delta.semantic_dependents.length > 0 ? 'REENRICH_DEPENDENT_CLOSURE' as const
      : 'REENRICH_EXACT_SPANS' as const,
    semantic_768: delta.change_kind === 'UNCHANGED' ? 'REUSE' as const
      : delta.change_kind === 'DELETED' ? 'DELETE_SOURCE_POINTS' as const
      : 'REEMBED_CHANGED_CHUNKS' as const,
    qdrant: delta.change_kind === 'UNCHANGED' ? 'NONE' as const
      : delta.change_kind === 'DELETED' ? 'DELETE_SOURCE_POINTS' as const
      : 'UPSERT_CHANGED_POINTS' as const,
    graph: delta.change_kind === 'UNCHANGED' ? 'REUSE' as const
      : delta.change_kind === 'DELETED' ? 'DELETE_SOURCE_EDGES' as const
      : 'APPLY_EDGE_DELTA' as const,
  }));
  const graphChanged = deltas.some((item) => item.change_kind !== 'UNCHANGED');
  const semanticChanged = graphChanged;
  const additionsOnly = deltas.every((item) => ['UNCHANGED', 'ADDED'].includes(item.change_kind));
  const raw = {
    schema: 'atlas.temporal-index-plan.v1' as const,
    ...input,
    plan_id,
    deltas,
    actions,
    pagerank_policy: graphChanged ? 'FULL_RECOMPUTE_WARM_START' as const : 'REUSE_IF_GRAPH_UNCHANGED' as const,
    cagra_policy: !semanticChanged ? 'REUSE_IF_SEMANTIC_UNCHANGED' as const
      : additionsOnly ? 'EXTEND_ADDITIONS_ONLY' as const
      : 'REBUILD_GENERATION' as const,
    graph_json_ingress: 'JSONL_TO_CUDF_EDGE_TABLE' as const,
    graph_compute_representation: 'CUDF_EDGE_LIST' as const,
    canonical_semantic_dimension: 768 as const,
    semantic_lane_votes: 1 as const,
    canonical_authority: false as const,
  };
  return temporalIndexPlanSchema.parse({ ...raw, plan_checksum: temporalIndexChecksum(raw) });
}

export function describeTemporalIndexingFabric(): string {
  return [
    'Content-addressed deduplication happens before physical compression. Atlas should not hand-roll Huffman as a storage contract; Arrow dictionary/run-end/bit packing reduce structural repetition and IPC uses ZSTD/LZ4 when compression is wanted.',
    'Tree-sitter incrementally reparses modified ranges using the old edited tree; ts-morph re-enriches exact changed spans plus the TypeScript semantic dependent closure when compiler semantics can propagate.',
    'semantic_768 embeddings and Qdrant points are updated only for changed/tombstoned chunks. Qdrant point identity remains a storage projection.',
    'CAGRA may extend a pure-addition generation, but modified/deleted/moved semantic rows create a new index generation. Exact cuVS parity remains required.',
    'PageRank is treated as globally affected by any graph edge change; Atlas rebuilds the graph projection and may warm-start from the previous PageRank vector rather than claiming local-only validity.',
    'JSONL is an ingest/log format for GPU graph data. cuDF parses JSONL into typed columns; cuGraph consumes a cuDF edge list. Canonical N-ary relationships remain relation-node incidence facts, not JSON or cuGraph ownership.',
    'Vision object detection produces source-image-checksum + box + class + model-revision observations and is noncanonical until evidence promotion, exactly like semantic or lexical recognition.',
  ].join(' ');
}
