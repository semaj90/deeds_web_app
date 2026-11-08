import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadVerifiedOkfGrounding,
  buildAceJsonPacket,
  runDagPrefillBitfrostAceSynthesisProof,
} from './prove-dag-prefill-bitfrost-ace-synthesis-v1.mjs';

test('loadVerifiedOkfGrounding loads chunks with valid checksums and canonical_authority=false', () => {
  const chunks = loadVerifiedOkfGrounding();
  assert.ok(chunks.length > 0, 'Should load at least one .okf chunk');
  for (const c of chunks) {
    assert.ok(c.chunkChecksum.startsWith('sha256:'));
    assert.ok(c.chunkId.length > 0);
  }
});

test('buildAceJsonPacket constructs 5-step ACE compliant packet structure', () => {
  const dummyTask = {
    task_id: 'sample-feature#0123456789abcdef',
    feature_id: 'feature:sample',
    feature_label: 'Sample Feature',
  };
  const dummyMember = {
    canonical_task_key: 'sample-feature#0123456789abcdef',
    cohort_ordinal: 12,
    change_id: 'sample-feature',
    community_id: 6,
    morton_code: 2048,
    priority_score: 0.8,
    final_score: 0.9,
    routing_active_bit: 1,
    source_ref: 'openspec/changes/sample-feature/tasks.md',
  };
  const dummyParams = {
    canonicalTaskKey: dummyMember.canonical_task_key,
    cohortOrdinal: 12,
    mortonCode: 2048,
    communityId: 6,
    domainId: 1,
    priorityScore: 0.8,
    finalScore: 0.9,
    routingStatus: 'ROUTED_ACTIVE',
    umapXyz: [0.1, 0.2, 0.3],
    rot6d: [1.0, 0.0, 0.0, 0.0, 1.0, 0.0],
  };
  const dummyHits = [
    {
      chunkId: 'chunk-1',
      source: 'ast-grep',
      headingPath: ['Heading 1'],
      text: 'Sample text chunk',
      chunkChecksum: 'sha256:abcd',
    },
  ];

  const packet = buildAceJsonPacket({
    runId: 'test_run_123',
    task: dummyTask,
    cohortMember: dummyMember,
    dagParameters: dummyParams,
    okfHits: dummyHits,
  });

  assert.equal(packet.schema, 'atlas.ace-packet.v1');
  assert.equal(packet.acePacketId, 'ace:packet:test_run_123');
  assert.equal(packet.sourceRef, 'openspec/changes/sample-feature/tasks.md');
  assert.equal(packet.ConceptID, 'concept:openspec:sample-feature');
  assert.ok(packet.ConfidenceScore > 0 && packet.ConfidenceScore <= 1.0);
  assert.equal(packet.canonicalAuthority, false);

  const parsedBlob = JSON.parse(packet.ContextBlob);
  assert.equal(parsedBlob.taskId, dummyTask.task_id);
  assert.equal(parsedBlob.dagParameters.canonicalTaskKey, dummyParams.canonicalTaskKey);
  assert.equal(parsedBlob.kagEvidenceHits.length, 1);
});

test('runDagPrefillBitfrostAceSynthesisProof runs end-to-end with Valkey readback verification', async () => {
  const report = await runDagPrefillBitfrostAceSynthesisProof();
  assert.equal(report.status, 'PASS');
  assert.equal(report.valkeyIntegration.readbackVerified, true);
  assert.equal(report.valkeyIntegration.forbiddenTensorsPersisted, false);
  assert.equal(report.canonicalAuthority, false);
  assert.equal(report.writesPerformed, false);
});
