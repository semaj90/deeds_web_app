import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyV2AdmissionLiveState, assertApplyAuthorized, buildRegistryV1PacketInsert, buildRegistryV1StorageAliasInsert, collisionReceiptFromInsertError } from './packet-key-v2-admission-v1.mjs';

const V2 = 'packet:8f2f58eb-e12a-5baf-923d-8897cc8f9505';
const base = { sourceRef: 'a/b.ts', packetKeyV2: V2, legacyKey: 'packet:fd038faf661d' };
const live = (over = {}) => ({ v2StoredFor: null, aliasedStorageKeys: [], existingStorageKeys: [], legacyStoredFor: null, ...over });

test('absent logical packet is ADMISSION_READY', () => assert.equal(classifyV2AdmissionLiveState({ ...base, live: live() }).status, 'ADMISSION_READY'));
test('same source stored under the V2 key is PACKET_NOW_EXISTS_VIA_V2', () => assert.equal(classifyV2AdmissionLiveState({ ...base, live: live({ v2StoredFor: 'a/b.ts' }) }).status, 'PACKET_NOW_EXISTS_VIA_V2'));
test('historical storage row (aliased or not yet aliased) is PACKET_NOW_EXISTS_VIA_LEGACY_ALIAS', () => {
  assert.equal(classifyV2AdmissionLiveState({ ...base, live: live({ existingStorageKeys: ['packet:fd038faf661d'], aliasedStorageKeys: ['packet:fd038faf661d'] }) }).status, 'PACKET_NOW_EXISTS_VIA_LEGACY_ALIAS');
  assert.equal(classifyV2AdmissionLiveState({ ...base, live: live({ existingStorageKeys: ['packet:fd038faf661d'] }) }).status, 'PACKET_NOW_EXISTS_VIA_LEGACY_ALIAS');
});
test('V2 key stored for a different source is a canonical collision, never a pick', () => assert.equal(classifyV2AdmissionLiveState({ ...base, live: live({ v2StoredFor: 'other.ts' }) }).status, 'PACKET_KEY_CANONICAL_COLLISION'));
test('two storage aliases to one V2 key is a canonical collision', () => assert.equal(classifyV2AdmissionLiveState({ ...base, live: live({ aliasedStorageKeys: ['packet:aaaaaaaaaaaa', 'packet:bbbbbbbbbbbb'] }) }).status, 'PACKET_KEY_CANONICAL_COLLISION'));
test('legacy key stored for another source, an alias to another source row, or a non-V2 key is IDENTITY_CONFLICT', () => {
  assert.equal(classifyV2AdmissionLiveState({ ...base, live: live({ legacyStoredFor: 'other.ts' }) }).status, 'IDENTITY_CONFLICT');
  assert.equal(classifyV2AdmissionLiveState({ ...base, live: live({ aliasedStorageKeys: ['packet:aaaaaaaaaaaa'], existingStorageKeys: ['packet:bbbbbbbbbbbb'] }) }).status, 'IDENTITY_CONFLICT');
  assert.equal(classifyV2AdmissionLiveState({ ...base, packetKeyV2: 'packet:fd038faf661d', live: live() }).status, 'IDENTITY_CONFLICT');
});
test('apply is unavailable without registry-v1 DDL and an authorization receipt bound to the exact manifest root', () => {
  const receipt = { schema: 'atlas.packet-admission-apply-authorization.v1', status: 'PACKET_ADMISSION_APPLY_AUTHORIZED', manifestRootSha256: 'r1' };
  assert.throws(() => assertApplyAuthorized({ authorizationReceipt: receipt, manifestRootSha256: 'r1', registryContractApplied: false }), /REGISTRY_V1_DDL_NOT_APPLIED/);
  assert.throws(() => assertApplyAuthorized({ authorizationReceipt: null, manifestRootSha256: 'r1', registryContractApplied: true }), /AUTHORIZATION_REQUIRED/);
  assert.throws(() => assertApplyAuthorized({ authorizationReceipt: receipt, manifestRootSha256: 'r2', registryContractApplied: true }), /AUTHORIZATION_REQUIRED/);
  assert.equal(assertApplyAuthorized({ authorizationReceipt: receipt, manifestRootSha256: 'r1', registryContractApplied: true }), true);
});
test('registry and storage-alias inserts are parameterized and never overwrite identity', () => {
  const entry = { packetKeyV2: V2, canonicalSourceRef: 'a/b.ts', sourceRevision: 'sha256:x', workspaceRevision: 'sha256:y', lineageBindingChecksum: 'z' };
  const identityInsert = buildRegistryV1PacketInsert(entry, { repositoryId: '01a13137-1378-7df9-9968-53738dbf0e48', repositoryScope: 'repo:root' });
  const aliasInsert = buildRegistryV1StorageAliasInsert(entry, { storagePacketKey: 'packet:fd038faf661d', evidenceRef: 'admission:root', evidenceDigest: `sha256:${'a'.repeat(64)}` });
  assert.match(identityInsert.text, /INSERT INTO atlas_packet_identity_registry_v1/);
  assert.match(aliasInsert.text, /INSERT INTO atlas_packet_identity_aliases_v1/);
  assert.doesNotMatch(identityInsert.text + aliasInsert.text, /ON CONFLICT/i);
  assert.equal(aliasInsert.values[0], aliasInsert.values[2]);
  assert.equal(collisionReceiptFromInsertError(entry, { code: '23505', constraint: 'atlas_packets_packet_key_key', detail: 'dup' }).status, 'PACKET_KEY_CANONICAL_COLLISION');
  assert.throws(() => collisionReceiptFromInsertError(entry, { code: '08006' }));
});
