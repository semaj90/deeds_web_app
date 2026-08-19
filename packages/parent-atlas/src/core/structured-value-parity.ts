import { z } from 'zod';

const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const structuredValueProofStatusSchema = z.enum([
  'BLOCKED_NODE_TREE_SITTER',
  'BLOCKED_TREE_SITTER_CHUNKER',
  'CHUNK_BOUNDARY_PARITY_FAILED',
  'STRUCTURED_VALUE_EXTRACTION_FAILED',
  'TS_MORPH_ENRICHMENT_FAILED',
  'ARROW_IPC_WRITE_FAILED',
  'PYARROW_MMAP_FAILED',
  'FIXTURE_ROUNDTRIP_PROVEN',
]);
export type StructuredValueProofStatusV1 = z.infer<typeof structuredValueProofStatusSchema>;

export const structuredValueCrossRuntimeProofSchema = z.object({
  schema: z.literal('atlas.structured-value-cross-runtime-proof.v1').default('atlas.structured-value-cross-runtime-proof.v1'),
  fixture_id: z.string().min(1),
  source_ref: z.string().min(1),
  source_revision: revision,
  workspace_revision: revision,
  node_tree_sitter: z.object({
    available: z.boolean(),
    parser_revision: revision.nullable(),
    grammar_revision: revision.nullable(),
  }).strict(),
  treesitter_chunker: z.object({
    available: z.boolean(),
    package_revision: revision.nullable(),
    target_chunk_found: z.boolean(),
  }).strict(),
  chunk_boundary: z.object({
    evaluated: z.boolean(),
    byte_span_match: z.boolean(),
    node_type_match: z.boolean(),
    source_span_checksum_match: z.boolean(),
    upstream_identity_attached_by_exact_span: z.boolean(),
    ordered_child_parity_evaluated: z.literal(false).default(false),
  }).strict(),
  structured_value: z.object({
    evaluated: z.boolean(),
    exact_byte_range_match: z.boolean(),
    root_kind: z.string().min(1).nullable(),
    computed_entry_observed: z.boolean(),
    spread_entry_observed: z.boolean(),
    span_only_identity: z.boolean(),
  }).strict(),
  ts_morph: z.object({
    evaluated: z.boolean(),
    object_exact_span_enriched: z.boolean(),
    call_exact_span_enriched: z.boolean(),
    resolved_call_signature_observed: z.boolean(),
    unicode_offset_roundtrip_observed: z.boolean(),
  }).strict(),
  arrow_ipc: z.object({
    evaluated: z.boolean(),
    file_written: z.boolean(),
    nested_provenance_struct: z.boolean(),
    nested_members_list_struct: z.boolean(),
    nested_entries_list_struct: z.boolean(),
    row_identity_checksum: checksum.nullable(),
    structure_checksum: checksum.nullable(),
    ipc_file_checksum: checksum.nullable(),
  }).strict(),
  pyarrow_mmap: z.object({
    evaluated: z.boolean(),
    available: z.boolean(),
    readback_succeeded: z.boolean(),
    row_identity_checksum_match: z.boolean(),
    structure_checksum_match: z.boolean(),
  }).strict(),
  proof_status: structuredValueProofStatusSchema,
  diagnostics: z.array(z.string()).default([]),
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.proof_status === 'FIXTURE_ROUNDTRIP_PROVEN') {
    const required = [
      value.node_tree_sitter.available,
      value.treesitter_chunker.available,
      value.treesitter_chunker.target_chunk_found,
      value.chunk_boundary.evaluated,
      value.chunk_boundary.byte_span_match,
      value.chunk_boundary.node_type_match,
      value.chunk_boundary.source_span_checksum_match,
      value.chunk_boundary.upstream_identity_attached_by_exact_span,
      value.structured_value.evaluated,
      value.structured_value.exact_byte_range_match,
      value.structured_value.computed_entry_observed,
      value.structured_value.spread_entry_observed,
      value.structured_value.span_only_identity,
      value.ts_morph.evaluated,
      value.ts_morph.object_exact_span_enriched,
      value.ts_morph.call_exact_span_enriched,
      value.ts_morph.resolved_call_signature_observed,
      value.ts_morph.unicode_offset_roundtrip_observed,
      value.arrow_ipc.evaluated,
      value.arrow_ipc.file_written,
      value.arrow_ipc.nested_provenance_struct,
      value.arrow_ipc.nested_members_list_struct,
      value.arrow_ipc.nested_entries_list_struct,
      value.pyarrow_mmap.evaluated,
      value.pyarrow_mmap.available,
      value.pyarrow_mmap.readback_succeeded,
      value.pyarrow_mmap.row_identity_checksum_match,
      value.pyarrow_mmap.structure_checksum_match,
    ];
    if (!required.every(Boolean)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['proof_status'], message: 'FIXTURE_ROUNDTRIP_PROVEN requires every bounded proof gate to pass' });
    }
    if (!value.arrow_ipc.row_identity_checksum || !value.arrow_ipc.structure_checksum || !value.arrow_ipc.ipc_file_checksum) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['arrow_ipc'], message: 'proven fixture requires logical and physical Arrow checksums' });
    }
  }
  if (!value.node_tree_sitter.available && value.proof_status !== 'BLOCKED_NODE_TREE_SITTER') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['proof_status'], message: 'missing Node Tree-sitter runtime must be reported as BLOCKED_NODE_TREE_SITTER' });
  }
  if (value.node_tree_sitter.available && !value.treesitter_chunker.available && value.proof_status !== 'BLOCKED_TREE_SITTER_CHUNKER') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['proof_status'], message: 'missing treesitter-chunker runtime must be reported as BLOCKED_TREE_SITTER_CHUNKER' });
  }
}).strict();
export type StructuredValueCrossRuntimeProofV1 = z.infer<typeof structuredValueCrossRuntimeProofSchema>;

