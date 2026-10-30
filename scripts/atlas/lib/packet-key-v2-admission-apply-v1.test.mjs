import test from 'node:test';
import assert from 'node:assert/strict';
import { sha256Of } from './packet-source-revision-repair-v1.mjs';
import { ADMISSION_MANIFEST_SCHEMA, ADMISSION_SHARD_SCHEMA, ALIAS_KIND, planAdmissionApply, verifyAdmissionManifest } from './packet-key-v2-admission-apply-v1.mjs';

const KEY = (n) => `packet:00000000-0000-5000-8000-${String(n).padStart(12, '0')}`;
const deriveKey = (scope, ref) => KEY(Number(ref.split('/').pop().replace(/\D/g, '')));
const entry = (n, overrides = {}) => ({
  repositoryScope: 'repo:root', canonicalSourceRef: `src/f${n}.ts`, sourceRevision: `sha256:${'a'.repeat(64)}`, packetKind: 'SOURCE_FILE',
  packetKeyV2: KEY(n), sourceEvidenceChecksum: 'b'.repeat(64), status: 'ADMISSION_READY',
  storageDisposition: { existingStorageKeys: [`packet:${String(n).padStart(12, '0')}`] },
  ...overrides,
});

function manifestOf(entries, mutate = () => {}) {
  const shardBody = { schema: ADMISSION_SHARD_SCHEMA, entries };
  const root = {
    schema: ADMISSION_MANIFEST_SCHEMA, entryCount: entries.length,
    shards: [{ name: 'shard-0000.json', sha256: sha256Of(shardBody), entryCount: entries.length }],
    accounting: { classes: { ADMISSION_READY: entries.length, IDENTITY_CONFLICT: 0 }, rejections: 0 },
  };
  mutate(root, shardBody);
  return { root, rootDirName: sha256Of(root), shards: { 'shard-0000.json': shardBody } };
}

test('a consistent all-ready manifest verifies and returns every entry', () => {
  const result = verifyAdmissionManifest(manifestOf([entry(1), entry(2)]));
  assert.equal(result.ok, true);
  assert.equal(result.entries.length, 2);
});

test('a tampered shard, root or accounting fails closed', () => {
  const tamperedShard = manifestOf([entry(1)]);
  tamperedShard.shards['shard-0000.json'].entries[0].packetKeyV2 = KEY(9);
  assert.match(verifyAdmissionManifest(tamperedShard).errors.join(), /SHARD_SHA256_MISMATCH/);

  const wrongDir = manifestOf([entry(1)]);
  wrongDir.rootDirName = 'c'.repeat(64);
  assert.match(verifyAdmissionManifest(wrongDir).errors.join(), /ROOT_SHA256_DOES_NOT_MATCH_DIRECTORY/);

  const notReady = manifestOf([entry(1)], (root) => { root.accounting.classes.IDENTITY_CONFLICT = 2; });
  assert.match(verifyAdmissionManifest(notReady).errors.join(), /MANIFEST_HAS_NON_READY_CLASSES:IDENTITY_CONFLICT=2/);

  const rejected = manifestOf([entry(1)], (root) => { root.accounting.rejections = 1; });
  assert.match(verifyAdmissionManifest(rejected).errors.join(), /MANIFEST_HAS_REJECTIONS/);
});

test('the plan builds one registry row per entry and one alias per single storage packet', () => {
  const plan = planAdmissionApply({ entries: [entry(1), entry(2)], repositoryScope: 'repo:root', repositoryId: 'repo-uuid', rootSha256: 'r'.repeat(64), deriveKey });
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.registryRows.length, 2);
  assert.deepEqual(plan.registryRows[0], { packet_key: KEY(1), repository_id: 'repo-uuid', membership_repository_scope: 'repo:root', source_ref: 'src/f1.ts', packet_kind: 'SOURCE_FILE' });
  assert.equal(plan.aliasRows.length, 2);
  assert.equal(plan.aliasRows[0].alias_key, plan.aliasRows[0].storage_packet_key);
  assert.equal(plan.aliasRows[0].alias_kind, ALIAS_KIND);
  assert.equal(plan.aliasRows[0].evidence_digest, `sha256:${'b'.repeat(64)}`);
});

test('entries without, with several, or with canonical storage packets get no alias and are accounted for', () => {
  const plan = planAdmissionApply({
    entries: [
      entry(1, { storageDisposition: { existingStorageKeys: [] } }),
      entry(2, { storageDisposition: { existingStorageKeys: ['packet:aaaaaaaaaaaa', 'ace:packet:aaaaaaaaaaaa'] } }),
      entry(3, { storageDisposition: { existingStorageKeys: [KEY(3)] } }),
    ],
    repositoryScope: 'repo:root', repositoryId: 'repo-uuid', rootSha256: 'r'.repeat(64), deriveKey,
  });
  assert.equal(plan.registryRows.length, 3);
  assert.equal(plan.aliasRows.length, 0);
  assert.equal(plan.skipped.noStoragePacket, 1);
  assert.equal(plan.skipped.storageIsCanonical, 1);
  assert.deepEqual(plan.skipped.ambiguousStorage.map((item) => item.sourceRef), ['src/f2.ts']);
});

test('the manifest key is never trusted: a mismatching derivation is an error', () => {
  const plan = planAdmissionApply({ entries: [entry(1, { packetKeyV2: KEY(7) })], repositoryScope: 'repo:root', repositoryId: 'repo-uuid', rootSha256: 'r'.repeat(64), deriveKey });
  assert.match(plan.errors.join(), /PACKET_KEY_V2_MISMATCH/);
  assert.equal(plan.registryRows.length, 0);
});

test('wrong scope, non-ready status, duplicate keys and bad digests are rejected', () => {
  const plan = planAdmissionApply({
    entries: [
      entry(1, { repositoryScope: 'repo:other' }),
      entry(2, { status: 'PACKET_NOW_EXISTS_VIA_V2' }),
      entry(3), entry(3, { canonicalSourceRef: 'other/f3.ts' }),
      entry(4, { sourceEvidenceChecksum: 'nothex' }),
    ],
    repositoryScope: 'repo:root', repositoryId: 'repo-uuid', rootSha256: 'r'.repeat(64), deriveKey,
  });
  const text = plan.errors.join('\n');
  assert.match(text, /ENTRY_SCOPE_MISMATCH/);
  assert.match(text, /ENTRY_NOT_READY/);
  assert.match(text, /DUPLICATE_PACKET_KEY_V2/);
  assert.match(text, /EVIDENCE_DIGEST_INVALID/);
});
