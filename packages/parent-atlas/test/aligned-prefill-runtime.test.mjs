import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJsonChecksum } from '../dist/core/artifact-transport.js';
import { buildTensorSnapshot } from '../dist/core/tensor-snapshot.js';
import {
  buildGpuResidencyLease,
  buildTensorBatchExecutionRequest,
} from '../dist/core/aligned-ordinal-prefill-fabric.js';
import {
  alignedMaterializationReceiptSchema,
  buildAlignedRegistryFromMaterialization,
} from '../dist/core/aligned-materialization-bridge.js';

const H = (value) => canonicalJsonChecksum(value);

function tensor() {
  return buildTensorSnapshot({
    snapshot_revision: 'tensor:r1',
    representation: 'semantic:model-native',
    dimensions: 768,
    dtype: 'float32',
    canonical_rows: [
      { canonical_id: 'C517', canonical_revision: 'canon:r7' },
      { canonical_id: 'C900', canonical_revision: 'canon:r8' },
    ],
    tensor_checksum: H('tensor'),
    producer_revision: 'tensor:test',
  });
}

function receipt() {
  const base = tensor();
  return alignedMaterializationReceiptSchema.parse({
    schema: 'atlas.aligned-materialization-receipt.v1',
    materialization_revision: 'mat:r1',
    source_snapshot_revision: 'source:r11',
    row_identity_checksum: base.row_identity_checksum,
    row_count: 2,
    artifacts: [
      { artifact_id: 'semantic:r1', kind: 'SEMANTIC', path: '/tmp/semantic.arrow', content_checksum: H('semantic'), row_identity_checksum: base.row_identity_checksum, logical_row_count: 2, physical_row_count: 2, dimensions: 768, dtype: 'float32' },
      { artifact_id: 'feature:r1', kind: 'FEATURE', path: '/tmp/features.arrow', content_checksum: H('features'), row_identity_checksum: base.row_identity_checksum, logical_row_count: 2, physical_row_count: 2, dimensions: 16, dtype: 'float32' },
      { artifact_id: 'hypergraph:r1', kind: 'HYPERGRAPH', path: '/tmp/hypergraph.arrow', content_checksum: H('hypergraph'), row_identity_checksum: base.row_identity_checksum, logical_row_count: 2, physical_row_count: 2, dimensions: null, dtype: null },
      { artifact_id: 'incidence:r1', kind: 'NARY_INCIDENCE', path: '/tmp/incidence.arrow', content_checksum: H('incidence'), row_identity_checksum: null, logical_row_count: 2, physical_row_count: 5, dimensions: null, dtype: 'float32' },
    ],
    producer_revision: 'materializer:test',
    receipt_checksum: H('receipt'),
  });
}

test('materialization receipt becomes one aligned ordinal registry', () => {
  const registry = buildAlignedRegistryFromMaterialization({
    registry_revision: 'ord:r1',
    tensor_snapshot: tensor(),
    materialization_receipt: receipt(),
    producer_revision: 'registry:test',
  });
  assert.equal(registry.row_count, 2);
  assert.deepEqual(registry.projections.map((p) => p.kind), ['FEATURE', 'HYPERGRAPH', 'SEMANTIC']);
  assert.equal(registry.projections.every((p) => p.row_identity_checksum === registry.row_identity_checksum), true);
});

test('raw n-ary incidence may have M physical rows without impersonating the N-row alignment', () => {
  const value = receipt();
  const raw = value.artifacts.find((a) => a.kind === 'NARY_INCIDENCE');
  assert.equal(raw.row_identity_checksum, null);
  assert.equal(raw.physical_row_count, 5);
  assert.equal(value.row_count, 2);
});

test('tensor batch request is ordinal/ref-only and bounded', () => {
  const registry = buildAlignedRegistryFromMaterialization({
    registry_revision: 'ord:r1', tensor_snapshot: tensor(), materialization_receipt: receipt(), producer_revision: 'registry:test',
  });
  const lease = buildGpuResidencyLease({
    lease_id: 'lease:q1', source_artifact_id: 'query-vector', source_artifact_checksum: H('query'), row_identity_checksum: registry.row_identity_checksum,
    device_id: 'cuda:0', tile_id: 'tile:q1', dtype: 'float32', shape: [1, 768], byte_offset: 0, byte_length: 3072,
    residency: 'CUDA', cuda_ipc_handle_ref: 'ipc:lease:q1', issued_at: '2026-08-21T19:00:00.000Z', expires_at: null, producer_revision: 'gpu:test',
  });
  const request = buildTensorBatchExecutionRequest({
    action_id: 'A050', registry_revision: registry.registry_revision, row_identity_checksum: registry.row_identity_checksum,
    candidate_ordinals: [0, 1], query_tensor_lease_id: lease.lease_id, feature_artifact_ids: ['hypergraph:r1', 'feature:r1'], top_k: 1,
    producer_revision: 'ranker:test',
  });
  assert.deepEqual(request.feature_artifact_ids, ['feature:r1', 'hypergraph:r1']);
  assert.equal(JSON.stringify(request).includes('embedding'), false);
  assert.throws(() => buildTensorBatchExecutionRequest({ ...request, candidate_ordinals: [0, 0], top_k: 1 }), /candidate ordinals must be unique/);
});
