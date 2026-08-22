import { z } from 'zod';
import { canonicalJsonChecksum } from './artifact-transport.js';
import { tensorSnapshotSchema, type TensorSnapshotV1 } from './tensor-snapshot.js';
import { structuralProductionReceiptSchema, structuralReceiptCanPromoteOwnership, type StructuralProductionReceiptV1 } from './structural-production-receipt.js';
import { buildPrefillCacheEntry, type PrefillSynthesisCacheEntryV1 } from './contextual-prefill-fabric.js';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const alignedProjectionRefSchema = z.object({
  projection_id: id,
  projection_revision: revision,
  kind: z.enum(['SEMANTIC', 'FEATURE', 'GRAPH', 'HYPERGRAPH', 'TENSOR']),
  artifact_id: id,
  artifact_checksum: checksum,
  row_identity_checksum: checksum,
  row_count: z.number().int().nonnegative(),
}).strict();
export type AlignedProjectionRefV1 = z.infer<typeof alignedProjectionRefSchema>;

export const alignedOrdinalRegistrySchema = z.object({
  schema: z.literal('atlas.aligned-ordinal-registry.v1').default('atlas.aligned-ordinal-registry.v1'),
  registry_revision: revision,
  source_snapshot_revision: revision,
  row_identity_checksum: checksum,
  row_count: z.number().int().nonnegative(),
  rows: z.array(z.object({ ordinal: z.number().int().nonnegative(), canonical_id: id, canonical_revision: revision }).strict()),
  projections: z.array(alignedProjectionRefSchema).min(1),
  producer_revision: revision,
  registry_checksum: checksum,
  ordinal_is_canonical: z.literal(false).default(false),
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.rows.length !== value.row_count) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rows'], message: 'rows.length must equal row_count' });
  for (let i = 0; i < value.rows.length; i += 1) if (value.rows[i]!.ordinal !== i) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rows', i, 'ordinal'], message: 'ordinals must be dense 0..N-1' });
  if (new Set(value.rows.map((row) => row.canonical_id)).size !== value.rows.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rows'], message: 'canonical_id must be unique' });
  const kinds = value.projections.map((projection) => projection.kind);
  if (new Set(kinds).size !== kinds.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['projections'], message: 'projection kind must be unique' });
  for (const projection of value.projections) {
    if (projection.row_identity_checksum !== value.row_identity_checksum) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['projections'], message: `projection ${projection.projection_id} row identity does not align` });
    if (projection.row_count !== value.row_count) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['projections'], message: `projection ${projection.projection_id} row_count does not align` });
  }
});
export type AlignedOrdinalRegistryV1 = z.infer<typeof alignedOrdinalRegistrySchema>;

export const canonicalStructuralCoordinateSchema = z.object({
  schema: z.literal('atlas.canonical-structural-coordinate.v1').default('atlas.canonical-structural-coordinate.v1'),
  canonical_id: id,
  packet_key: id,
  source_ref: z.string().min(1),
  source_revision: revision,
  tree_node_id: id,
  symbol_version_id: id.nullable().default(null),
  node_type: z.string().min(1),
  ast_path: z.array(z.number().int().nonnegative()).default([]),
  parent_ast_path: z.array(z.number().int().nonnegative()).default([]),
  start_byte: z.number().int().nonnegative(),
  end_byte: z.number().int().positive(),
  grammar_revision: revision.nullable().default(null),
  source_snapshot_revision: revision,
  identity_owner: z.literal('symbol-registry'),
  symbol_registry_revision: revision,
  structural_receipt_output_checksum: z.string().min(1),
  producer_revision: revision,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.end_byte <= value.start_byte) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['end_byte'], message: 'end_byte must exceed start_byte' });
});
export type CanonicalStructuralCoordinateV1 = z.infer<typeof canonicalStructuralCoordinateSchema>;

