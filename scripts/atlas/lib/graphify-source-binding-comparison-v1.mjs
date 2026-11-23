// Pure diagnostics for the existing batch planner; no source or mutation authority.
import { createHash } from 'node:crypto';

const text = (value) => String(value ?? '').trim();
const hash = (value) => text(value).replace(/^sha256:/i, '').toLowerCase();
const byteLength = (value) => value !== null && value !== undefined && text(value) !== ''
  && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;

export function compareGraphifySourceBindingV1(expected, row) {
  const observed = {
    sourceRef: row.source_ref ?? null,
    workspaceRevision: row.workspace_revision ?? null,
    sourceRevision: row.code_source_revision ?? null,
    contentDigest: row.content_hash ?? null,
    byteLength: row.byte_length ?? null,
  };
  const matches = {
    sourceRef: text(observed.sourceRef) !== '' && text(observed.sourceRef) === text(expected.sourceRef),
    workspaceRevision: text(observed.workspaceRevision) !== ''
      && text(observed.workspaceRevision) === text(expected.workspaceRevision),
    sourceRevision: /^sha256:[0-9a-f]{64}$/i.test(text(observed.sourceRevision))
      && text(observed.sourceRevision).toLowerCase() === text(expected.sourceRevision).toLowerCase(),
    contentDigest: /^[0-9a-f]{64}$/.test(hash(observed.contentDigest))
      && hash(observed.contentDigest) === hash(expected.contentDigest),
    byteLength: byteLength(observed.byteLength) !== null
      && byteLength(observed.byteLength) === byteLength(expected.byteLength),
  };
  const mismatchedFields = Object.keys(matches).filter((field) => !matches[field]);
  return { observed, matches, mismatchedFields, exact: mismatchedFields.length === 0 };
}

export function compareCurrentSourceBytesV1(expected, bytes) {
  const validBytes = bytes instanceof Uint8Array;
  const digest = validBytes ? createHash('sha256').update(bytes).digest('hex') : null;
  const expectedSourceRevision = hash(expected?.sourceRevision);
  const expectedContentDigest = hash(expected?.contentDigest);
  const expectedByteLength = byteLength(expected?.byteLength);
  const matches = {
    sourceRevision: digest !== null && /^[0-9a-f]{64}$/.test(expectedSourceRevision) && digest === expectedSourceRevision,
    contentDigest: digest !== null && /^[0-9a-f]{64}$/.test(expectedContentDigest) && digest === expectedContentDigest,
    byteLength: validBytes && expectedByteLength !== null && bytes.byteLength === expectedByteLength,
  };
  return {
    available: validBytes,
    byteLength: validBytes ? bytes.byteLength : null,
    contentDigest: digest,
    matches,
    mismatchedFields: Object.keys(matches).filter((field) => !matches[field]),
    exact: validBytes && Object.values(matches).every(Boolean),
  };
}

export function parseGraphifyBatchLimitV1(raw = '128') {
  if (!/^\d+$/.test(String(raw)) || !Number.isSafeInteger(Number(raw)) || Number(raw) < 1 || Number(raw) > 128) {
    throw new Error('CURRENT_SOURCE_GRAPHIFY_PLAN_INVALID_LIMIT: expected integer 1..128');
  }
  return Number(raw);
}

export function graphifyBatchReviewStatusV1({ databaseError, selectedCount, missingBindings, needsReview }) {
  if (databaseError) return 'CURRENT_GRAPHIFY_BATCH_PLAN_DATABASE_ERROR';
  if (missingBindings) return 'CURRENT_GRAPHIFY_BATCH_PLAN_BLOCKED_MISSING_OBSERVATION';
  if (selectedCount === 0) return 'CURRENT_GRAPHIFY_BATCH_PLAN_BLOCKED_EMPTY_COHORT';
  return needsReview ? 'CURRENT_GRAPHIFY_BATCH_PLAN_BLOCKED_REVIEW' : 'CURRENT_GRAPHIFY_BATCH_PLAN_READY';
}
