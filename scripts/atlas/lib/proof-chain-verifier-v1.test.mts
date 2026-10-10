import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEvidenceReceiptV1 } from '../audit-openspec-evidence-fabric-v1.mjs';
import { verifyProofChainV1 } from './proof-chain-verifier-v1.mts';
import { buildContextManifestV2 } from '../../../sveltekit-frontend/src/lib/server/atlas/graph/context-manifest-v2.js';

test('blocks incomplete evidence instead of manufacturing a live proof', () => {
  const result = verifyProofChainV1({
    taskCard: {},
    evidenceTask: {},
    evidenceCard: {},
    receipt: {},
    receiptBindings: [],
    ontologyTuple: {},
    contextManifest: {},
    artifactReadback: {
      source: 'FIXTURE',
      independentlyReopened: true,
      artifacts: [],
    },
  });

  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.writesPerformed, false);
  assert.deepEqual(result.passedStages, []);
  assert.ok(result.failedGates.some((gate) => gate.startsWith('TASK_ADMISSION:')));
  assert.ok(result.failedGates.some((gate) => gate.startsWith('EVIDENCE_RECEIPT:')));
  assert.ok(result.failedGates.some((gate) => gate.startsWith('ONTOLOGY_TUPLE:')));
  assert.ok(result.failedGates.some((gate) => gate.startsWith('CONTEXT_MANIFEST:')));
});

test('requires independent checksum readback even when other stages parse', () => {
  const result = verifyProofChainV1({
    taskCard: {},
    evidenceTask: {},
    evidenceCard: {},
    receipt: {},
    receiptBindings: [],
    ontologyTuple: {},
    contextManifest: {},
    artifactReadback: {
      source: 'FIXTURE',
      independentlyReopened: false,
      artifacts: [],
    },
  });

  assert.notEqual(result.status, 'LIVE_PROVEN');
  assert.ok(result.failedGates.includes('READBACK:INDEPENDENT_CHECKSUM_READBACK_REQUIRED'));
});

test('reports absent ontology and manifest inputs separately from invalid schemas', () => {
  const result = verifyProofChainV1({
    taskCard: {},
    evidenceTask: {},
    evidenceCard: {},
    receipt: {},
    receiptBindings: [],
    ontologyTuple: null,
    contextManifest: null,
    artifactReadback: {
      source: 'FIXTURE',
      independentlyReopened: true,
      artifacts: [],
    },
  });

  assert.ok(result.failedGates.includes('ONTOLOGY_TUPLE:INPUT_MISSING'));
  assert.ok(result.failedGates.includes('CONTEXT_MANIFEST:INPUT_MISSING'));
  assert.ok(!result.failedGates.some((gate) => gate.includes('SCHEMA_INVALID')));
});

test('does not accept a caller-supplied live-readback label as authority', () => {
  const untrustedReadback = {
    source: 'LIVE_READBACK',
    independentlyReopened: true,
    artifacts: [],
  } as unknown as Parameters<typeof verifyProofChainV1>[0]['artifactReadback'];
  const result = verifyProofChainV1({
    taskCard: {},
    evidenceTask: {},
    evidenceCard: {},
    receipt: {},
    receiptBindings: [],
    ontologyTuple: {},
    contextManifest: {},
    artifactReadback: untrustedReadback,
  });

  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.failedGates.includes('READBACK:AUTHORITATIVE_READBACK_OWNER_NOT_WIRED'));
});

