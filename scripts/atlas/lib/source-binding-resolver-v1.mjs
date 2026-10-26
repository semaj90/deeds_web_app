/**
 * FEATURE-LINEAGE-WIRE-01b: request-scoped, READ-ONLY source-binding resolver for observation-feature-lineage-admission-v2.
 * Backed by the existing owner table `atlas_workspace_source_bindings` (workspace-source-binding-v1.ts). This module has NO database
 * code: the caller injects `fetchBindingRows({ workspaceRevision, sourceRef })` (a bounded, READ ONLY query or a frozen snapshot),
 * so the resolver can be tested without a database and can never write. It fails closed:
 *   - zero rows, more than one row (ambiguous), a malformed row, or a row for another workspace/source -> null (unresolved)
 *   - a row is accepted only with sha256-prefixed source_revision AND content_digest, and a non-empty binding_checksum.
 * The result is evidence of exact source identity only: it is not canonical authority and not a write grant.
 */
import { createHash } from 'node:crypto';

const SHA256_PREFIXED = /^sha256:[a-f0-9]{64}$/;
const BARE_SHA256 = /^[a-f0-9]{64}$/;
const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

/**
 * @param {Function} fetchBindingRows injected bounded READ ONLY fetcher
 * @param {{ trustedProducerPrefixes?: readonly string[] }} [options] when given, `producer_revision` must start with one of these
 *   producer-family prefixes (live families, run ids vary: `graphify-execution-membership-v2:`, `workspace-revision-content-reconciliation.v1:`,
 *   `graphify-current-source-batch-v1:`). The allowlist is OPERATOR-PROVIDED; no default trust is assumed here.
 */
export function createSourceBindingResolverV1(fetchBindingRows, options = {}) {
  if (typeof fetchBindingRows !== 'function') throw new TypeError('FETCH_BINDING_ROWS_REQUIRED');
  const trusted = options.trustedProducerPrefixes;
  if (trusted !== undefined && (!Array.isArray(trusted) || trusted.length === 0 || trusted.some((x) => !nonEmpty(x)))) throw new TypeError('TRUSTED_PRODUCER_PREFIXES_INVALID');
  return function resolveSourceBinding({ workspaceRevision, sourceRef }) {
    if (!nonEmpty(workspaceRevision) || !nonEmpty(sourceRef)) return null;
    const rows = fetchBindingRows({ workspaceRevision, sourceRef });
    if (!Array.isArray(rows) || rows.length !== 1) return null;
    const row = rows[0];
    if (row?.workspace_revision !== workspaceRevision || row?.canonical_source_ref !== sourceRef) return null;
    if (!SHA256_PREFIXED.test(row.source_revision ?? '')) return null;
    // Live rows store content_digest as BARE 64-hex while source_revision is `sha256:`-prefixed (37/37 observed 2026-10-11): accept either
    // spelling at this boundary, normalize to the prefixed form, and require it to equal source_revision (sha256 of the same source bytes).
    const contentDigest = typeof row.content_digest === 'string' && BARE_SHA256.test(row.content_digest) ? `sha256:${row.content_digest}` : row.content_digest;
    if (!SHA256_PREFIXED.test(contentDigest ?? '') || contentDigest !== row.source_revision) return null;
    if (!nonEmpty(row.binding_checksum)) return null;
    if (trusted && !(typeof row.producer_revision === 'string' && trusted.some((prefix) => row.producer_revision.startsWith(prefix)))) return null;
    return Object.freeze({
      sourceRef: row.canonical_source_ref,
      workspaceRevision: row.workspace_revision,
      sourceRevision: row.source_revision,
      contentDigest,
      bindingChecksum: row.binding_checksum,
      producerRevision: row.producer_revision ?? null,
      byteLength: row.byte_length === undefined || row.byte_length === null ? null : Number(row.byte_length),
      canonicalAuthority: false,
    });
  };
}

/** Frozen-snapshot fetcher: `rows` is an array of atlas_workspace_source_bindings rows already read (read-only) by the caller. */
export function snapshotBindingFetcherV1(rows) {
  if (!Array.isArray(rows)) throw new TypeError('SNAPSHOT_ROWS_REQUIRED');
  return ({ workspaceRevision, sourceRef }) => rows.filter((r) => r.workspace_revision === workspaceRevision && r.canonical_source_ref === sourceRef);
}

