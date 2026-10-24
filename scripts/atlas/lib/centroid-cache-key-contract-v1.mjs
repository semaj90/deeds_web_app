// CENTROID-CACHE-KEY-CONTRACT-01 (proposal and test mode). Pure functions only: no Valkey access, no writes.
// Canonical key: atlas:centroid:v1:{family}:{featureSnapshotId}:{modelRevisionId}:{cellId}
// The key identifies the cache slot only. Provenance, members, timestamps and evidence belong in the descriptor.
import { createHash } from 'node:crypto';

export const CENTROID_NAMESPACE_V1 = 'atlas:centroid:v1';
export const CENTROID_DESCRIPTOR_SCHEMA_V1 = 'atlas.centroid-descriptor.v1';
export const CENTROID_FAMILIES_V1 = Object.freeze(['som', 'kmeans', 'domain']);

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const DOMAIN_ID = /^[a-z0-9_-]{1,64}$/;

function refuse(code) {
  throw new Error(code);
}

/** Short, digest-derived identifier. Never a date, ordinal or transient value. */
export function digestIdV1(prefix, digest) {
  if (typeof digest !== 'string' || !DIGEST.test(digest)) refuse('CENTROID_DIGEST_INVALID');
  return `${prefix}${digest.slice('sha256:'.length, 'sha256:'.length + 12)}`;
}

/** Model-local cell identifier. som: r07c12 · kmeans: k003 · domain: the governed domain id. */
export function cellIdV1(family, cell) {
  if (family === 'som') {
    const { row, col } = cell ?? {};
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row > 99 || col > 99) refuse('CENTROID_CELL_INVALID');
    return `r${String(row).padStart(2, '0')}c${String(col).padStart(2, '0')}`;
  }
  if (family === 'kmeans') {
    const index = cell?.index;
    if (!Number.isInteger(index) || index < 0 || index > 999) refuse('CENTROID_CELL_INVALID');
    return `k${String(index).padStart(3, '0')}`;
  }
  if (family === 'domain') {
    const domainId = cell?.domainId;
    if (typeof domainId !== 'string' || !DOMAIN_ID.test(domainId)) refuse('CENTROID_CELL_INVALID');
    return domainId;
  }
  return refuse('CENTROID_FAMILY_UNSUPPORTED');
}

/**
 * Build the canonical key. For som and kmeans the model slot is the trained model digest; for domain it is the
 * governed taxonomy revision digest (a domain centroid has no trained model).
 */
export function buildCentroidKeyV1({ family, featureSnapshotDigest, modelDigest, cell }) {
  if (!CENTROID_FAMILIES_V1.includes(family)) refuse('CENTROID_FAMILY_UNSUPPORTED');
  const featureSnapshotId = digestIdV1('fs', featureSnapshotDigest);
  const modelRevisionId = digestIdV1('m', modelDigest);
  const cellId = cellIdV1(family, cell);
  return `${CENTROID_NAMESPACE_V1}:${family}:${featureSnapshotId}:${modelRevisionId}:${cellId}`;
}

/** Parse a canonical key back into its parts. Returns null for anything that is not a v1 canonical key. */
export function parseCentroidKeyV1(key) {
  const m = /^atlas:centroid:v1:(som|kmeans|domain):(fs[0-9a-f]{12}):(m[0-9a-f]{12}):([a-z0-9_-]+)$/.exec(String(key));
  if (!m) return null;
  return { family: m[1], featureSnapshotId: m[2], modelRevisionId: m[3], cellId: m[4] };
}

/** Decode a little-endian float32 vector. Refuses a byte length that does not equal dim * 4. */
export function decodeF32LEV1(buffer, dim) {
  if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) refuse('CENTROID_VECTOR_BYTES_INVALID');
  if (!Number.isInteger(dim) || dim <= 0) refuse('CENTROID_DIM_INVALID');
  if (buffer.byteLength !== dim * 4) refuse('CENTROID_VECTOR_LENGTH_MISMATCH');
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const out = new Array(dim);
  for (let i = 0; i < dim; i += 1) out[i] = view.getFloat32(i * 4, true);
  return out;
}

/** Reject empty, non-finite, zero-norm or mismatched vectors before any publication. */
export function assertPublishableCentroidV1(values, dim) {
  if (!Array.isArray(values) || values.length === 0) refuse('CENTROID_VECTOR_EMPTY');
  if (values.length !== dim) refuse('CENTROID_VECTOR_LENGTH_MISMATCH');
  let norm = 0;
  for (const v of values) {
    if (typeof v !== 'number' || !Number.isFinite(v)) refuse('CENTROID_VECTOR_NONFINITE');
    norm += v * v;
  }
  if (!(norm > 0)) refuse('CENTROID_VECTOR_ZERO_NORM');
  return true;
}

