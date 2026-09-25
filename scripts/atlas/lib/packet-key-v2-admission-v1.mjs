/**
 * PacketKeyV2 admission — shared, datastore-free rules used by the manifest builder and the writer.
 * The manifest is produced by the TypeScript PacketKeyV2 owner; nothing here derives a key from source_ref.
 * Applying is NOT implemented here: apply requires an explicit authorization receipt (see assertApplyAuthorized).
 */
import fs from 'node:fs';
import path from 'node:path';
import { sha256Of } from './packet-source-revision-repair-v1.mjs';

export const PACKET_KEY_V2_RE = /^packet:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const ADMISSION_STATUSES = Object.freeze([
  'ADMISSION_READY', 'PACKET_NOW_EXISTS_VIA_V2', 'PACKET_NOW_EXISTS_VIA_LEGACY_ALIAS', 'PACKET_KEY_CANONICAL_COLLISION', 'IDENTITY_CONFLICT',
]);

/**
 * Classify one entry against live state. `live` = {
 *   v2StoredFor: source_ref stored under the V2 key | null,
 *   aliasedStorageKeys: storage keys aliased to this V2 key (kind PACKET_KEY_V1_STORAGE_TO_V2),
 *   existingStorageKeys: atlas_packets keys already stored for this exact source_ref,
 *   legacyStoredFor: source_ref stored under this entry's derived legacy key | null }
 * Never picks between conflicting rows and never re-derives identity.
 */
export function classifyV2AdmissionLiveState({ sourceRef, packetKeyV2, legacyKey, live }) {
  if (!PACKET_KEY_V2_RE.test(packetKeyV2)) return { status: 'IDENTITY_CONFLICT', code: 'KEY_NOT_V2', detail: packetKeyV2 };
  if (live.v2StoredFor != null && live.v2StoredFor !== sourceRef) {
    return { status: 'PACKET_KEY_CANONICAL_COLLISION', code: 'V2_KEY_STORED_FOR_OTHER_SOURCE', detail: `${packetKeyV2} stored for ${live.v2StoredFor}` };
  }
  if (live.aliasedStorageKeys.length > 1) {
    return { status: 'PACKET_KEY_CANONICAL_COLLISION', code: 'MULTIPLE_STORAGE_ALIASES', detail: live.aliasedStorageKeys.join(',') };
  }
  if (live.legacyStoredFor != null && live.legacyStoredFor !== sourceRef) {
    return { status: 'IDENTITY_CONFLICT', code: 'LEGACY_KEY_STORED_FOR_OTHER_SOURCE', detail: `${legacyKey} stored for ${live.legacyStoredFor}` };
  }
  if (live.aliasedStorageKeys.length === 1 && !live.existingStorageKeys.includes(live.aliasedStorageKeys[0])) {
    return { status: 'IDENTITY_CONFLICT', code: 'ALIAS_STORAGE_KEY_NOT_THIS_SOURCE', detail: live.aliasedStorageKeys[0] };
  }
  if (live.v2StoredFor != null) return { status: 'PACKET_NOW_EXISTS_VIA_V2', code: null, detail: null };
  if (live.aliasedStorageKeys.length === 1 || live.existingStorageKeys.length > 0) return { status: 'PACKET_NOW_EXISTS_VIA_LEGACY_ALIAS', code: null, detail: null };
  return { status: 'ADMISSION_READY', code: null, detail: null };
}

/** Read and integrity-check a frozen PacketKeyV2 admission manifest directory. Throws on any checksum/shape defect. */
export function loadPacketKeyV2AdmissionManifest(dir, expectedRootSha256) {
  const root = JSON.parse(fs.readFileSync(path.join(dir, 'root.json'), 'utf8'));
  if (root.schema !== 'atlas.packet-key-v2-admission-manifest.v1') throw new Error('V2_MANIFEST_SCHEMA_MISMATCH');
  if (sha256Of(root) !== expectedRootSha256 || path.basename(dir) !== expectedRootSha256) throw new Error('V2_MANIFEST_ROOT_CHECKSUM_MISMATCH');
  if (root.writesAuthorized !== false) throw new Error('V2_MANIFEST_MUST_NOT_SELF_AUTHORIZE_WRITES');
  const entries = [];
  for (const shard of root.shards) {
    const body = JSON.parse(fs.readFileSync(path.join(dir, shard.name), 'utf8'));
    if (sha256Of(body) !== shard.sha256) throw new Error(`V2_MANIFEST_SHARD_CHECKSUM_MISMATCH:${shard.name}`);
    entries.push(...body.entries);
  }
  if (entries.length !== root.entryCount) throw new Error('V2_MANIFEST_ENTRY_COUNT_MISMATCH');
  for (const entry of entries) {
    if (entry.packetKind !== 'SOURCE_FILE' || !/^repo:.+/.test(entry.repositoryScope) || !PACKET_KEY_V2_RE.test(entry.packetKeyV2)
      || entry.legacyCompatibilityKey?.canonical !== false || !ADMISSION_STATUSES.includes(entry.status)) {
      throw new Error(`V2_MANIFEST_ENTRY_INVALID:${entry.canonicalSourceRef}`);
    }
  }
  if (new Set(entries.map((e) => e.packetKeyV2)).size !== entries.length) throw new Error('V2_MANIFEST_DUPLICATE_PACKET_KEY_V2');
  return { root, entries };
}

/**
 * Apply is deliberately unavailable in this tranche. It needs an explicit authorization receipt bound to this exact
 * manifest root, AND the alias-kind DDL must be applied. There is no ON CONFLICT DO NOTHING on this path: a unique
 * violation must be surfaced as a PACKET_KEY_CANONICAL_COLLISION receipt, never skipped.
 */
export function assertApplyAuthorized({ authorizationReceipt, manifestRootSha256, aliasKindDdlApplied }) {
  if (!aliasKindDdlApplied) throw new Error('PACKET_KEY_ALIAS_DDL_NOT_APPLIED');
  if (!authorizationReceipt || authorizationReceipt.schema !== 'atlas.packet-admission-apply-authorization.v1'
    || authorizationReceipt.status !== 'PACKET_ADMISSION_APPLY_AUTHORIZED' || authorizationReceipt.manifestRootSha256 !== manifestRootSha256) {
    throw new Error('PACKET_ADMISSION_APPLY_AUTHORIZATION_REQUIRED');
  }
  return true;
}

/** Explicit, conflict-free INSERT (no ON CONFLICT). Not executed anywhere in this tranche. */
export function buildV2PacketInsert(entry, derived) {
  return {
    text: `INSERT INTO atlas_packets (packet_id, packet_key, source_ref, source_revision, workspace_revision_key, lineage_binding_checksum, directory_path, feature_id, domain_class, source_kind, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())`,
    values: [derived.packetId, entry.packetKeyV2, entry.canonicalSourceRef, entry.sourceRevision, entry.workspaceRevision, entry.lineageBindingChecksum, derived.directoryPath, derived.featureId, derived.domainClass, derived.sourceKind],
  };
}

/** Turn a unique-violation from the plain INSERT into a receipt entry instead of a silent skip. */
export function collisionReceiptFromInsertError(entry, error) {
  if (error?.code !== '23505') throw error;
  return { status: 'PACKET_KEY_CANONICAL_COLLISION', packetKeyV2: entry.packetKeyV2, sourceRef: entry.canonicalSourceRef, constraint: error.constraint ?? null, detail: String(error.detail ?? error.message) };
}
