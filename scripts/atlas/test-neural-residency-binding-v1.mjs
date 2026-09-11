#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateNeuralResidencyBinding } from './audit-neural-residency-binding-v1.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const D = 'd'.repeat(64);
const E = 'e'.repeat(64);
const SNAPSHOT = 'lineage-qualified-canary:sha256:' + 'f'.repeat(64) + ':v1:15';

function feat04() {
  return {
    schema: 'atlas.candidate-feature-gpu-feat04-envelope.v1',
    candidateSnapshotRevision: SNAPSHOT,
    ordinalMapChecksum: A,
    featureSnapshotChecksum: B,
    selectedOrdinals: [0, 1, 2],
    pack: { gpuPackChecksum: C },
    gather: { gatherChecksum: D },
    identityAuthority: false,
    canonicalOwnerChanged: false,
    writesPerformed: false,
  };
}

function residency() {
  return {
    schema: 'atlas.candidate-feature-gpu-residency-proof.v1',
    status: 'CANDIDATE_FEATURE_GPU_RESIDENCY_BOUNDED_PROVEN',
    gpuExecutionObserved: true,
    ownerProcessResident: true,
    sourceGpuPackChecksum: C,
    observation: {
      candidateSnapshotRevision: SNAPSHOT,
      ordinalMapChecksum: A,
      featureSnapshotChecksum: B,
      observationChecksum: E,
    },
    gather: { selectedOrdinals: [0, 1, 2] },
    residentReuse: {
      h2dTransfers: 1,
      reuseH2dTransfers: 0,
      sameProcess: true,
      sameResidentTensorObjects: true,
    },
    postReleaseAccessBlocked: true,
    storeWrites: false,
    ordinalParity: true,
    featureValueParity: true,
    featurePresenceParity: true,
    laneMaskParity: true,
    degradedIdentityParity: true,
  };
}

function fullyBoundManifest() {
  return {
    manifest_id: 'context:test',
    identity: {
      candidate_ordinal_set_checksum: D,
      evidence_revision_checksum: E,
      ordinal_map_checksum: A,
      candidate_snapshot_revision: SNAPSHOT,
      feature_snapshot_checksum: B,
      complete: true,
    },
  };
}

test('existing FEAT-04 + residency proof is admitted as an artifact pair without inventing a new format', () => {
  const result = evaluateNeuralResidencyBinding({ feat04: feat04(), residency: residency() });
  assert.equal(result.status, 'NEURAL_RESIDENCY_ARTIFACT_PAIR_PROVEN_MANIFEST_UNCHECKED');
  assert.equal(result.artifactPairProven, true);
  assert.equal(result.manifestChecked, false);
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.writesPerformed, false);
});

test('legacy manifest with only ordinal-map identity remains blocked at the binding seam', () => {
  const manifest = fullyBoundManifest();
  delete manifest.identity.candidate_snapshot_revision;
  delete manifest.identity.feature_snapshot_checksum;
  const result = evaluateNeuralResidencyBinding({ feat04: feat04(), residency: residency(), manifest });
  assert.equal(result.status, 'NEURAL_RESIDENCY_ARTIFACT_PAIR_PROVEN_MANIFEST_BINDING_BLOCKED');
  assert.equal(result.artifactPairProven, true);
  assert.equal(result.manifestFullyBound, false);
  assert.ok(result.blockers.some((item) => item.code === 'PREFILL_MANIFEST_CANDIDATE_SNAPSHOT_NOT_BOUND'));
  assert.ok(result.blockers.some((item) => item.code === 'PREFILL_MANIFEST_FEATURE_SNAPSHOT_NOT_BOUND'));
});

test('manifest with exact FEAT-04 identity closes the binding gate', () => {
  const result = evaluateNeuralResidencyBinding({
    feat04: feat04(),
    residency: residency(),
    manifest: fullyBoundManifest(),
  });
  assert.equal(result.status, 'NEURAL_RESIDENCY_BINDING_PROVEN');
  assert.equal(result.artifactPairProven, true);
  assert.equal(result.manifestFullyBound, true);
  assert.deepEqual(result.blockers, []);
});

test('same-schema but different snapshot is rejected', () => {
  const broken = residency();
  broken.observation.candidateSnapshotRevision = 'lineage-qualified-canary:sha256:' + '9'.repeat(64) + ':v1:15';
  const result = evaluateNeuralResidencyBinding({ feat04: feat04(), residency: broken });
  assert.equal(result.status, 'NEURAL_RESIDENCY_BINDING_BLOCKED');
  assert.equal(result.artifactPairProven, false);
  assert.ok(result.blockers.some((item) => item.code === 'CANDIDATE_SNAPSHOT_REVISION_MISMATCH'));
});