export function deriveStructuredValueProofStatus(input: {
  node_tree_sitter_available: boolean;
  treesitter_chunker_available: boolean;
  target_chunk_found: boolean;
  chunk_boundary_passed: boolean;
  structured_value_passed: boolean;
  ts_morph_passed: boolean;
  arrow_ipc_passed: boolean;
  pyarrow_mmap_passed: boolean;
}): StructuredValueProofStatusV1 {
  if (!input.node_tree_sitter_available) return 'BLOCKED_NODE_TREE_SITTER';
  if (!input.treesitter_chunker_available) return 'BLOCKED_TREE_SITTER_CHUNKER';
  if (!input.target_chunk_found || !input.chunk_boundary_passed) return 'CHUNK_BOUNDARY_PARITY_FAILED';
  if (!input.structured_value_passed) return 'STRUCTURED_VALUE_EXTRACTION_FAILED';
  if (!input.ts_morph_passed) return 'TS_MORPH_ENRICHMENT_FAILED';
  if (!input.arrow_ipc_passed) return 'ARROW_IPC_WRITE_FAILED';
  if (!input.pyarrow_mmap_passed) return 'PYARROW_MMAP_FAILED';
  return 'FIXTURE_ROUNDTRIP_PROVEN';
}

export function describeStructuredValueCrossRuntimeProof(): string {
  return [
    'This receipt proves only one bounded TS/TSX fixture and never upgrades repository-wide structural truth by itself.',
    'Node Tree-sitter runtime absence and treesitter-chunker runtime absence are blocked states, not parity failures or passes.',
    'Chunk parity requires the same UTF-8 byte span, node type and source-span checksum before native Consiliency provenance may attach.',
    'Ordered-child parity against Consiliency remains a separate future gate because the public chunk surface does not itself expose the full parser child sequence.',
    'A green fixture additionally requires exact-span ts-morph enrichment, nested Arrow IPC file serialization, and PyArrow mmap checksum parity.',
  ].join(' ');
}
