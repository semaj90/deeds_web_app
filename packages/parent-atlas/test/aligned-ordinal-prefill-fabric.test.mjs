import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildAlignedOrdinalRegistry,
  buildCompiledPrefillReceipt,
  buildGpuResidencyLease,
  buildSmartPacketCoordinateRef,
  canonicalStructuralCoordinateSchema,
  compiledPrefillReceiptToCacheEntry,
} from '../dist/core/aligned-ordinal-prefill-fabric.js';
import { canonicalJsonChecksum } from '../dist/core/artifact-transport.js';
import { canReusePrefillCache } from '../dist/core/contextual-prefill-fabric.js';
import { buildTensorSnapshot } from '../dist/core/tensor-snapshot.js';

const H = (value) => canonicalJsonChecksum(value);

function tensor() {
  return buildTensorSnapshot({
    snapshot_revision: 'tensor:r1',
    representation: 'semantic:model-native',
    dimensions: 768,
    dtype: 'float16',
    canonical_rows: [
      { canonical_id: 'C517', canonical_revision: 'canon:r7' },
      { canonical_id: 'C900', canonical_revision: 'canon:r8' },
    ],
    tensor_checksum: H('tensor-bytes'),
    producer_revision: 'tensor-builder:r1',
  });
}

function registry() {
  const base = tensor();
  return buildAlignedOrdinalRegistry({
    registry_revision: 'ord:r1',
    source_snapshot_revision: 'source:r11',
    tensor_snapshot: base,
    projections: [
      { projection_id: 'semantic:r1', projection_revision: 'r1', kind: 'SEMANTIC', artifact_id: 'semantic.arrow', artifact_checksum: H('semantic'), row_identity_checksum: base.row_identity_checksum, row_count: base.row_count },
      { projection_id: 'features:r1', projection_revision: 'r1', kind: 'FEATURE', artifact_id: 'features.arrow', artifact_checksum: H('features'), row_identity_checksum: base.row_identity_checksum, row_count: base.row_count },
      { projection_id: 'hypergraph:r1', projection_revision: 'r1', kind: 'HYPERGRAPH', artifact_id: 'hypergraph.csr', artifact_checksum: H('hypergraph'), row_identity_checksum: base.row_identity_checksum, row_count: base.row_count },
    ],
    producer_revision: 'ordinal-builder:r1',
  });
}

function prefillReceipt() {
  return buildCompiledPrefillReceipt({
    receipt_id: 'prefill:r1', request_id: 'req:1', workspace_revision: 'ws:742', source_snapshot_revision: 'source:r11',
    registry_revision: 'ord:r1', row_identity_checksum: registry().row_identity_checksum, context_manifest_checksum: H('context'),
    instruction_set_checksum: H('instructions'), hydration_manifest_checksum: H('hydration'), feature_alignment_checksum: H('features'),
    model_revision: 'model:r9', adapter_revision: null, tokenizer_revision: 'tokenizer:r2', prompt_template_revision: 'template:r4', tool_schema_revision: 'tools:r5',
    evidence_artifact_checksums: [H('e2'), H('e1'), H('e1')], gpu_lease_checksums: [H('g2'), H('g1')],
    compiled_prefill_artifact_id: 'prefill-artifact:1', compiled_prefill_checksum: H('prefill-bytes'), deterministic_context_required: true,
    producer_revision: 'prefill-compiler:r1',
  });
}

test('aligned ordinal registry preserves one cheap row coordinate across projections', () => {
  const value = registry();
  assert.equal(value.rows[0].ordinal, 0);
  assert.equal(value.rows[0].canonical_id, 'C517');
  assert.equal(value.projections.every((item) => item.row_identity_checksum === value.row_identity_checksum), true);
  assert.equal(value.ordinal_is_canonical, false);
});

test('aligned ordinal registry rejects a projection with a different row identity', () => {
  const base = tensor();
  assert.throws(() => buildAlignedOrdinalRegistry({
    registry_revision: 'ord:bad',
    source_snapshot_revision: 'source:r11',
    tensor_snapshot: base,
    projections: [{ projection_id: 'bad', projection_revision: 'r1', kind: 'FEATURE', artifact_id: 'bad.arrow', artifact_checksum: H('bad'), row_identity_checksum: H('different-rows'), row_count: base.row_count }],
    producer_revision: 'ordinal-builder:r1',
  }), /row identity does not align/);
});

