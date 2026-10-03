import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildApplySetFromClassificationV1,
  canonicalApplySetJsonV1,
  checkApplySetIntegrityV1,
  type ApplySetRowV1,
  type ClassifiedSourceV1,
} from './stable-file-population-apply-manifest-v1';

const SHA_A = `sha256:${'a'.repeat(64)}`;
const SHA_B = `sha256:${'b'.repeat(64)}`;
const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);

const SAFE: ClassifiedSourceV1 = {
  sourceRef: 'src/index.ts',
  classification: 'SAFE_NEW_ID',
  sourceAuthorityRepoId: 'deeds-web-app',
  repositoryRelativePath: 'src/index.ts',
  workspaceRevision: SHA_A,
  sourceRevision: SHA_A,
  contentDigest: DIGEST_A,
  byteLength: 100,
};

describe('buildApplySetFromClassificationV1', () => {
  it('keeps only SAFE_NEW_ID rows (manifest count == input SAFE_NEW_ID count)', () => {
    const results: ClassifiedSourceV1[] = [
      SAFE,
      { ...SAFE, sourceRef: 'claude-mem/foo.ts', classification: 'REPOSITORY_NAMESPACE_MISSING', sourceAuthorityRepoId: null },
      { ...SAFE, sourceRef: 'src/other.ts', classification: 'AMBIGUOUS_CONTINUITY' },
    ];
    const applySet = buildApplySetFromClassificationV1(results);
    expect(applySet).toHaveLength(1);
    expect(applySet[0].sourceRef).toBe('src/index.ts');
  });

  it('excludes every REPOSITORY_NAMESPACE_MISSING row -- no blocked nested-repo row ever enters the apply set', () => {
    const results: ClassifiedSourceV1[] = [
      SAFE,
      { ...SAFE, sourceRef: 'claude-mem/a.ts', classification: 'REPOSITORY_NAMESPACE_MISSING', sourceAuthorityRepoId: null },
      { ...SAFE, sourceRef: 'turbovec/b.ts', classification: 'REPOSITORY_NAMESPACE_MISSING', sourceAuthorityRepoId: null },
    ];
    const applySet = buildApplySetFromClassificationV1(results);
    expect(applySet.every((r) => r.sourceAuthorityRepoId === 'deeds-web-app')).toBe(true);
    expect(applySet).toHaveLength(1);
  });

  it('excludes SOURCE_HISTORY_INSUFFICIENT and AMBIGUOUS_CONTINUITY rows', () => {
    const results: ClassifiedSourceV1[] = [
      SAFE,
      { ...SAFE, sourceRef: 'src/insufficient.ts', classification: 'SOURCE_HISTORY_INSUFFICIENT' },
      { ...SAFE, sourceRef: 'src/ambiguous.ts', classification: 'AMBIGUOUS_CONTINUITY' },
    ];
    expect(buildApplySetFromClassificationV1(results)).toHaveLength(1);
  });

  it('produces a row with NO stableFileId field -- structurally impossible to pre-mint/freeze a UUIDv7 here', () => {
    const [row] = buildApplySetFromClassificationV1([SAFE]);
    expect(row).not.toHaveProperty('stableFileId');
    expect(Object.keys(row).sort()).toEqual(
      ['byteLength', 'canonicalSourceRef', 'contentDigest', 'sourceAuthorityRepoId', 'sourceRef', 'sourceRevision', 'workspaceRevision'].sort(),
    );
  });
});

describe('canonicalApplySetJsonV1 / checksum', () => {
  const rowA: ApplySetRowV1 = { sourceRef: 'a.ts', sourceAuthorityRepoId: 'deeds-web-app', canonicalSourceRef: 'a.ts', workspaceRevision: SHA_A, sourceRevision: SHA_A, contentDigest: DIGEST_A, byteLength: 10 };
  const rowB: ApplySetRowV1 = { sourceRef: 'b.ts', sourceAuthorityRepoId: 'deeds-web-app', canonicalSourceRef: 'b.ts', workspaceRevision: SHA_A, sourceRevision: SHA_A, contentDigest: DIGEST_A, byteLength: 20 };
  const checksumOf = (rows: ApplySetRowV1[]) => createHash('sha256').update(canonicalApplySetJsonV1(rows)).digest('hex');

  it('is deterministic regardless of input row order (manifest generation determinism)', () => {
    expect(checksumOf([rowA, rowB])).toBe(checksumOf([rowB, rowA]));
  });

  it('changes if any authorized source row changes (even a single field)', () => {
    const original = checksumOf([rowA, rowB]);
    const changed = checksumOf([rowA, { ...rowB, contentDigest: DIGEST_B, sourceRevision: SHA_B }]);
    expect(changed).not.toBe(original);
  });

  it('changes if a row is added or removed', () => {
    expect(checksumOf([rowA])).not.toBe(checksumOf([rowA, rowB]));
  });
});

describe('checkApplySetIntegrityV1', () => {
  const rowA: ApplySetRowV1 = { sourceRef: 'a.ts', sourceAuthorityRepoId: 'deeds-web-app', canonicalSourceRef: 'a.ts', workspaceRevision: SHA_A, sourceRevision: SHA_A, contentDigest: DIGEST_A, byteLength: 10 };

  it('passes cleanly for a well-formed apply set', () => {
    const report = checkApplySetIntegrityV1([rowA]);
    expect(report.allChecksPassed).toBe(true);
    expect(report.duplicateKeyCount).toBe(0);
  });

  it('detects duplicate (sourceAuthorityRepoId, workspaceRevision, canonicalSourceRef) keys', () => {
    const report = checkApplySetIntegrityV1([rowA, { ...rowA, byteLength: 999 }]);
    expect(report.duplicateKeyCount).toBe(1);
    expect(report.allChecksPassed).toBe(false);
  });

  it('detects an invalid (non-sha256-shaped) workspaceRevision', () => {
    const report = checkApplySetIntegrityV1([{ ...rowA, workspaceRevision: 'HEAD' }]);
    expect(report.invalidWorkspaceRevisionShapeCount).toBe(1);
    expect(report.allChecksPassed).toBe(false);
  });

  it('detects a sourceRevision/contentDigest self-consistency mismatch', () => {
    const report = checkApplySetIntegrityV1([{ ...rowA, sourceRevision: SHA_B }]);
    expect(report.sourceRevisionDigestMismatchCount).toBe(1);
  });

  it('detects a missing canonicalSourceRef', () => {
    const report = checkApplySetIntegrityV1([{ ...rowA, canonicalSourceRef: '' }]);
    expect(report.missingCanonicalSourceRefCount).toBe(1);
  });

  it('detects a negative byteLength', () => {
    const report = checkApplySetIntegrityV1([{ ...rowA, byteLength: -1 }]);
    expect(report.negativeByteLengthCount).toBe(1);
  });
});
