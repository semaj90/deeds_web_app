import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAceRepairPacketV1 } from '../src/core/ace-repair-packet-v1.ts';

const revision = (char) => `sha256:${char.repeat(64)}`;
const packet = () => ({
  schema: 'atlas.ace-repair-packet.v1',
  requestId: 'request:repair:1',
  candidateSnapshotRevision: revision('1'),
  ordinalMapChecksum: revision('2'),
  selectedCandidateOrdinals: [0, 2],
  packetRefs: ['packet:1'],
  sourceRefs: ['docs/runtime.md'],
  sourceRevisions: [revision('3')],
  evidenceRefs: ['evidence:1'],
  diagnosticRef: 'diagnostic:1',
  structuralEvidenceRefs: ['ast:1'],
  documentationRuleRefs: ['api-rule:1'],
  graphEvidenceRefs: [],
  representationRefs: [],
  canonicalAuthority: false,
  writesPerformed: false,
});

test('accepts a descriptor-only repair packet with revision-qualified inputs', () => {
  assert.equal(parseAceRepairPacketV1(packet()).canonicalAuthority, false);
});

for (const field of ['hiddenThoughts', 'chainOfThought', 'kv_cache', 'tensor', 'rawPrompt']) {
  test(`rejects forbidden or unknown field ${field}`, () => {
    assert.throws(() => parseAceRepairPacketV1({ ...packet(), [field]: 'must-not-cross-boundary' }));
  });
}

test('rejects an unqualified source revision', () => {
  assert.throws(() => parseAceRepairPacketV1({ ...packet(), sourceRevisions: ['workspace:0'] }));
});

test('rejects canonical or persistent-write authority', () => {
  assert.throws(() => parseAceRepairPacketV1({ ...packet(), canonicalAuthority: true }));
  assert.throws(() => parseAceRepairPacketV1({ ...packet(), writesPerformed: true }));
});

test('rejects source/revision cardinality mismatch and duplicate candidate ordinals', () => {
  assert.throws(() => parseAceRepairPacketV1({ ...packet(), sourceRevisions: [] }));
  assert.throws(() => parseAceRepairPacketV1({ ...packet(), selectedCandidateOrdinals: [1, 1] }));
});