export const smartPacketCoordinateRefSchema = z.object({
  schema: z.literal('atlas.smart-packet-coordinate-ref.v1').default('atlas.smart-packet-coordinate-ref.v1'),
  packet_key: id,
  canonical_id: id,
  registry_revision: revision,
  row_identity_checksum: checksum,
  ordinal: z.number().int().nonnegative(),
  structural: canonicalStructuralCoordinateSchema.nullable().default(null),
  semantic_artifact_id: id.nullable().default(null),
  feature_artifact_id: id.nullable().default(null),
  graph_artifact_id: id.nullable().default(null),
  hypergraph_artifact_id: id.nullable().default(null),
  producer_revision: revision,
  coordinate_checksum: checksum,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.structural && value.structural.canonical_id !== value.canonical_id) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['structural', 'canonical_id'], message: 'structural canonical_id mismatch' });
  if (value.structural && value.structural.packet_key !== value.packet_key) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['structural', 'packet_key'], message: 'structural packet_key mismatch' });
});
export type SmartPacketCoordinateRefV1 = z.infer<typeof smartPacketCoordinateRefSchema>;

export const gpuResidencyLeaseSchema = z.object({
  schema: z.literal('atlas.gpu-residency-lease.v1').default('atlas.gpu-residency-lease.v1'),
  lease_id: id,
  source_artifact_id: id,
  source_artifact_checksum: checksum,
  row_identity_checksum: checksum,
  device_id: id,
  tile_id: id,
  dtype: z.enum(['float32', 'float16', 'bfloat16', 'int8', 'uint8', 'uint32']),
  shape: z.array(z.number().int().nonnegative()).min(1),
  byte_offset: z.number().int().nonnegative().default(0),
  byte_length: z.number().int().nonnegative(),
  residency: z.enum(['PINNED_HOST', 'CUDA']),
  cuda_ipc_handle_ref: id.nullable().default(null),
  issued_at: z.string().datetime(),
  expires_at: z.string().datetime().nullable().default(null),
  producer_revision: revision,
  lease_checksum: checksum,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (value.cuda_ipc_handle_ref !== null && value.residency !== 'CUDA') ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cuda_ipc_handle_ref'], message: 'CUDA IPC handle reference requires CUDA residency' });
  if (value.expires_at !== null && Date.parse(value.expires_at) <= Date.parse(value.issued_at)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expires_at'], message: 'expires_at must be later than issued_at' });
});
export type GpuResidencyLeaseV1 = z.infer<typeof gpuResidencyLeaseSchema>;

export const tensorBatchExecutionRequestSchema = z.object({
  schema: z.literal('atlas.tensor-batch-execution-request.v1').default('atlas.tensor-batch-execution-request.v1'),
  action_id: id,
  registry_revision: revision,
  row_identity_checksum: checksum,
  candidate_ordinals: z.array(z.number().int().nonnegative()).min(1),
  query_tensor_lease_id: id,
  feature_artifact_ids: z.array(id).default([]),
  top_k: z.number().int().positive(),
  producer_revision: revision,
  request_checksum: checksum,
  canonical_authority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  if (new Set(value.candidate_ordinals).size !== value.candidate_ordinals.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['candidate_ordinals'], message: 'candidate ordinals must be unique' });
  if (value.top_k > value.candidate_ordinals.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['top_k'], message: 'top_k cannot exceed candidate count' });
});
export type TensorBatchExecutionRequestV1 = z.infer<typeof tensorBatchExecutionRequestSchema>;

