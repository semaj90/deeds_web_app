import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveModelBinding } from './plan-openspec-evidence-embeddings-v1.mjs';

const SHA = 'bc843658e96d2e9cc7c3402332b158f0cc4f73e61b23cef9a41acee1c0d372b7';
const NOW = Date.parse('2026-10-03T12:00:00Z');
const receipt = (over = {}) => ({
  schema: 'atlas.emb-prov-01-embedding-provenance-receipt.v1',
  generatedAt: '2026-10-01T12:00:00Z',
  status: 'EMB_PROV_01_PROVEN',
  artifact: {
    modelPath: 'C:\\models\\embeddinggemma-300m-f16.gguf',
    recordedModelArtifactRevision: SHA,
    artifactChecksumMatchesRevision: true,
    artifactChecksumMatchesGgufVar: true
  },
  crossExecutorParity: { executorsAgree: true, parity: { dim: 768 } },
  provenanceFields: { tokenizerRevision: 'tok-rev', inputPolicyRevision: 'semantic-input-v1' },
  runtimeLoadedArtifact: { loadedMatchesArtifact: true },
  ...over
});

test('a fresh proven receipt binds model id and artifact revision', () => {
  const b = resolveModelBinding({ receipt: receipt(), now: NOW });
  assert.equal(b.proven, true);
  assert.equal(b.modelId, 'embeddinggemma-300m-f16');
  assert.equal(b.modelArtifactRevision, SHA);
  assert.equal(b.source, 'EMB_PROV_01_RECEIPT');
});

test('missing receipt stays unproven', () => {
  const b = resolveModelBinding({ receipt: null, now: NOW });
  assert.equal(b.proven, false);
  assert.equal(b.modelId, null);
  assert.equal(b.reason, 'RECEIPT_MISSING');
});

test('env strings alone are never proof', () => {
  const b = resolveModelBinding({ env: { modelId: 'x', modelArtifactRevision: 'y' }, receipt: receipt(), now: NOW });
  assert.equal(b.proven, false);
  assert.equal(b.source, 'ENV_OVERRIDE');
});

test('stale, mismatched, wrong-dimension or disagreeing receipts fail closed', () => {
  assert.match(resolveModelBinding({ receipt: receipt({ generatedAt: '2026-09-01T00:00:00Z' }), now: NOW }).reason, /fresh/);
  const bad = receipt();
  bad.artifact.artifactChecksumMatchesRevision = false;
  assert.match(resolveModelBinding({ receipt: bad, now: NOW }).reason, /artifactChecksumMatches/);
  assert.match(resolveModelBinding({ receipt: receipt({ crossExecutorParity: { executorsAgree: false, parity: { dim: 768 } } }), now: NOW }).reason, /executorsAgree/);
  assert.match(resolveModelBinding({ receipt: receipt({ crossExecutorParity: { executorsAgree: true, parity: { dim: 384 } } }), now: NOW }).reason, /dimension768/);
  assert.match(resolveModelBinding({ receipt: receipt({ status: 'EMB_PROV_01_FAILED' }), now: NOW }).reason, /statusProven/);
  const nonSha = receipt();
  nonSha.artifact.recordedModelArtifactRevision = 'latest';
  assert.match(resolveModelBinding({ receipt: nonSha, now: NOW }).reason, /revisionIsSha256/);
});

test('a failed receipt exposes no model identity', () => {
  const b = resolveModelBinding({ receipt: receipt({ status: 'NOPE' }), now: NOW });
  assert.equal(b.modelId, null);
  assert.equal(b.modelArtifactRevision, null);
});

test('missing tokenizer/input-policy revisions or a mismatched runtime artifact fail closed', () => {
  assert.match(resolveModelBinding({ receipt: receipt({ provenanceFields: { tokenizerRevision: 'x' } }), now: NOW }).reason, /provenanceFieldsRecorded/);
  assert.match(resolveModelBinding({ receipt: receipt({ runtimeLoadedArtifact: { loadedMatchesArtifact: null } }), now: NOW }).reason, /runtimeLoadedArtifactMatches/);
  const ok = resolveModelBinding({ receipt: receipt(), now: NOW });
  assert.equal(ok.provenance.inputPolicyRevision, 'semantic-input-v1');
});
