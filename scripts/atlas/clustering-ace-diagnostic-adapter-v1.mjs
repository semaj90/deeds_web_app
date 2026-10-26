/**
 * Clustering diagnostic ACE proposal adapter (v1). Pure, read-only, no I/O, no database or cache access.
 *
 * Emits diagnostic proposal packets for clustered chunks. It does not implement the SearchRuntime
 * production source owner (see search-runtime-ace-production-source-adapter-v1.ts), does not mint
 * canonical packet keys, and never marks unqualified input admitted.
 */
import { createHash } from 'node:crypto';

export const DIAGNOSTIC_ADAPTER_SCHEMA = 'atlas.clustering-ace-diagnostic-packet.v1';
export const SHA256_RE = /^sha256:[0-9a-f]{64}$/;

export const sha256Hex = (text) => createHash('sha256').update(text).digest('hex');

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}
const canonical = (value) => JSON.stringify(sortKeys(value));

/** Validate one vector. Rejects wrong type, wrong length, non-finite values and zero norm. */
export function validateVector(vector, dim) {
  if (!Array.isArray(vector) && !(vector instanceof Float32Array) && !(vector instanceof Float64Array)) {
    return { ok: false, reason: 'VECTOR_NOT_ARRAY' };
  }
  if (vector.length !== dim) return { ok: false, reason: 'VECTOR_DIM_MISMATCH' };
  let sum = 0;
  for (let i = 0; i < vector.length; i++) {
    const x = vector[i];
    if (!Number.isFinite(x)) return { ok: false, reason: 'VECTOR_NON_FINITE' };
    sum += x * x;
  }
  if (!(sum > 0)) return { ok: false, reason: 'VECTOR_ZERO_NORM' };
  return { ok: true, reason: null };
}

/** A revision is QUALIFIED only when it has the canonical sha256 form. Anything else is UNKNOWN, never coerced. */
export function revisionField(value) {
  if (typeof value === 'string' && SHA256_RE.test(value)) return { status: 'QUALIFIED', value };
  return { status: 'UNKNOWN', value: null };
}

/**
 * Build one diagnostic proposal packet for one chunk.
 * row = { id, relative_path, content_hash, source_revision?, workspace_revision? }
 * assignment = { cluster } ; the cluster is an opaque integer, never a domain label.
 * run = { executor, k, seed, dim, preprocessing, sampleSha256 }
 */
export function buildDiagnosticPacket({ row, vector, assignment, run }) {
  if (!row || typeof row.id !== 'string' || !row.id) return { status: 'REJECTED', reason: 'MISSING_CHUNK_ID' };
  if (typeof row.relative_path !== 'string' || !row.relative_path) return { status: 'REJECTED', reason: 'MISSING_SOURCE_REF' };
  if (typeof row.content_hash !== 'string' || !row.content_hash) return { status: 'REJECTED', reason: 'MISSING_CONTENT_HASH' };
  const v = validateVector(vector, run.dim);
  if (!v.ok) return { status: 'REJECTED', reason: v.reason };

  const sourceRevision = revisionField(row.source_revision);
  const workspaceRevision = revisionField(row.workspace_revision);
  const blockers = [];
  if (sourceRevision.status !== 'QUALIFIED') blockers.push('SOURCE_REVISION_UNKNOWN');
  if (workspaceRevision.status !== 'QUALIFIED') blockers.push('WORKSPACE_REVISION_UNKNOWN');
  blockers.push('NO_DOMAIN_LABEL_ATTACHED', 'CLUSTER_IS_UNLABELED_ADVISORY', 'EMBEDDING_RECIPE_UNKNOWN');

  const body = {
    schema: DIAGNOSTIC_ADAPTER_SCHEMA,
    proposalOnly: true,
    canonicalAuthority: false,
    identity: { chunkId: row.id, sourceRef: row.relative_path, contentHash: row.content_hash },
    revisions: { sourceRevision, workspaceRevision },
    representation: {
      name: 'clustering-input', dim: run.dim, preprocessing: run.preprocessing,
      executor: run.executor, k: run.k, seed: run.seed, sampleSha256: run.sampleSha256,
    },
    cluster: { id: assignment.cluster, labelStatus: 'UNLABELED' },
    proposedLabels: [],
    evidenceRefs: [{ kind: 'chunk', chunkId: row.id, contentHash: row.content_hash }],
    coverage: { hasVector: true, hasSourceRevision: sourceRevision.status === 'QUALIFIED' },
    blockers,
    aceAdmissionEligible: false,
    writesPerformed: 0,
  };
  const packetChecksum = 'sha256:' + sha256Hex(canonical(body));
  return { status: 'PROPOSED_DIAGNOSTIC', packet: { ...body, packetChecksum } };
}

/** Identity that must NOT change when cluster numbering is permuted. The cluster label is excluded. */
export function identityKey(packet) {
  return sha256Hex(canonical({
    chunkId: packet.identity.chunkId,
    sourceRef: packet.identity.sourceRef,
    contentHash: packet.identity.contentHash,
    executor: packet.representation.executor,
    k: packet.representation.k,
    seed: packet.representation.seed,
  }));
}

/** Source-held-out check: any file present in both train and test is a leak. */
export function heldOutLeakage(trainPaths, testPaths) {
  const train = new Set(trainPaths);
  return [...new Set(testPaths)].filter((p) => train.has(p));
}
