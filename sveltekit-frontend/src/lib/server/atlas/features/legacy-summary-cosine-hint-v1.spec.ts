import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  sealLegacySummaryCosineHintArtifactV1,
  verifyLegacySummaryCosineHintArtifactV1,
} from './legacy-summary-cosine-hint-v1.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');

function fixture() {
  return {
    schema: 'atlas.legacy-summary-cosine-hint.v1' as const,
    candidateSnapshotRevision: 'snapshot:fixture',
    ordinalMapChecksum: digest('ordinals'),
    queryDigest: digest('query'),
    featureRevision: 'legacy-hint-feature:fixture',
    rows: [{
      candidateOrdinal: 3,
      canonicalId: 'candidate:3',
      sourceRef: 'src/a.ts',
      sourceRevision: 'sha256:source',
      summaryDigest: digest('legacy summary'),
      trustTier: 'LEGACY_HINT_LINEAGE_BOUND' as const,
      rawCosine: 0.8,
      score01: 0.9,
      queryRank: 1,
      evidenceRef: 'census-row:3',
    }],
    canonicalAuthority: false as const,
    retrievalVote: false as const,
    rankingPromotion: false as const,
  };
}

describe('LegacySummaryCosineHintV1', () => {
  it('seals deterministic CandidateOrdinal-bound hint evidence without granting authority', () => {
    const first = sealLegacySummaryCosineHintArtifactV1(fixture());
    const second = sealLegacySummaryCosineHintArtifactV1(fixture());
    expect(first).toEqual(second);
    expect(verifyLegacySummaryCosineHintArtifactV1(first)).toEqual(first);
    expect(first.canonicalAuthority).toBe(false);
    expect(first.retrievalVote).toBe(false);
    expect(first.rankingPromotion).toBe(false);
  });

  it('rejects a raw/normalized cosine mismatch and duplicate candidate/rank', () => {
    expect(() => sealLegacySummaryCosineHintArtifactV1({
      ...fixture(), rows: [{ ...fixture().rows[0], score01: 0.1 }],
    })).toThrow();
    const rows = [fixture().rows[0], { ...fixture().rows[0], candidateOrdinal: 4 }];
    expect(() => sealLegacySummaryCosineHintArtifactV1({ ...fixture(), rows })).toThrow(/LEGACY_HINT_DUPLICATE_QUERY_RANK/);
  });

  it('requires deterministic descending cosine order with CandidateOrdinal tie breaks', () => {
    const top = fixture().rows[0];
    const next = { ...top, candidateOrdinal: 4, canonicalId: 'candidate:4', queryRank: 2, rawCosine: 0.7, score01: 0.85 };
    expect(() => sealLegacySummaryCosineHintArtifactV1({ ...fixture(), rows: [next, top] })).toThrow(/LEGACY_HINT_RANK_ORDER_INVALID/);
  });

  it('rejects tampering after sealing', () => {
    const artifact = sealLegacySummaryCosineHintArtifactV1(fixture());
    expect(() => verifyLegacySummaryCosineHintArtifactV1({
      ...artifact,
      rows: [{ ...artifact.rows[0], rawCosine: 0.7, score01: 0.85 }],
    })).toThrow(/LEGACY_HINT_ARTIFACT_CHECKSUM_MISMATCH/);
  });
});