export const compiledPrefillReceiptSchema = z.object({
  schema: z.literal('atlas.compiled-prefill-receipt.v1').default('atlas.compiled-prefill-receipt.v1'),
  receipt_id: id,
  request_id: id,
  workspace_revision: revision,
  source_snapshot_revision: revision,
  registry_revision: revision,
  row_identity_checksum: checksum,
  context_manifest_checksum: checksum,
  instruction_set_checksum: checksum,
  hydration_manifest_checksum: checksum,
  feature_alignment_checksum: checksum,
  model_revision: revision,
  adapter_revision: revision.nullable().default(null),
  tokenizer_revision: revision,
  prompt_template_revision: revision,
  tool_schema_revision: revision,
  evidence_artifact_checksums: z.array(checksum).default([]),
  gpu_lease_checksums: z.array(checksum).default([]),
  compiled_prefill_artifact_id: id,
  compiled_prefill_checksum: checksum,
  prefill_identity_checksum: checksum,
  deterministic_context_required: z.literal(true).default(true),
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict();
export type CompiledPrefillReceiptV1 = z.infer<typeof compiledPrefillReceiptSchema>;

const sortedUnique = (values: readonly string[]) => [...new Set(values)].sort();

export function buildAlignedOrdinalRegistry(input: { registry_revision: string; source_snapshot_revision: string; tensor_snapshot: TensorSnapshotV1; projections: AlignedProjectionRefV1[]; producer_revision: string }): AlignedOrdinalRegistryV1 {
  const tensor = tensorSnapshotSchema.parse(input.tensor_snapshot);
  const projections = [...input.projections].sort((a, b) => a.kind.localeCompare(b.kind) || a.projection_id.localeCompare(b.projection_id));
  const body = { schema: 'atlas.aligned-ordinal-registry.v1' as const, registry_revision: input.registry_revision, source_snapshot_revision: input.source_snapshot_revision, row_identity_checksum: tensor.row_identity_checksum, row_count: tensor.row_count, rows: tensor.rows, projections, producer_revision: input.producer_revision, ordinal_is_canonical: false as const, canonical_authority: false as const };
  return alignedOrdinalRegistrySchema.parse({ ...body, registry_checksum: canonicalJsonChecksum(body) });
}

export function buildCanonicalStructuralCoordinate(input: Omit<CanonicalStructuralCoordinateV1, 'schema' | 'source_snapshot_revision' | 'identity_owner' | 'symbol_registry_revision' | 'structural_receipt_output_checksum' | 'canonical_authority'> & { structural_receipt: StructuralProductionReceiptV1 }): CanonicalStructuralCoordinateV1 {
  const receipt = structuralProductionReceiptSchema.parse(input.structural_receipt);
  if (!structuralReceiptCanPromoteOwnership(receipt)) throw new Error('STRUCTURAL_OWNER_RECEIPT_NOT_PROMOTABLE');
  const { structural_receipt: _receipt, ...coordinate } = input;
  return canonicalStructuralCoordinateSchema.parse({ schema: 'atlas.canonical-structural-coordinate.v1', ...coordinate, source_snapshot_revision: receipt.source_snapshot_revision, identity_owner: 'symbol-registry', symbol_registry_revision: receipt.symbol_registry_revision, structural_receipt_output_checksum: receipt.output_checksum, canonical_authority: false });
}

export function buildSmartPacketCoordinateRef(input: { packet_key: string; canonical_id: string; registry: AlignedOrdinalRegistryV1; structural?: CanonicalStructuralCoordinateV1 | null; producer_revision: string }): SmartPacketCoordinateRefV1 {
  const registry = alignedOrdinalRegistrySchema.parse(input.registry);
  const row = registry.rows.find((candidate) => candidate.canonical_id === input.canonical_id);
  if (!row) throw new Error(`ORDINAL_CANONICAL_ID_NOT_FOUND:${input.canonical_id}`);
  if (input.structural && input.structural.source_snapshot_revision !== registry.source_snapshot_revision) throw new Error('STRUCTURAL_SOURCE_SNAPSHOT_MISMATCH');
  const byKind = new Map(registry.projections.map((projection) => [projection.kind, projection.artifact_id]));
  const body = { schema: 'atlas.smart-packet-coordinate-ref.v1' as const, packet_key: input.packet_key, canonical_id: input.canonical_id, registry_revision: registry.registry_revision, row_identity_checksum: registry.row_identity_checksum, ordinal: row.ordinal, structural: input.structural ?? null, semantic_artifact_id: byKind.get('SEMANTIC') ?? null, feature_artifact_id: byKind.get('FEATURE') ?? null, graph_artifact_id: byKind.get('GRAPH') ?? null, hypergraph_artifact_id: byKind.get('HYPERGRAPH') ?? null, producer_revision: input.producer_revision, canonical_authority: false as const };
  return smartPacketCoordinateRefSchema.parse({ ...body, coordinate_checksum: canonicalJsonChecksum(body) });
}

export function buildGpuResidencyLease(input: Omit<GpuResidencyLeaseV1, 'schema' | 'lease_checksum' | 'canonical_authority'>): GpuResidencyLeaseV1 {
  const body = { schema: 'atlas.gpu-residency-lease.v1' as const, ...input, canonical_authority: false as const };
  return gpuResidencyLeaseSchema.parse({ ...body, lease_checksum: canonicalJsonChecksum(body) });
}

export function buildTensorBatchExecutionRequest(input: Omit<TensorBatchExecutionRequestV1, 'schema' | 'request_checksum' | 'canonical_authority'>): TensorBatchExecutionRequestV1 {
  const candidate_ordinals = [...input.candidate_ordinals];
  const feature_artifact_ids = sortedUnique(input.feature_artifact_ids);
  const body = { schema: 'atlas.tensor-batch-execution-request.v1' as const, ...input, candidate_ordinals, feature_artifact_ids, canonical_authority: false as const };
  return tensorBatchExecutionRequestSchema.parse({ ...body, request_checksum: canonicalJsonChecksum(body) });
}

export function buildCompiledPrefillReceipt(input: Omit<CompiledPrefillReceiptV1, 'schema' | 'prefill_identity_checksum' | 'canonical_authority'>): CompiledPrefillReceiptV1 {
  const evidence_artifact_checksums = sortedUnique(input.evidence_artifact_checksums);
  const gpu_lease_checksums = sortedUnique(input.gpu_lease_checksums);
  const identity = { workspace_revision: input.workspace_revision, source_snapshot_revision: input.source_snapshot_revision, registry_revision: input.registry_revision, row_identity_checksum: input.row_identity_checksum, context_manifest_checksum: input.context_manifest_checksum, instruction_set_checksum: input.instruction_set_checksum, hydration_manifest_checksum: input.hydration_manifest_checksum, feature_alignment_checksum: input.feature_alignment_checksum, model_revision: input.model_revision, adapter_revision: input.adapter_revision ?? null, tokenizer_revision: input.tokenizer_revision, prompt_template_revision: input.prompt_template_revision, tool_schema_revision: input.tool_schema_revision, evidence_artifact_checksums, gpu_lease_checksums, compiled_prefill_artifact_id: input.compiled_prefill_artifact_id, compiled_prefill_checksum: input.compiled_prefill_checksum };
  return compiledPrefillReceiptSchema.parse({ schema: 'atlas.compiled-prefill-receipt.v1', ...input, evidence_artifact_checksums, gpu_lease_checksums, prefill_identity_checksum: canonicalJsonChecksum(identity), canonical_authority: false });
}

export function compiledPrefillReceiptToCacheEntry(receiptInput: CompiledPrefillReceiptV1, compilerRevision: string): PrefillSynthesisCacheEntryV1 {
  const receipt = compiledPrefillReceiptSchema.parse(receiptInput);
  return buildPrefillCacheEntry({ prefill_identity_checksum: receipt.prefill_identity_checksum, instruction_set_checksum: receipt.instruction_set_checksum, hydration_manifest_checksum: receipt.hydration_manifest_checksum, feature_alignment_checksum: receipt.feature_alignment_checksum, context_manifest_checksum: receipt.context_manifest_checksum, compiler_revision: compilerRevision, compiled_prefill_artifact_id: receipt.compiled_prefill_artifact_id, compiled_prefill_checksum: receipt.compiled_prefill_checksum, status: 'VALID' });
}
