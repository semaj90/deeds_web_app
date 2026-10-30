/**
 * Pure planning/verification helpers for the PacketKeyV2 admission apply
 * (scripts/atlas/apply-packet-key-v2-admission-v1.mts). No I/O, no database, no clock.
 *
 * The manifest is produced by build-packet-key-v2-admission-manifest-v1.mts (read-only). These helpers re-verify it before
 * anything is written: shard checksums, root identity, an all-ADMISSION_READY accounting, and an independent re-derivation of
 * every PacketKeyV2 (the manifest is never trusted for identity).
 */
import { sha256Of } from './packet-source-revision-repair-v1.mjs';

export const ADMISSION_MANIFEST_SCHEMA = 'atlas.packet-key-v2-admission-manifest.v1';
export const ADMISSION_SHARD_SCHEMA = 'atlas.packet-key-v2-admission-shard.v1';
export const ALIAS_KIND = 'PACKET_KEY_V1_STORAGE_TO_V2';
const HEX64 = /^[0-9a-f]{64}$/;
const SHA256_REF = /^sha256:[0-9a-f]{64}$/;

const toSha256Ref = (value) => {
  if (typeof value !== 'string') return null;
  if (SHA256_REF.test(value)) return value;
  return HEX64.test(value) ? `sha256:${value}` : null;
};

/**
 * @param {{ root: any, rootDirName: string, shards: Record<string, any> }} manifest
 * @returns {{ ok: true, entries: any[] } | { ok: false, errors: string[] }}
 */
export function verifyAdmissionManifest({ root, rootDirName, shards }) {
  const errors = [];
  if (root?.schema !== ADMISSION_MANIFEST_SCHEMA) errors.push(`MANIFEST_SCHEMA_MISMATCH:${root?.schema}`);
  if (sha256Of(root) !== rootDirName) errors.push('ROOT_SHA256_DOES_NOT_MATCH_DIRECTORY');
  const classes = root?.accounting?.classes ?? {};
  const notReady = Object.entries(classes).filter(([name, count]) => name !== 'ADMISSION_READY' && Number(count) > 0);
  if (notReady.length > 0) errors.push(`MANIFEST_HAS_NON_READY_CLASSES:${notReady.map(([name, count]) => `${name}=${count}`).join(',')}`);
  if (root?.accounting?.rejections !== 0) errors.push(`MANIFEST_HAS_REJECTIONS:${root?.accounting?.rejections}`);

  const entries = [];
  for (const descriptor of root?.shards ?? []) {
    const body = shards?.[descriptor.name];
    if (!body) { errors.push(`SHARD_MISSING:${descriptor.name}`); continue; }
    if (body.schema !== ADMISSION_SHARD_SCHEMA) errors.push(`SHARD_SCHEMA_MISMATCH:${descriptor.name}`);
    if (sha256Of(body) !== descriptor.sha256) errors.push(`SHARD_SHA256_MISMATCH:${descriptor.name}`);
    if ((body.entries ?? []).length !== descriptor.entryCount) errors.push(`SHARD_ENTRY_COUNT_MISMATCH:${descriptor.name}`);
    entries.push(...(body.entries ?? []));
  }
  if (entries.length !== root?.entryCount) errors.push(`ENTRY_COUNT_MISMATCH:${entries.length}/${root?.entryCount}`);
  if (classes.ADMISSION_READY !== undefined && classes.ADMISSION_READY !== entries.length) errors.push(`READY_COUNT_MISMATCH:${classes.ADMISSION_READY}/${entries.length}`);
  return errors.length === 0 ? { ok: true, entries } : { ok: false, errors };
}

/**
 * Turns verified entries into registry and alias row sets.
 *
 * @param {object} input
 * @param {any[]} input.entries            manifest entries (all must be ADMISSION_READY)
 * @param {string} input.repositoryScope   e.g. 'repo:root'
 * @param {string} input.repositoryId      uuid from the persisted scope map (never inferred)
 * @param {string} input.rootSha256        manifest root checksum (evidence reference)
 * @param {(scope: string, sourceRef: string) => string} input.deriveKey independent PacketKeyV2 derivation
 */
export function planAdmissionApply({ entries, repositoryScope, repositoryId, rootSha256, deriveKey }) {
  const registryRows = [];
  const aliasRows = [];
  const errors = [];
  const skipped = { noStoragePacket: 0, storageIsCanonical: 0, ambiguousStorage: [] };
  const seenKeys = new Set();
  const seenAliasKeys = new Set();

  for (const entry of entries) {
    const ref = entry?.canonicalSourceRef;
    if (entry?.status !== 'ADMISSION_READY') { errors.push(`ENTRY_NOT_READY:${ref}:${entry?.status}`); continue; }
    if (entry.repositoryScope !== repositoryScope) { errors.push(`ENTRY_SCOPE_MISMATCH:${ref}:${entry.repositoryScope}`); continue; }
    if (entry.packetKind !== 'SOURCE_FILE') { errors.push(`ENTRY_KIND_UNSUPPORTED:${ref}:${entry.packetKind}`); continue; }
    let derived;
    try { derived = deriveKey(repositoryScope, ref); } catch (error) { errors.push(`KEY_DERIVATION_FAILED:${ref}:${String(error)}`); continue; }
    if (derived !== entry.packetKeyV2) { errors.push(`PACKET_KEY_V2_MISMATCH:${ref}:${entry.packetKeyV2}!=${derived}`); continue; }
    if (seenKeys.has(derived)) { errors.push(`DUPLICATE_PACKET_KEY_V2:${derived}`); continue; }
    seenKeys.add(derived);

    registryRows.push({
      packet_key: derived,
      repository_id: repositoryId,
      membership_repository_scope: repositoryScope,
      source_ref: ref,
      packet_kind: 'SOURCE_FILE',
    });

    const storageKeys = [...new Set(entry.storageDisposition?.existingStorageKeys ?? [])];
    if (storageKeys.length === 0) { skipped.noStoragePacket += 1; continue; }
    if (storageKeys.length > 1) { skipped.ambiguousStorage.push({ sourceRef: ref, storageKeys }); continue; }
    const [storageKey] = storageKeys;
    if (storageKey === derived) { skipped.storageIsCanonical += 1; continue; }
    const digest = toSha256Ref(entry.sourceEvidenceChecksum);
    if (!digest) { errors.push(`EVIDENCE_DIGEST_INVALID:${ref}`); continue; }
    if (seenAliasKeys.has(storageKey)) { errors.push(`DUPLICATE_ALIAS_KEY:${storageKey}`); continue; }
    seenAliasKeys.add(storageKey);
    aliasRows.push({
      alias_key: storageKey,
      canonical_packet_key: derived,
      storage_packet_key: storageKey,
      alias_kind: ALIAS_KIND,
      evidence_ref: `packet-key-v2-admission:${rootSha256}:${derived}`,
      evidence_digest: digest,
    });
  }
  return { registryRows, aliasRows, skipped, errors };
}