/**
 * Independent byte readback: the caller reopens the authoritative source bytes (working tree or git blob; this module never reads files)
 * and this recomputes the digest and length against the resolved binding. A resolved binding alone is a record, not a readback.
 */
export function verifySourceBytesAgainstBindingV1(binding, sourceBytes) {
  if (!binding || !(sourceBytes instanceof Uint8Array)) return { status: 'BLOCKED_BINDING_OR_BYTES_MISSING', verified: false };
  const hex = createHash('sha256').update(sourceBytes).digest('hex');
  if (`sha256:${hex}` !== binding.contentDigest) return { status: 'BLOCKED_DIGEST_MISMATCH', verified: false };
  if (binding.byteLength !== null && binding.byteLength !== sourceBytes.byteLength) return { status: 'BLOCKED_BYTE_LENGTH_MISMATCH', verified: false };
  return { status: 'SOURCE_BYTES_MATCH_BINDING', verified: true, canonicalAuthority: false };
}

/**
 * Compare a resolved binding with the result of the EXISTING exact source reader
 * (`createWorkspaceExactPromotionSourceReader` in packages/parent-atlas/src/core/exact-promotion-workspace-source-reader.ts, which reopens the
 * file under one repo root with realpath/escape checks and returns `file_sha256` (bare hex) + `file_byte_length`, never the bytes).
 * Pure: the caller invokes the reader. A mismatch means the working-tree bytes are NOT the bytes the binding admitted (stale, dirty or escaped).
 */
export function verifyBindingAgainstExactReaderV1(binding, readerResult) {
  if (!binding || !readerResult) return { status: 'BLOCKED_BINDING_OR_READER_RESULT_MISSING', verified: false };
  if (readerResult.file_found !== true) return { status: 'BLOCKED_SOURCE_FILE_UNAVAILABLE', verified: false };
  const readerDigest = typeof readerResult.file_sha256 === 'string' ? `sha256:${readerResult.file_sha256.replace(/^sha256:/, '')}` : null;
  if (readerDigest !== binding.contentDigest) return { status: 'BLOCKED_WORKING_TREE_DIGEST_DIFFERS_FROM_BINDING', verified: false };
  if (binding.byteLength !== null && binding.byteLength !== readerResult.file_byte_length) return { status: 'BLOCKED_BYTE_LENGTH_MISMATCH', verified: false };
  return { status: 'WORKING_TREE_BYTES_MATCH_BINDING', verified: true, canonicalAuthority: false };
}

/**
 * Packet-identity link (FEATURE-LINEAGE-WIRE-01d): the binding table carries no packet_key, so the packet<->source relation must come from the
 * canonical packet row. Pure: `packetRows` are rows of atlas_packets read read-only by the caller for this exact packet_key
 * ({ packet_key, source_ref, source_revision }). Requires exactly ONE row whose packet_key and source_ref equal the request's; when
 * `sourceRevision` is supplied, the row must also match it exactly.
 * (no alias or string-similarity resolution here; an alias-only key must first be resolved by the packet-identity owner,
 * `resolvePacketKeyResolutionV2`, and the canonical/storage key passed in).
 */
export function verifyPacketSourceLinkV1({ packetKey, sourceRef, sourceRevision }, packetRows) {
  if (!nonEmpty(packetKey) || !nonEmpty(sourceRef) || (sourceRevision !== undefined && !nonEmpty(sourceRevision)) || !Array.isArray(packetRows)) return { status: 'BLOCKED_PACKET_LINK_INPUT_INVALID', verified: false };
  if (packetRows.length === 0) return { status: 'BLOCKED_PACKET_NOT_FOUND', verified: false };
  if (packetRows.length > 1) return { status: 'BLOCKED_PACKET_KEY_AMBIGUOUS', verified: false };
  const row = packetRows[0];
  if (row?.packet_key !== packetKey) return { status: 'BLOCKED_PACKET_KEY_MISMATCH', verified: false };
  if (row?.source_ref !== sourceRef) return { status: 'BLOCKED_PACKET_SOURCE_REF_MISMATCH', verified: false };
  if (sourceRevision !== undefined && row?.source_revision !== sourceRevision) return { status: 'BLOCKED_PACKET_SOURCE_REVISION_MISMATCH', verified: false };
  return { status: 'PACKET_SOURCE_LINK_VERIFIED', verified: true, canonicalAuthority: false };
}
