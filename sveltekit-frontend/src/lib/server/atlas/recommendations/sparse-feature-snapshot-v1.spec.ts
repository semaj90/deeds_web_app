import { describe, expect, it } from 'vitest';
import { buildSparseFeatureSnapshotV1, parseSparseFeatureSnapshotV1 } from './sparse-feature-snapshot-v1.js';

const revision = `sha256:${'a'.repeat(64)}`;
const claimId = '22222222-2222-4222-8222-222222222222';

const input = {
  schema: 'atlas.sparse-feature-snapshot-input.v1',
  sourceSnapshotRef: 'fixture://verified-associations-v1',
  sourceSnapshotRevision: revision,
  candidateCatalogSnapshotSha256: 'b'.repeat(64),
  observations: [{
    contextRef: 'case-candidate://context-1',
    contextRevision: revision,
    candidateFeatureKey: 'feature-candidate:retrieval',
    candidateSourceRef: 'src/retrieval.ts',
    candidateSourceRevision: `sha256:${'c'.repeat(64)}`,
    polarity: 'OBSERVED_ASSOCIATION',
    evidenceClaimIds: [claimId],
    evidenceSourceRef: 'audit://fixture/association-1',
    evidenceSourceRevision: `sha256:${'d'.repeat(64)}`,
    evidenceSha256: 'd'.repeat(64),
  }],
} as const;

describe('buildSparseFeatureSnapshotV1', () => {
  it('freezes revision-bound observations and treats omitted pairs as unknown', () => {
    const snapshot = buildSparseFeatureSnapshotV1(input);

    expect(snapshot).toMatchObject({
      schema: 'atlas.sparse-feature-snapshot.v1',
      sourceSnapshotRevision: revision,
      missingPairSemantics: 'UNKNOWN_NOT_NEGATIVE',
      admission: 'PROPOSAL_ONLY',
      canonicalAuthority: false,
      observations: [{ polarity: 'OBSERVED_ASSOCIATION', evidenceClaimIds: [claimId] }],
    });
    expect(snapshot.snapshotSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(snapshot)).not.toContain('EXPLICIT_NEGATIVE');
  });

  it('produces an order-independent checksum for the same frozen sparse rows', () => {
    const second = {
      ...input.observations[0],
      contextRef: 'case-candidate://context-2',
      candidateFeatureKey: 'feature-candidate:timeline',
    };
    const forward = buildSparseFeatureSnapshotV1({ ...input, observations: [input.observations[0], second] });
    const reversed = buildSparseFeatureSnapshotV1({ ...input, observations: [second, input.observations[0]] });

    expect(forward.snapshotSha256).toBe(reversed.snapshotSha256);
    expect(forward.observations.map((row) => row.contextRef)).toEqual([
      'case-candidate://context-1', 'case-candidate://context-2',
    ]);
  });

  it('recomputes the digest when a consumer parses a persisted snapshot', () => {
    const snapshot = buildSparseFeatureSnapshotV1(input);
    expect(parseSparseFeatureSnapshotV1(snapshot)).toEqual(snapshot);
    expect(() => parseSparseFeatureSnapshotV1({ ...snapshot, sourceSnapshotRef: 'tampered' }))
      .toThrow('SPARSE_FEATURE_SNAPSHOT_DIGEST_MISMATCH');
  });

  it('allows an explicit negative only with source-bound evidence', () => {
    const snapshot = buildSparseFeatureSnapshotV1({
      ...input,
      observations: [{ ...input.observations[0], polarity: 'EXPLICIT_NEGATIVE' }],
    });

    expect(snapshot.observations[0]).toMatchObject({
      polarity: 'EXPLICIT_NEGATIVE',
      evidenceClaimIds: [claimId],
      evidenceSha256: 'd'.repeat(64),
    });
  });

  it('rejects duplicate or contradictory pairs, malformed revisions, and caller authority fields', () => {
    expect(() => buildSparseFeatureSnapshotV1({
      ...input,
      observations: [input.observations[0], { ...input.observations[0], polarity: 'EXPLICIT_NEGATIVE' }],
    })).toThrow(/DUPLICATE_OR_CONFLICTING_CONTEXT_FEATURE_PAIR/);
    expect(() => buildSparseFeatureSnapshotV1({ ...input, sourceSnapshotRevision: 'not-a-sha256' })).toThrow();
    expect(() => buildSparseFeatureSnapshotV1({ ...input, canonicalAuthority: true })).toThrow();
    expect(() => buildSparseFeatureSnapshotV1({
      ...input,
      observations: [{ ...input.observations[0], evidenceSha256: 'e'.repeat(64) }],
    })).toThrow(/EVIDENCE_REVISION_DIGEST_MISMATCH/);
  });
});
