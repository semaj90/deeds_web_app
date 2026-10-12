import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createSourceBindingResolverV1, snapshotBindingFetcherV1, verifySourceBytesAgainstBindingV1, verifyBindingAgainstExactReaderV1, verifyPacketSourceLinkV1 } from './source-binding-resolver-v1.mjs';
import { admitObservationFeaturePlanRowV2 } from './observation-feature-lineage-admission-v2.mjs';

const hash = (c) => `sha256:${c.repeat(64)}`;
const WS = hash('c');
const binding = (o = {}) => ({
  workspace_revision: WS, canonical_source_ref: 'src/a.ts', source_revision: hash('b'), content_digest: hash('b'),
  binding_checksum: 'bc-1', byte_length: '123', ...o,
});
const resolverFor = (rows) => createSourceBindingResolverV1(snapshotBindingFetcherV1(rows));
const q = { workspaceRevision: WS, sourceRef: 'src/a.ts' };

test('one exact binding resolves, non-authoritative and frozen', () => {
  const r = resolverFor([binding()])(q);
  assert.equal(r.sourceRevision, hash('b'));
  assert.equal(r.bindingChecksum, 'bc-1');
  assert.equal(r.sourceRef, q.sourceRef);
  assert.equal(r.workspaceRevision, q.workspaceRevision);
  assert.equal(r.producerRevision, null);
  assert.equal(r.byteLength, 123);
  assert.equal(r.canonicalAuthority, false);
  assert.ok(Object.isFrozen(r));
});
test('fail closed: none, ambiguous, other workspace/source, malformed digests, empty checksum', () => {
  assert.equal(resolverFor([])(q), null);
  assert.equal(resolverFor([binding(), binding({ binding_checksum: 'bc-2' })])(q), null);
  assert.equal(resolverFor([binding({ workspace_revision: hash('d') })])(q), null);
  assert.equal(resolverFor([binding({ canonical_source_ref: 'src/other.ts' })])(q), null);
  assert.equal(resolverFor([binding({ source_revision: 'abc' })])(q), null);
  assert.equal(resolverFor([binding({ content_digest: 'sha256:short' })])(q), null);
  assert.equal(resolverFor([binding({ binding_checksum: ' ' })])(q), null);
  assert.equal(resolverFor([binding()])({ workspaceRevision: '', sourceRef: 'src/a.ts' }), null);
});
test('live spelling: bare 64-hex content_digest equal to the source revision resolves and is normalized to the prefixed form', () => {
  const r = resolverFor([binding({ content_digest: 'b'.repeat(64) })])(q);
  assert.equal(r.contentDigest, hash('b'));
  // a bare digest that differs from the source revision is NOT the same bytes: fail closed
  assert.equal(resolverFor([binding({ content_digest: 'e'.repeat(64) })])(q), null);
  assert.equal(resolverFor([binding({ content_digest: hash('e') })])(q), null);
});
test('a fetcher that returns a non-array fails closed; the factory requires a function', () => {
  assert.equal(createSourceBindingResolverV1(() => 'rows')(q), null);
  assert.throws(() => createSourceBindingResolverV1(null), /FETCH_BINDING_ROWS_REQUIRED/);
});
test('wired into V2 admission: matching binding + injected approval admits a receipt-less row; stale source revision blocks', () => {
  const approval = (rev) => ({ registry_revision: rev, runtime_eligible: false, canonical_authority: false });
  const row = { packetKey: 'p:1', sourceRef: 'src/a.ts', sourceRevision: hash('b'), featureRevision: 'f:v1', registryRevision: 'reg-r7', inputDigest: 'a'.repeat(64), evidenceRefs: ['span:1'], sourceVersionReceiptId: null };
  const ok = admitObservationFeaturePlanRowV2(row, WS, { resolveRegistryApproval: approval, resolveSourceBinding: resolverFor([binding()]) });
  assert.equal(ok.state, 'ADMITTED_FOR_PROJECTION');
  const stale = admitObservationFeaturePlanRowV2({ ...row, sourceRevision: hash('d') }, WS, { resolveRegistryApproval: approval, resolveSourceBinding: resolverFor([binding()]) });
  assert.ok(stale.blocks.includes('BLOCKED_SOURCE_BINDING_MISMATCH'));
});

