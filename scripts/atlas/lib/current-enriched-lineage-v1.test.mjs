import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCurrentEnrichedLineageV1 as classify } from './current-enriched-lineage-v1.mjs';

const REV = 'sha256:' + 'a'.repeat(64);

test('packet source revision controls qualification; stale sha256 remains an explicit nonblocking state', () => {
  assert.equal(classify({ packetKey: 'p', packetSourceRevision: REV, sourceRevision: REV, packetSha256: 'a'.repeat(64) }), 'REVISION_QUALIFIED');
  assert.equal(classify({ packetKey: 'p', packetSourceRevision: REV, sourceRevision: REV, packetSha256: 'b'.repeat(64) }), 'REVISION_QUALIFIED_PACKET_SHA256_STALE');
  assert.equal(classify({ packetKey: 'p', packetSourceRevision: REV, sourceRevision: REV, packetSha256: null }), 'REVISION_QUALIFIED');
});

test('missing or contradictory packet source revision stays fail-closed', () => {
  assert.equal(classify({ packetKey: 'p', packetSourceRevision: null, sourceRevision: REV }), 'REVISION_MISSING');
  assert.equal(classify({ packetKey: 'p', packetSourceRevision: REV, sourceRevision: null }), 'REVISION_MISSING');
  assert.equal(classify({ packetKey: 'p', packetSourceRevision: 'sha256:' + 'b'.repeat(64), sourceRevision: REV }), 'REVISION_CONFLICT');
});

test('packet absence retains the existing unresolved versus legacy-only distinction', () => {
  assert.equal(classify({ packetKey: null, sourceRevision: REV, chunkRows: 0 }), 'IDENTITY_UNRESOLVED');
  assert.equal(classify({ packetKey: null, sourceRevision: REV, chunkRows: 2 }), 'LEGACY_ONLY');
});