test('smart packet coordinate attaches only canonical-owner-attested structural coordinates', () => {
  const structural = canonicalStructuralCoordinateSchema.parse({
    canonical_id: 'C517', packet_key: 'P992', source_ref: 'src/lib/example.ts', source_revision: 'src:r11',
    tree_node_id: 'T8421', symbol_version_id: 'S331', node_type: 'function_declaration', ast_path: [2, 1, 0], parent_ast_path: [2, 1],
    start_byte: 10, end_byte: 80, grammar_revision: 'tree-sitter-typescript:r5', canonical_owner_attested: true, producer_revision: 'structural-owner:r3',
  });
  const coordinate = buildSmartPacketCoordinateRef({
    packet_key: 'P992', canonical_id: 'C517', registry: registry(), structural, producer_revision: 'smart-coordinate:r1',
  });
  assert.equal(coordinate.ordinal, 0);
  assert.equal(coordinate.structural.tree_node_id, 'T8421');
  assert.equal(coordinate.semantic_artifact_id, 'semantic.arrow');
  assert.equal(coordinate.hypergraph_artifact_id, 'hypergraph.csr');
});

test('CUDA IPC is represented by an opaque lease reference, never tensor bytes', () => {
  const value = buildGpuResidencyLease({
    lease_id: 'lease:17', source_artifact_id: 'semantic.arrow', source_artifact_checksum: H('semantic'), row_identity_checksum: registry().row_identity_checksum,
    device_id: 'cuda:0', tile_id: 'tile:semantic:17', dtype: 'float16', shape: [2, 768], byte_offset: 0, byte_length: 3072,
    residency: 'CUDA', cuda_ipc_handle_ref: 'ipc-handle-store:lease:17', issued_at: '2026-08-21T19:00:00.000Z', expires_at: '2026-08-21T19:05:00.000Z', producer_revision: 'gpu-residency:r1',
  });
  assert.equal(value.cuda_ipc_handle_ref, 'ipc-handle-store:lease:17');
  assert.equal(JSON.stringify(value).includes('embedding'), false);
  assert.throws(() => buildGpuResidencyLease({
    lease_id: value.lease_id, source_artifact_id: value.source_artifact_id, source_artifact_checksum: value.source_artifact_checksum,
    row_identity_checksum: value.row_identity_checksum, device_id: value.device_id, tile_id: value.tile_id, dtype: value.dtype,
    shape: value.shape, byte_offset: value.byte_offset, byte_length: value.byte_length, residency: 'PINNED_HOST',
    cuda_ipc_handle_ref: value.cuda_ipc_handle_ref, issued_at: value.issued_at, expires_at: value.expires_at, producer_revision: value.producer_revision,
  }), /CUDA IPC handle reference requires CUDA residency/);
});

test('compiled prefill identity is stable across evidence and GPU lease ordering', () => {
  const a = prefillReceipt();
  const b = buildCompiledPrefillReceipt({
    receipt_id: 'prefill:r2', request_id: a.request_id, workspace_revision: a.workspace_revision, source_snapshot_revision: a.source_snapshot_revision,
    registry_revision: a.registry_revision, row_identity_checksum: a.row_identity_checksum, context_manifest_checksum: a.context_manifest_checksum,
    instruction_set_checksum: a.instruction_set_checksum, hydration_manifest_checksum: a.hydration_manifest_checksum, feature_alignment_checksum: a.feature_alignment_checksum,
    model_revision: a.model_revision, adapter_revision: a.adapter_revision, tokenizer_revision: a.tokenizer_revision, prompt_template_revision: a.prompt_template_revision,
    tool_schema_revision: a.tool_schema_revision, evidence_artifact_checksums: [...a.evidence_artifact_checksums].reverse(), gpu_lease_checksums: [...a.gpu_lease_checksums].reverse(),
    compiled_prefill_artifact_id: a.compiled_prefill_artifact_id, compiled_prefill_checksum: a.compiled_prefill_checksum,
    deterministic_context_required: true, producer_revision: a.producer_revision,
  });
  assert.equal(a.prefill_identity_checksum, b.prefill_identity_checksum);
  assert.equal(a.canonical_authority, false);
});

test('compiled receipt feeds the existing deterministic prefill cache boundary', () => {
  const receipt = prefillReceipt();
  const entry = compiledPrefillReceiptToCacheEntry(receipt, 'context-compiler:r1');
  assert.equal(canReusePrefillCache(entry, {
    prefill_identity_checksum: receipt.prefill_identity_checksum,
    instruction_set_checksum: receipt.instruction_set_checksum,
    hydration_manifest_checksum: receipt.hydration_manifest_checksum,
    feature_alignment_checksum: receipt.feature_alignment_checksum,
    context_manifest_checksum: receipt.context_manifest_checksum,
    compiler_revision: 'context-compiler:r1',
  }), true);
  assert.equal(entry.compiled_prefill_artifact_id, receipt.compiled_prefill_artifact_id);
});
