import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyV2AdmissionLiveState, assertApplyAuthorized, buildV2PacketInsert, collisionReceiptFromInsertError } from './packet-key-v2-admission-v1.mjs';

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
test('apply is unavailable without applied DDL and an authorization receipt bound to the exact manifest root', () => {
  const receipt = { schema: 'atlas.packet-admission-apply-authorization.v1', status: 'PACKET_ADMISSION_APPLY_AUTHORIZED', manifestRootSha256: 'r1' };
  assert.throws(() => assertApplyAuthorized({ authorizationReceipt: receipt, manifestRootSha256: 'r1', aliasKindDdlApplied: false }), /ALIAS_DDL_NOT_APPLIED/);
  assert.throws(() => assertApplyAuthorized({ authorizationReceipt: null, manifestRootSha256: 'r1', aliasKindDdlApplied: true }), /AUTHORIZATION_REQUIRED/);
  assert.throws(() => assertApplyAuthorized({ authorizationReceipt: receipt, manifestRootSha256: 'r2', aliasKindDdlApplied: true }), /AUTHORIZATION_REQUIRED/);
  assert.equal(assertApplyAuthorized({ authorizationReceipt: receipt, manifestRootSha256: 'r1', aliasKindDdlApplied: true }), true);
});
test('the V2 insert has no ON CONFLICT clause and a unique violation becomes a collision receipt', () => {
  const entry = { packetKeyV2: V2, canonicalSourceRef: 'a/b.ts', sourceRevision: 'sha256:x', workspaceRevision: 'sha256:y', lineageBindingChecksum: 'z' };
  const insert = buildV2PacketInsert(entry, { packetId: 'p', directoryPath: 'a', featureId: 'f', domainClass: 'd', sourceKind: 'codebase_chunk' });
  assert.doesNotMatch(insert.text, /ON CONFLICT/i);
  assert.equal(collisionReceiptFromInsertError(entry, { code: '23505', constraint: 'atlas_packets_packet_key_key', detail: 'dup' }).status, 'PACKET_KEY_CANONICAL_COLLISION');
  assert.throws(() => collisionReceiptFromInsertError(entry, { code: '08006' }));
});
