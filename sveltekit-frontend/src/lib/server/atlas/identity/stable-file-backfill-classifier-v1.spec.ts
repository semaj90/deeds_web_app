import { describe, expect, it } from 'vitest';
import { classifyStableFileBackfillCandidateV1, type BackfillClassificationContextV1, type SealedCohortSourceV1 } from './stable-file-backfill-classifier-v1';

const CANDIDATE_ROOT: SealedCohortSourceV1 = {
  sourceRef: 'src/index.ts',
  repositoryId: 'repo:root',
  repositoryRelativePath: 'src/index.ts',
  sourceRevision: 'sha256:aaaa',
  contentDigest: 'aaaa',
  byteLength: 100,
};

const CANDIDATE_NESTED: SealedCohortSourceV1 = {
  sourceRef: 'claude-mem/foo.ts',
  repositoryId: 'repo:claude-mem',
  repositoryRelativePath: 'foo.ts',
  sourceRevision: 'sha256:bbbb',
  contentDigest: 'bbbb',
  byteLength: 50,
};

function makeCtx(overrides: Partial<BackfillClassificationContextV1> = {}): BackfillClassificationContextV1 {
  return {
    sourceAuthorityRepoIdForGraphifyRepo: (id) => (id === 'repo:root' ? 'deeds-web-app' : null),
    admittedBindingFor: (repoId, path) =>
      repoId === 'deeds-web-app' && path === 'src/index.ts' ? { source_revision: 'sha256:aaaa', content_digest: 'aaaa', workspace_revision: 'sha256:ws' } : null,
    activeStableFileExistsFor: () => false,
    provenMoveEvidenceFor: () => false,
    ...overrides,
  };
}

describe('classifyStableFileBackfillCandidateV1', () => {
  it('classifies REPOSITORY_NAMESPACE_MISSING when no bridge exists for the Graphify repository namespace (population B)', () => {
    const result = classifyStableFileBackfillCandidateV1(CANDIDATE_NESTED, makeCtx());
    expect(result.classification).toBe('REPOSITORY_NAMESPACE_MISSING');
    expect(result.sourceAuthorityRepoId).toBeNull();
  });

  it('classifies SAFE_NEW_ID when the repository is admitted, no stable file exists yet, and the admitted binding matches exactly (population A default)', () => {
    const result = classifyStableFileBackfillCandidateV1(CANDIDATE_ROOT, makeCtx());
    expect(result.classification).toBe('SAFE_NEW_ID');
    expect(result.sourceAuthorityRepoId).toBe('deeds-web-app');
  });

  it('classifies SAFE_EXISTING_CONTINUITY when an ACTIVE stableFileId already exists for the key', () => {
    const result = classifyStableFileBackfillCandidateV1(CANDIDATE_ROOT, makeCtx({ activeStableFileExistsFor: () => true }));
    expect(result.classification).toBe('SAFE_EXISTING_CONTINUITY');
  });

  it('classifies MOVE_CONTINUITY_PROVEN only when proven move evidence exists (checked before the admitted-binding lookup)', () => {
    const result = classifyStableFileBackfillCandidateV1(CANDIDATE_ROOT, makeCtx({ provenMoveEvidenceFor: () => true }));
    expect(result.classification).toBe('MOVE_CONTINUITY_PROVEN');
  });

  it('classifies SOURCE_HISTORY_INSUFFICIENT when the repository namespace is admitted but no binding row exists for this exact path', () => {
    const result = classifyStableFileBackfillCandidateV1(
      { ...CANDIDATE_ROOT, repositoryRelativePath: 'src/nonexistent.ts' },
      makeCtx(),
    );
    expect(result.classification).toBe('SOURCE_HISTORY_INSUFFICIENT');
  });

  it('classifies AMBIGUOUS_CONTINUITY (fail closed, never picked arbitrarily) when the admitted binding disagrees with the sealed cohort value', () => {
    const result = classifyStableFileBackfillCandidateV1(
      CANDIDATE_ROOT,
      makeCtx({
        admittedBindingFor: () => ({ source_revision: 'sha256:different', content_digest: 'different', workspace_revision: 'sha256:ws' }),
      }),
    );
    expect(result.classification).toBe('AMBIGUOUS_CONTINUITY');
  });

  it('never defaults an ambiguous or insufficient row to SAFE_NEW_ID (fail-closed invariant)', () => {
    const insufficient = classifyStableFileBackfillCandidateV1({ ...CANDIDATE_ROOT, repositoryRelativePath: 'missing.ts' }, makeCtx());
    const ambiguous = classifyStableFileBackfillCandidateV1(CANDIDATE_ROOT, makeCtx({ admittedBindingFor: () => ({ source_revision: 'sha256:x', content_digest: 'x', workspace_revision: 'sha256:ws' }) }));
    expect(insufficient.classification).not.toBe('SAFE_NEW_ID');
    expect(ambiguous.classification).not.toBe('SAFE_NEW_ID');
  });
});
