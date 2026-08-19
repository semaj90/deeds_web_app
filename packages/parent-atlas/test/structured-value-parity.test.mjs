import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildStructuredValueCrossRuntimeReceipt,
  structuredValueCrossRuntimeReceiptSchema,
} from '../dist/index.js';

const checksumA = 'a'.repeat(64);
const checksumB = 'b'.repeat(64);
const checksumC = 'c'.repeat(64);

function base(overrides = {}) {
  return {
    receipt_id: 'sv-proof:test',
    fixture_source_ref: 'packages/parent-atlas/fixtures/structured-value/ts-parity-fixture.ts',
    fixture_source_revision: 'fixture:v1',
    workspace_revision: 'workspace:v1',
    node_tree_sitter_revision: '0.25.1',
    node_grammar_revision: '0.23.2',
    treesitter_chunker_revision: 'fixture',
    ts_morph_revision: '27.0.0',
    typescript_revision: '5.x',
    arrow_js_revision: '21.1.0',
    pyarrow_revision: 'runtime-readback',
    node_tree_sitter_available: true,
    treesitter_chunker_available: true,
    compared_chunk_count: 1,
    span_match_count: 1,
    node_type_match_count: 1,
    source_span_checksum_match_count: 1,
    upstream_id_match_count: 1,
    object_value_extracted: true,
    object_value_root_kind: 'OBJECT',
    object_value_entry_count: 6,
    computed_entry_count: 1,
    spread_entry_count: 1,
    object_span_only_identity: true,
    ts_morph_exact_span_match: true,
    ts_morph_resolved_signature: true,
    unicode_offset_roundtrip_observed: true,
    arrow_row_count: 12,
    arrow_row_identity_checksum: checksumA,
    arrow_structure_checksum: checksumB,
    arrow_ipc_checksum: checksumC,
    arrow_nested_provenance_struct: true,
    arrow_nested_members_list_struct: true,
    arrow_nested_entries_list_struct: true,
    pyarrow_mmap_row_identity_checksum: checksumA,
    pyarrow_mmap_structure_checksum: checksumB,
    pyarrow_reconstruction_checksum: checksumC,
    status: 'FIXTURE_ROUNDTRIP_PROVEN',
    diagnostics: [],
    producer_revision: 'test:v1',
    ...overrides,
  };
}

test('FIXTURE_ROUNDTRIP_PROVEN requires all structural, semantic, Arrow, and mmap evidence', () => {
  const receipt = buildStructuredValueCrossRuntimeReceipt(base());
  assert.equal(receipt.proof_status, 'FIXTURE_ROUNDTRIP_PROVEN');
  assert.equal(receipt.canonical_authority, false);
  assert.equal(receipt.chunk_boundary.upstream_identity_attached_by_exact_span, true);
  assert.equal(receipt.chunk_boundary.ordered_child_parity_evaluated, false);
});

test('success cannot hide missing chunk boundary parity', () => {
  assert.throws(
    () => buildStructuredValueCrossRuntimeReceipt(base({ span_match_count: 0 })),
    /FIXTURE_ROUNDTRIP_PROVEN requires every bounded proof gate to pass/,
  );
});

test('success cannot hide Arrow/PyArrow checksum disagreement', () => {
  const receipt = buildStructuredValueCrossRuntimeReceipt(base({ pyarrow_mmap_structure_checksum: checksumC, status: 'PYARROW_MMAP_FAILED' }));
  assert.equal(receipt.pyarrow_mmap.structure_checksum_match, false);
  assert.equal(receipt.proof_status, 'PYARROW_MMAP_FAILED');
  assert.doesNotThrow(() => structuredValueCrossRuntimeReceiptSchema.parse(receipt));
});

test('blocked Node runtime is distinct from parity failure', () => {
  const receipt = buildStructuredValueCrossRuntimeReceipt(base({
    status: 'BLOCKED_NODE_TREE_SITTER',
    node_tree_sitter_available: false,
    compared_chunk_count: 0,
    span_match_count: 0,
    node_type_match_count: 0,
    source_span_checksum_match_count: 0,
    upstream_id_match_count: 0,
    object_value_extracted: false,
    object_value_root_kind: null,
    object_value_entry_count: 0,
    computed_entry_count: 0,
    spread_entry_count: 0,
    object_span_only_identity: false,
    ts_morph_exact_span_match: false,
    ts_morph_resolved_signature: false,
    unicode_offset_roundtrip_observed: false,
    arrow_row_count: 0,
    arrow_row_identity_checksum: null,
    arrow_structure_checksum: null,
    arrow_ipc_checksum: null,
    arrow_nested_provenance_struct: false,
    arrow_nested_members_list_struct: false,
    arrow_nested_entries_list_struct: false,
    pyarrow_mmap_row_identity_checksum: null,
    pyarrow_mmap_structure_checksum: null,
    pyarrow_reconstruction_checksum: null,
  }));
  assert.equal(receipt.proof_status, 'BLOCKED_NODE_TREE_SITTER');
  assert.equal(receipt.node_tree_sitter.available, false);
});
