import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateModelReceiptReadbackV1 } from './verify-embedding-model-receipt-readback-v1.mjs';

const checksum = (digit) => digit.repeat(64);

function completeFixture() {
  const artifactChecksum = checksum('a');
  return {
    receipt: {
      schema: 'atlas.emb-prov-01-embedding-provenance-receipt.v1',
      modelId: 'embeddinggemma:latest',
      producerRevision: 'sha256:' + checksum('e'),
      pooling: 'mean',
      artifact: {
        liveArtifactSha256: artifactChecksum,
        recordedModelArtifactRevision: artifactChecksum,
        recordedGgufSha256Var: artifactChecksum,
      },
      provenanceFields: {
        tokenizerRevision: 'sha256:' + checksum('b'),
        tokenizerSha256: checksum('b'),
        inputPolicyRevision: 'input-policy:fixture',
      },
      crossExecutorParity: { parity: { dim: 768 } },
      runtimeLoadedArtifact: { artifactChecksum },
      perCallReceipts: [{ tokenizerRevision: 'sha256:' + checksum('b'), inputPolicyRevision: 'input-policy:fixture' }],
    },
    artifactReadback: { status: 'PASS', sha256: artifactChecksum },
    runtimeReadback: { status: 'PROVEN', artifactChecksum },
  };
}

test('accepts only a complete independently read-back receipt fixture', () => {
  const audit = evaluateModelReceiptReadbackV1(completeFixture());
  assert.equal(audit.status, 'PROVEN');
  assert.equal(audit.canonicalAuthority, false);
  assert.equal(audit.writesPerformed, false);
});

test('does not promote the existing partial EMB-PROV receipt by alias or parity alone', () => {
  const audit = evaluateModelReceiptReadbackV1({
    receipt: {
      schema: 'atlas.emb-prov-01-embedding-provenance-receipt.v1',
      provenanceFields: { serverModelAlias: 'embeddinggemma', tokenizerRevision: 'embedded-in-artifact', tokenizerSha256: checksum('b'), inputPolicyRevision: 'input-v1' },
      artifact: { liveArtifactSha256: checksum('a'), recordedModelArtifactRevision: checksum('a'), recordedGgufSha256Var: checksum('a') },
      crossExecutorParity: { parity: { dim: 768 } },
    },
    artifactReadback: { status: 'PASS', sha256: checksum('a') },
    runtimeReadback: { status: 'NOT_PROVEN', artifactChecksum: null },
  });
  assert.equal(audit.status, 'NOT_PROVEN');
  const failed = audit.checks.filter((entry) => entry.status !== 'PASS').map((entry) => entry.id);
  assert.deepEqual(failed, ['MODEL_ID', 'POOLING', 'PRODUCER_REVISION', 'ACTIVE_RUNTIME_PROVIDER_BINDING', 'PER_CALL_REVISIONS']);
});

test('requires the independent artifact readback to include matching byte count/hash status', () => {
  const fixture = completeFixture();
  fixture.artifactReadback.status = 'NOT_PROVEN';
  const audit = evaluateModelReceiptReadbackV1(fixture);
  assert.equal(audit.status, 'NOT_PROVEN');
  assert.equal(audit.checks.find((entry) => entry.id === 'ARTIFACT_CHECKSUM')?.status, 'NOT_PROVEN');
});

test('requires a runtime artifact binding rather than a loaded name alone', () => {
  const fixture = completeFixture();
  fixture.runtimeReadback.artifactChecksum = null;
  const audit = evaluateModelReceiptReadbackV1(fixture);
  assert.equal(audit.status, 'NOT_PROVEN');
  assert.equal(audit.checks.find((entry) => entry.id === 'ACTIVE_RUNTIME_PROVIDER_BINDING')?.status, 'NOT_PROVEN');
});
