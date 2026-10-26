import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTitleIdentityRowsV1, qualifyPacketUpdateTargetV1 } from './lib/title-identity-safety-v1.mjs';

const digest = `sha256:${'a'.repeat(64)}`;
const row = {
  packet_key: 'packet:abc', title_id: 'title:example:deadbeef', source_ref: 'src/a.ts',
  source_revision: 'sr1', workspace_revision: 'ws1', source_digest: digest,
};
const reasons = (rows, opts) => classifyTitleIdentityRowsV1(rows, opts).issues.map((i) => i.reason);

test('valid fixture remains fixture-only and non-authoritative', () => {
  const r = classifyTitleIdentityRowsV1([row]);
  assert.equal(r.status, 'CONSISTENT_FIXTURE');
  assert.equal(r.canonicalAuthority, false);
  assert.equal(r.writesPerformed, false);
});
test('null title stays an issue', () => {
  assert.deepEqual(reasons([{ ...row, title_id: null }]), ['TITLE_MISSING']);
});
test('foreign and cluster formats do not qualify as canonical', () => {
  assert.deepEqual(reasons([{ ...row, title_id: '112233445566' }]), ['TITLE_FORMAT_NONCANONICAL']);
  assert.deepEqual(reasons([{ ...row, title_id: 'cluster:0' }]), ['TITLE_FORMAT_NONCANONICAL']);
});
test('trailing-dash and double-dash slugs are NOT consistent (repo grammar)', () => {
  assert.deepEqual(reasons([{ ...row, title_id: 'title:some-slug-:a1b2c3d4' }]), ['TITLE_FORMAT_NONCANONICAL']);
  assert.deepEqual(reasons([{ ...row, title_id: 'title:a--b:a1b2c3d4' }]), ['TITLE_FORMAT_NONCANONICAL']);
  assert.deepEqual(reasons([{ ...row, title_id: 'title:a-b:a1b2c3d4' }]), []);
});
test('duplicate title is ambiguous', () => {
  assert.ok(reasons([row, { ...row, packet_key: 'packet:def' }]).includes('TITLE_AMBIGUOUS'));
});
test('generator drift is informational and does not block', () => {
  const r = classifyTitleIdentityRowsV1([row], { regenerate: () => 'title:example:00000000' });
  assert.equal(r.status, 'CONSISTENT_FIXTURE');
  assert.equal(r.issues[0].reason, 'TITLE_DIFFERS_FROM_CURRENT_GENERATOR');
  assert.equal(r.issues[0].informational, true);
});
test('regenerate must be a function', () => {
  assert.throws(() => classifyTitleIdentityRowsV1([row], { regenerate: 'x' }), /REGENERATE_MUST_BE_FUNCTION/);
});
test('exact matching identity qualifies target but cannot write', () => {
  const result = qualifyPacketUpdateTargetV1(row, row);
  assert.equal(result.status, 'QUALIFIED_TARGET_ONLY');
  assert.equal(result.writesPerformed, false);
  assert.equal(result.canonicalAuthority, false);
});
test('title label alone cannot qualify', () => {
  assert.equal(qualifyPacketUpdateTargetV1(row, { ...row, packet_key: 'packet:def' }).status, 'BLOCKED');
});
test('stale source revision, other workspace and digest drift block', () => {
  assert.equal(qualifyPacketUpdateTargetV1(row, { ...row, source_revision: 'sr2' }).field, 'source_revision');
  assert.equal(qualifyPacketUpdateTargetV1(row, { ...row, workspace_revision: 'ws2' }).field, 'workspace_revision');
  assert.equal(qualifyPacketUpdateTargetV1(row, { ...row, source_digest: `sha256:${'b'.repeat(64)}` }).field, 'source_digest');
});
test('malformed source digest blocks even when both sides agree', () => {
  const bad = { ...row, source_digest: 'sha256:a' };
  assert.equal(qualifyPacketUpdateTargetV1(bad, bad).reason, 'SOURCE_DIGEST_FORMAT_INVALID');
});
test('label mismatch blocks', () => {
  assert.equal(qualifyPacketUpdateTargetV1(row, { ...row, title_id: 'title:other:deadbeef' }).reason, 'TITLE_LABEL_MISMATCH');
});
