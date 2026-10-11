import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectValkeyAceHandoffV1 } from './valkey-ace-handoff-v1.mjs';

const match = { hintId: 'h1', candidateOrdinal: 2, canonicalId: 'canonical1', packetKey: 'p1', sourceRef: 'a.ts', sourceRevision: 'rev1', workspaceRevision: 'w1' };
const accept = () => true;
const valid = () => ({
  cacheRead: { source: 'VALKEY_GET', cacheKey: 'k', cacheGeneration: 'g1', representationRevision: 'rr', hintId: 'h1', sourceRef: 'a.ts', packetKey: 'p1', sourceRevision: 'rev1', workspaceRevision: 'w1' },
  resolution: { schema: 'atlas.cached-packet-candidate-resolution.v1', canonicalAuthority: false, evidenceStatus: 'UNVERIFIED', ordinalMapChecksum: 'hash1', checksum: 'hash2', workspaceRevision: 'w1', matches: [{ ...match }] },
  sourceSpanVerification: { status: 'SOURCE_SPAN_VERIFIED_NOT_ADMITTED', canonicalAuthority: false, admitted: false, checksum: 'span1', spanChecksum: 'span2', evidenceRef: 'e1', ...match },
  verifyReceiptChecksum: accept,
});

test('diagnostic matching yields no admission, injection or tuple', () => {
  const out = inspectValkeyAceHandoffV1(valid());
  assert.equal(out.status, 'SOURCE_VERIFIED_NOT_ADMITTED');
  assert.equal(out.aceInjectionAuthorized, false);
  assert.equal(out.ontologyTuple, null);
  assert.equal(out.contextManifest, null);
  assert.equal(out.observation.candidateOrdinal, 2);
  assert.equal(out.checksum, inspectValkeyAceHandoffV1(valid()).checksum);
});
test('no observed Valkey get blocks', () => {
  const x = valid(); x.cacheRead.source = 'MOCK';
  assert.equal(inspectValkeyAceHandoffV1(x).reason, 'CACHE_READ_NOT_OBSERVED');
});
test('stale workspace blocks', () => {
  const x = valid(); x.cacheRead.workspaceRevision = 'old';
  assert.equal(inspectValkeyAceHandoffV1(x).reason, 'CACHE_CANONICAL_IDENTITY_MISMATCH');
});
test('stale cached source revision blocks', () => {
  const x = valid(); x.cacheRead.sourceRevision = 'rev0';
  assert.equal(inspectValkeyAceHandoffV1(x).reason, 'CACHE_SOURCE_REVISION_STALE');
});
test('cache read without a source revision blocks', () => {
  const x = valid(); delete x.cacheRead.sourceRevision;
  assert.equal(inspectValkeyAceHandoffV1(x).reason, 'CACHE_READ_SOURCE_REVISION_REQUIRED');
});
test('ambiguous candidates block', () => {
  const x = valid(); x.resolution.matches.push(match);
  assert.equal(inspectValkeyAceHandoffV1(x).reason, 'EXACTLY_ONE_CANONICAL_MATCH_REQUIRED');
});
test('missing source proof blocks', () => {
  const x = valid(); x.sourceSpanVerification = null;
  assert.equal(inspectValkeyAceHandoffV1(x).reason, 'SOURCE_SPAN_RECEIPT_MISSING_OR_MISMATCHED');
});
test('cache packet mismatch blocks', () => {
  const x = valid(); x.cacheRead.packetKey = 'wrong';
  assert.equal(inspectValkeyAceHandoffV1(x).status, 'BLOCKED');
});
test('missing checksum verifier blocks', () => {
  const x = valid(); delete x.verifyReceiptChecksum;
  assert.equal(inspectValkeyAceHandoffV1(x).reason, 'CHECKSUM_VERIFIER_REQUIRED');
});
test('unverified resolver or span checksum blocks', () => {
  const r = valid(); r.verifyReceiptChecksum = (kind) => kind !== 'resolution';
  assert.equal(inspectValkeyAceHandoffV1(r).reason, 'RESOLVER_CHECKSUM_NOT_VERIFIED');
  const s = valid(); s.verifyReceiptChecksum = (kind) => kind !== 'sourceSpan';
  assert.equal(inspectValkeyAceHandoffV1(s).reason, 'SOURCE_SPAN_CHECKSUM_NOT_VERIFIED');
});
test('verifier returning a non-true value is not accepted', () => {
  const x = valid(); x.verifyReceiptChecksum = () => 'yes';
  assert.equal(inspectValkeyAceHandoffV1(x).status, 'BLOCKED');
});