test('keeps task-ledger revision distinct from the grounded code-source revision', () => {
  const taskRevision = `sha256:${'a'.repeat(64)}`;
  const taskLedgerRevision = `sha256:${'b'.repeat(64)}`;
  const codeRevision = `sha256:${'c'.repeat(64)}`;
  const workspaceRevision = `sha256:${'d'.repeat(64)}`;
  const evidenceChecksum = `sha256:${'e'.repeat(64)}`;
  const taskRef = 'openspec/changes/example/tasks.md#L5';
  const sourceRef = 'src/cache/valkey.ts';
  const evidenceId = 'receipt:example:VALKEY-1';
  const evidenceTask = { taskId: 'VALKEY-1', changeId: 'example', taskHash: taskRevision };
  const evidenceCard = { taskRef, sourceRef: taskRef, checksum: evidenceChecksum, evidenceIds: [evidenceId] };
  const receipt = buildEvidenceReceiptV1({
    schema: 'atlas.evidence-receipt.v1', evidenceId, evidenceType: 'TEST', changeId: 'example',
    taskId: 'VALKEY-1', claim: 'Test Valkey behavior', workspaceRevision, sourceRevision: taskLedgerRevision,
    taskRevision, sourceRefs: [{ file: sourceRef, lineStart: 1, lineEnd: 1, sourceRevision: codeRevision }],
    producer: 'node:test', inputs: [], observedAt: '2026-10-09T00:00:00Z',
    expectedAssertions: [{ id: 'test:1' }], actualAssertions: [{ id: 'test:1', passed: true }],
    outputs: [], independentVerifier: 'independent-test-readback', readbackRequired: true,
    readbackPerformed: true, verdict: 'PROVEN',
  });
  const result = verifyProofChainV1({
    taskCard: { sourceRevision: taskLedgerRevision, workspaceRevision },
    evidenceTask,
    evidenceCard,
    receipt,
    receiptBindings: [],
    ontologyTuple: {
      tupleId: 'tuple:1', schemaVersion: 'ontology-linked-tuple.v1', sourceRef,
      surfaceText: 'cache lookup', label: 'Valkey lookup', labelKind: 'ontology', labelSource: 'manual',
      ontologyIds: [], conceptIds: [], participants: [], evidenceRefs: [taskRef], confidence: 1,
      evidenceState: 'ACTIVE_VERIFIED',
      provenance: {
        sourceTables: [], labelerVersion: null, taggerVersion: null, ontologyVersion: null, nlpVersion: null,
        sourceRevision: codeRevision, workspaceRevision, taskRevision,
        evidenceCardChecksum: evidenceChecksum,
      },
    },
    contextManifest: {},
    artifactReadback: { source: 'FIXTURE', independentlyReopened: true, artifacts: [] },
  });

  assert.ok(result.passedStages.includes('ONTOLOGY_TUPLE'));
  assert.ok(result.passedStages.includes('EVIDENCE_RECEIPT'));
  assert.notEqual(taskLedgerRevision, codeRevision);
});

test('requires ContextManifest to reference the grounded tuple source, not only the task ledger', () => {
  const taskRef = 'openspec/changes/example/tasks.md#L5';
  const sourceRef = 'src/cache/valkey.ts';
  const contextManifest = buildContextManifestV2({
    schema: 'atlas.context-manifest.v1',
    requestId: 'request:fixture',
    snapshotId: 'snapshot:fixture',
    graphRevision: null,
    query: 'trace Valkey caching to ACE',
    candidateBucket: 1,
    candidateCount: 1,
    tokenBudget: 512,
    selectedNodeKeys: ['packet:fixture'],
    evidenceRefs: [taskRef],
    producerRevision: 'fixture-v1',
  }, {
    selectedOrdinalSetChecksum: `sha256:${'1'.repeat(64)}`,
    evidenceRevisions: {
      sourceRevision: `sha256:${'2'.repeat(64)}`,
      representationRevision: null,
      featureRevision: null,
      ontologyRevision: null,
      modelRevision: null,
      promptTemplateRevision: null,
    },
    ordinalMapChecksum: `sha256:${'3'.repeat(64)}`,
    retrievalPolicyRevision: 'policy:fixture-v1',
    acePlaybookRevision: 'ace:fixture-v1',
  });
  const result = verifyProofChainV1({
    taskCard: {},
    evidenceTask: {},
    evidenceCard: { sourceRef: taskRef },
    receipt: {},
    receiptBindings: [],
    ontologyTuple: { sourceRef },
    contextManifest,
    artifactReadback: { source: 'FIXTURE', independentlyReopened: true, artifacts: [] },
  });

  assert.ok(result.failedGates.includes('CONTEXT_MANIFEST:EVIDENCE_REFERENCES_INCOMPLETE'));
});