test('untrusted producer: an operator-provided producer-family allowlist rejects other producers and is required to be well-formed', () => {
  const rows = [binding({ producer_revision: 'graphify-execution-membership-v2:run-1' })];
  const trusted = createSourceBindingResolverV1(snapshotBindingFetcherV1(rows), { trustedProducerPrefixes: ['graphify-execution-membership-v2:'] });
  assert.ok(trusted(q));
  const other = createSourceBindingResolverV1(snapshotBindingFetcherV1(rows), { trustedProducerPrefixes: ['workspace-revision-content-reconciliation.v1:'] });
  assert.equal(other(q), null);
  assert.equal(createSourceBindingResolverV1(snapshotBindingFetcherV1([binding({ producer_revision: undefined })]), { trustedProducerPrefixes: ['x:'] })(q), null);
  assert.throws(() => createSourceBindingResolverV1(snapshotBindingFetcherV1([]), { trustedProducerPrefixes: [] }), /TRUSTED_PRODUCER_PREFIXES_INVALID/);
});
test('byte readback: matching bytes verify; changed bytes or length do not; a resolved binding alone is not a readback', () => {
  const bytes = new Uint8Array(Buffer.from('export const a = 1;\n', 'utf8'));
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const b = resolverFor([binding({ source_revision: digest, content_digest: digest, byte_length: String(bytes.byteLength) })])(q);
  assert.equal(verifySourceBytesAgainstBindingV1(b, bytes).status, 'SOURCE_BYTES_MATCH_BINDING');
  assert.equal(verifySourceBytesAgainstBindingV1(b, new Uint8Array(Buffer.from('export const a = 2;\n'))).status, 'BLOCKED_DIGEST_MISMATCH');
  assert.equal(verifySourceBytesAgainstBindingV1({ ...b, byteLength: 1 }, bytes).status, 'BLOCKED_BYTE_LENGTH_MISMATCH');
  assert.equal(verifySourceBytesAgainstBindingV1(null, bytes).status, 'BLOCKED_BINDING_OR_BYTES_MISSING');
  assert.equal(verifySourceBytesAgainstBindingV1(b, 'text').verified, false);
});
test('stale workspace revision: a binding recorded under another workspace never resolves for this one', () => {
  assert.equal(resolverFor([binding({ workspace_revision: hash('9') })])(q), null);
});

test('exact-reader comparison: matching file digest + length verify; dirty/missing/escaped/other-length results block', () => {
  const b = resolverFor([binding({ source_revision: hash('b'), content_digest: 'b'.repeat(64), byte_length: '10' })])(q);
  const ok = { file_found: true, file_sha256: 'b'.repeat(64), file_byte_length: 10 };
  assert.equal(verifyBindingAgainstExactReaderV1(b, ok).status, 'WORKING_TREE_BYTES_MATCH_BINDING');
  assert.equal(verifyBindingAgainstExactReaderV1(b, { ...ok, file_sha256: 'e'.repeat(64) }).status, 'BLOCKED_WORKING_TREE_DIGEST_DIFFERS_FROM_BINDING');
  assert.equal(verifyBindingAgainstExactReaderV1(b, { ...ok, file_byte_length: 11 }).status, 'BLOCKED_BYTE_LENGTH_MISMATCH');
  assert.equal(verifyBindingAgainstExactReaderV1(b, { file_found: false, file_sha256: null, file_byte_length: null }).status, 'BLOCKED_SOURCE_FILE_UNAVAILABLE');
  assert.equal(verifyBindingAgainstExactReaderV1(null, ok).status, 'BLOCKED_BINDING_OR_READER_RESULT_MISSING');
});

test('packet<->source link: exactly one packet row with the same packet_key and source_ref; everything else blocks', () => {
  const req = { packetKey: 'ace:packet:0123456789ab', sourceRef: 'src/a.ts' };
  const row = { packet_key: req.packetKey, source_ref: req.sourceRef, source_revision: 'sha256:source-r1' };
  assert.equal(verifyPacketSourceLinkV1(req, [row]).status, 'PACKET_SOURCE_LINK_VERIFIED');
  assert.equal(verifyPacketSourceLinkV1(req, []).status, 'BLOCKED_PACKET_NOT_FOUND');
  assert.equal(verifyPacketSourceLinkV1(req, [row, row]).status, 'BLOCKED_PACKET_KEY_AMBIGUOUS');
  assert.equal(verifyPacketSourceLinkV1(req, [{ ...row, packet_key: 'packet:0123456789ab' }]).status, 'BLOCKED_PACKET_KEY_MISMATCH');
  assert.equal(verifyPacketSourceLinkV1(req, [{ ...row, source_ref: 'src/other.ts' }]).status, 'BLOCKED_PACKET_SOURCE_REF_MISMATCH');
  assert.equal(verifyPacketSourceLinkV1({ ...req, sourceRevision: row.source_revision }, [row]).status, 'PACKET_SOURCE_LINK_VERIFIED');
  assert.equal(verifyPacketSourceLinkV1({ ...req, sourceRevision: 'sha256:source-r2' }, [row]).status, 'BLOCKED_PACKET_SOURCE_REVISION_MISMATCH');
  assert.equal(verifyPacketSourceLinkV1({ ...req, sourceRevision: row.source_revision }, [{ ...row, source_revision: null }]).status, 'BLOCKED_PACKET_SOURCE_REVISION_MISMATCH');
  assert.equal(verifyPacketSourceLinkV1({ packetKey: '', sourceRef: 'x' }, [row]).status, 'BLOCKED_PACKET_LINK_INPUT_INVALID');
  assert.equal(verifyPacketSourceLinkV1(req, null).verified, false);
});
