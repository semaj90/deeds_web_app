/**
 * StableFilePopulationApplyManifestV1 (S01-08K-FREEZE) — PURE helpers for freezing the exact
 * Population-A apply set (the S01-08J preview's SAFE_NEW_ID rows only) before any S01-08K write.
 * This module performs zero I/O; the live runner (scripts/atlas/freeze-stable-file-population-
 * apply-manifest-v1.mjs) supplies already-fetched classification results.
 *
 * Hard rule this module enforces structurally, not just by convention: the apply-set row shape
 * (ApplySetRowV1) has NO stableFileId field. A frozen manifest literally cannot carry a pre-minted
 * UUIDv7 -- S01-08K's canonical writer mints each one only inside its own authorized transaction.
 */

export interface ClassifiedSourceV1 {
  sourceRef: string;
  classification: string;
  sourceAuthorityRepoId: string | null;
  repositoryRelativePath: string;
  workspaceRevision: string;
  sourceRevision: string;
  contentDigest: string;
  byteLength: number;
}

/** No stableFileId field -- structurally impossible to pre-mint/freeze a UUIDv7 here. */
export interface ApplySetRowV1 {
  sourceRef: string;
  sourceAuthorityRepoId: string;
  canonicalSourceRef: string;
  workspaceRevision: string;
  sourceRevision: string;
  contentDigest: string;
  byteLength: number;
}

/** Pure: filters classification results down to exactly the SAFE_NEW_ID / deeds-web-app rows. */
export function buildApplySetFromClassificationV1(results: readonly ClassifiedSourceV1[]): ApplySetRowV1[] {
  return results
    .filter((r) => r.classification === 'SAFE_NEW_ID' && r.sourceAuthorityRepoId !== null)
    .map((r) => ({
      sourceRef: r.sourceRef,
      sourceAuthorityRepoId: r.sourceAuthorityRepoId as string,
      canonicalSourceRef: r.repositoryRelativePath,
      workspaceRevision: r.workspaceRevision,
      sourceRevision: r.sourceRevision,
      contentDigest: r.contentDigest,
      byteLength: r.byteLength,
    }));
}

/** Pure: deterministic canonical JSON for checksumming -- stable key order, sorted by sourceRef. */
export function canonicalApplySetJsonV1(rows: readonly ApplySetRowV1[]): string {
  const sorted = [...rows].sort((a, b) => a.sourceRef.localeCompare(b.sourceRef));
  return JSON.stringify(
    sorted.map((r) => ({
      sourceRef: r.sourceRef,
      sourceAuthorityRepoId: r.sourceAuthorityRepoId,
      canonicalSourceRef: r.canonicalSourceRef,
      workspaceRevision: r.workspaceRevision,
      sourceRevision: r.sourceRevision,
      contentDigest: r.contentDigest,
      byteLength: r.byteLength,
    })),
  );
}

export interface ApplySetIntegrityReportV1 {
  totalRows: number;
  duplicateKeyCount: number;
  duplicateKeys: string[];
  invalidWorkspaceRevisionShapeCount: number;
  invalidSourceRevisionShapeCount: number;
  sourceRevisionDigestMismatchCount: number;
  missingCanonicalSourceRefCount: number;
  missingContentDigestCount: number;
  negativeByteLengthCount: number;
  allChecksPassed: boolean;
}

const REVISION_SHAPE_RE = /^sha256:[0-9a-f]{64}$/;
const DIGEST_SHAPE_RE = /^[0-9a-f]{64}$/;

/**
 * Pure: the exact freeze-time integrity checks over the frozen apply set (per S01-08J's own
 * "required current-cohort checks" list) -- duplicate keys, malformed revision shapes, a
 * self-consistency digest check, and missing/invalid required fields. Never mutates, never
 * repairs; a failing row is reported, not silently dropped or coerced.
 */
export function checkApplySetIntegrityV1(rows: readonly ApplySetRowV1[]): ApplySetIntegrityReportV1 {
  const keyCounts = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.sourceAuthorityRepoId}\u0000${row.workspaceRevision}\u0000${row.canonicalSourceRef}`;
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  }
  const duplicateKeys = [...keyCounts.entries()].filter(([, n]) => n > 1).map(([k]) => k);

  let invalidWorkspaceRevisionShapeCount = 0;
  let invalidSourceRevisionShapeCount = 0;
  let sourceRevisionDigestMismatchCount = 0;
  let missingCanonicalSourceRefCount = 0;
  let missingContentDigestCount = 0;
  let negativeByteLengthCount = 0;

  for (const row of rows) {
    if (!REVISION_SHAPE_RE.test(row.workspaceRevision)) invalidWorkspaceRevisionShapeCount += 1;
    if (!REVISION_SHAPE_RE.test(row.sourceRevision)) invalidSourceRevisionShapeCount += 1;
    if (!DIGEST_SHAPE_RE.test(row.contentDigest) || row.sourceRevision !== `sha256:${row.contentDigest}`) sourceRevisionDigestMismatchCount += 1;
    if (!row.canonicalSourceRef || row.canonicalSourceRef.trim() === '') missingCanonicalSourceRefCount += 1;
    if (!row.contentDigest || row.contentDigest.trim() === '') missingContentDigestCount += 1;
    if (row.byteLength < 0) negativeByteLengthCount += 1;
  }

  const allChecksPassed =
    duplicateKeys.length === 0 &&
    invalidWorkspaceRevisionShapeCount === 0 &&
    invalidSourceRevisionShapeCount === 0 &&
    sourceRevisionDigestMismatchCount === 0 &&
    missingCanonicalSourceRefCount === 0 &&
    missingContentDigestCount === 0 &&
    negativeByteLengthCount === 0;

  return {
    totalRows: rows.length,
    duplicateKeyCount: duplicateKeys.length,
    duplicateKeys,
    invalidWorkspaceRevisionShapeCount,
    invalidSourceRevisionShapeCount,
    sourceRevisionDigestMismatchCount,
    missingCanonicalSourceRefCount,
    missingContentDigestCount,
    negativeByteLengthCount,
    allChecksPassed,
  };
}
