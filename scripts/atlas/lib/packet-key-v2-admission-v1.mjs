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

export function isCanonicalGraphifyExecution(row, expectedWorkspaceRevision) {
  return row?.status === 'COMPLETED'
    && row?.canonical_authority === true
    && row?.workspace_revision === expectedWorkspaceRevision;
}

/** Validate a persisted membership-scope mapping against its joined repository authority row. */
export function resolveGraphifyScopeRepositoryMappingV1(scope, rows) {
  if (typeof scope !== 'string' || !/^repo:.+/.test(scope)) return { ok: false, code: 'MEMBERSHIP_SCOPE_INVALID' };
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, code: 'SCOPE_MAPPING_UNRESOLVED' };
  if (rows.length !== 1) return { ok: false, code: 'SCOPE_MAPPING_AMBIGUOUS' };
  const row = rows[0];
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (row?.membership_repository_scope !== scope || !uuidPattern.test(row?.repository_id ?? '')
    || !row?.source_authority_repo_id || row.source_authority_repo_id !== row.persisted_source_authority_repo_id) {
    return { ok: false, code: 'SCOPE_MAPPING_AUTHORITY_MISMATCH' };
  }
  const validRoot = row.mapping_kind === 'ROOT_SCOPE' && scope === 'repo:root'
    && row.repository_kind === 'ROOT' && row.parent_repository_id === null;
  const validLogical = row.mapping_kind === 'LOGICAL_SUBSCOPE' && scope !== 'repo:root'
    && row.repository_kind === 'ROOT' && row.parent_repository_id === null;
  const validNested = row.mapping_kind === 'NESTED_REPOSITORY' && scope !== 'repo:root'
    && row.repository_kind === 'NESTED_GIT_REPOSITORY' && row.parent_repository_id !== null;
  if (!validRoot && !validLogical && !validNested) return { ok: false, code: 'SCOPE_MAPPING_KIND_MISMATCH' };
  return { ok: true, code: null, repositoryId: row.repository_id, mappingKind: row.mapping_kind };
}

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
 * manifest root, AND the registry-v1 relations and source guard must be applied. A unique violation must be surfaced
 * as a PACKET_KEY_CANONICAL_COLLISION receipt, never skipped.
 */
export function assertApplyAuthorized({ authorizationReceipt, manifestRootSha256, registryContractApplied }) {
  if (!registryContractApplied) throw new Error('PACKET_IDENTITY_REGISTRY_V1_DDL_NOT_APPLIED');
  if (!authorizationReceipt || authorizationReceipt.schema !== 'atlas.packet-admission-apply-authorization.v1'
    || authorizationReceipt.status !== 'PACKET_ADMISSION_APPLY_AUTHORIZED' || authorizationReceipt.manifestRootSha256 !== manifestRootSha256) {
    throw new Error('PACKET_ADMISSION_APPLY_AUTHORIZATION_REQUIRED');
  }
  return true;
}

/** Explicit registry identity INSERT (no ON CONFLICT). Not executed anywhere in this tranche. */
export function buildRegistryV1PacketInsert(entry, { repositoryId, repositoryScope }) {
  return {
    text: `INSERT INTO atlas_packet_identity_registry_v1 (packet_key, repository_id, membership_repository_scope, source_ref, packet_kind, key_recipe_revision)
           VALUES ($1, $2, $3, $4, 'SOURCE_FILE', 'PacketKeyV2@1')`,
    values: [entry.packetKeyV2, repositoryId, repositoryScope, entry.canonicalSourceRef],
  };
}

/** Explicit immutable storage-alias INSERT (no ON CONFLICT). Not executed anywhere in this tranche. */
export function buildRegistryV1StorageAliasInsert(entry, { storagePacketKey, evidenceRef, evidenceDigest }) {
  return {
    text: `INSERT INTO atlas_packet_identity_aliases_v1 (alias_key, canonical_packet_key, storage_packet_key, alias_kind, evidence_ref, evidence_digest)
           VALUES ($1, $2, $3, 'PACKET_KEY_V1_STORAGE_TO_V2', $4, $5)`,
    values: [storagePacketKey, entry.packetKeyV2, storagePacketKey, evidenceRef, evidenceDigest],
  };
}

/** Turn a unique-violation from the plain INSERT into a receipt entry instead of a silent skip. */
export function collisionReceiptFromInsertError(entry, error) {
  if (error?.code !== '23505') throw error;
  return { status: 'PACKET_KEY_CANONICAL_COLLISION', packetKeyV2: entry.packetKeyV2, sourceRef: entry.canonicalSourceRef, constraint: error.constraint ?? null, detail: String(error.detail ?? error.message) };
}