/** Digest over the exact centroid values, as float64 JSON, so the same vector always hashes the same. */
export function centroidDigestV1(values) {
  return `sha256:${createHash('sha256').update(JSON.stringify(values)).digest('hex')}`;
}

/** Decode PostgreSQL latent_64 column (bytea 256-byte Float32 buffer, json array, or string). */
export function decodePostgresLatent64V1(input, dim = 64) {
  if (!input) refuse('CENTROID_LATENT64_EMPTY');
  if (Buffer.isBuffer(input) || input instanceof Uint8Array) {
    if (input.byteLength !== dim * 4) refuse('CENTROID_LATENT64_LENGTH_MISMATCH');
    const f32 = new Float32Array(input.buffer, input.byteOffset, dim);
    const arr = Array.from(f32);
    assertPublishableCentroidV1(arr, dim);
    return arr;
  }
  if (Array.isArray(input)) {
    assertPublishableCentroidV1(input, dim);
    return input;
  }
  if (typeof input === 'string') {
    try {
      const trimmed = input.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        const parsed = JSON.parse(trimmed);
        assertPublishableCentroidV1(parsed, dim);
        return parsed;
      }
    } catch {}
  }
  return refuse('CENTROID_LATENT64_DECODE_FAILED');
}

/**
 * Compatibility key resolver for migration and read fallbacks.
 * Returns the canonical v1 key and ordered legacy fallback lookup keys.
 */
export function resolveCentroidLookupKeysV1({ family, featureSnapshotDigest, modelDigest, cell }) {
  const canonicalKey = buildCentroidKeyV1({ family, featureSnapshotDigest, modelDigest, cell });
  const fallbackKeys = [];

  if (family === 'som' && cell && Number.isInteger(cell.row) && Number.isInteger(cell.col)) {
    fallbackKeys.push(`atlas:centroid:som:${cell.row}:${cell.col}`);
    fallbackKeys.push(`centroid:som_cell:${cell.row}:${cell.col}`);
    fallbackKeys.push(`centroid:som:${cell.row}:${cell.col}`);
  } else if (family === 'kmeans' && cell && Number.isInteger(cell.index)) {
    fallbackKeys.push(`atlas:centroid:kmeans:${cell.index}`);
    fallbackKeys.push(`centroid:som:${cell.index}`);
    fallbackKeys.push(`taxonomy:clusters:gpu:${cell.index}`);
  } else if (family === 'domain' && cell && typeof cell.domainId === 'string') {
    fallbackKeys.push(`atlas:centroid:domain:${cell.domainId}`);
    fallbackKeys.push(`taxonomy:clusters:domain:${cell.domainId}`);
  }

  return { canonicalKey, fallbackKeys };
}

/** Refuses cache publication if Graphify projection admission is unsafe or unadmitted. */
export function assertSafeToPublishCentroidsV1({ projectionAdmissionStatus, workspaceRevision }) {
  if (projectionAdmissionStatus === 'NOT_SAFE_TO_PROJECT') {
    refuse('CENTROID_PUBLICATION_BLOCKED_NOT_SAFE_TO_PROJECT');
  }
  if (!workspaceRevision || typeof workspaceRevision !== 'string' || !workspaceRevision.trim()) {
    refuse('CENTROID_PUBLICATION_BLOCKED_UNADMITTED_WORKSPACE');
  }
  return true;
}

/**
 * Descriptor carries provenance. Its fields are not part of the key, so a changed timestamp or execution ID
 * never moves a centroid to a different cache slot.
 */
export function buildCentroidDescriptorV1({
  family, featureSnapshotDigest, modelDigest, cell, values, memberCount,
  workspaceRevision = null, sourceRevision = null, taxonomyRevision = null, domainId = null, graphifyExecutionId = null,
  conceptIds = [], entityIds = [], createdAt, expiresAt,
}) {
  assertPublishableCentroidV1(values, values?.length);
  if (!Number.isInteger(memberCount) || memberCount < 1) refuse('CENTROID_MEMBERS_INSUFFICIENT');
  const key = buildCentroidKeyV1({ family, featureSnapshotDigest, modelDigest, cell });
  return {
    schema: CENTROID_DESCRIPTOR_SCHEMA_V1,
    key,
    family,
    featureSnapshotDigest,
    modelDigest,
    cellId: parseCentroidKeyV1(key).cellId,
    dim: values.length,
    memberCount,
    centroidDigest: centroidDigestV1(values),
    workspaceRevision,
    sourceRevision,
    taxonomyRevision,
    domainId,
    graphifyExecutionId,
    conceptIds: [...conceptIds].sort(),
    entityIds: [...entityIds].sort(),
    status: workspaceRevision ? 'ADMITTED_INPUT' : 'PROPOSAL_ONLY',
    createdAt,
    expiresAt,
    canonicalAuthority: false,
  };
}
