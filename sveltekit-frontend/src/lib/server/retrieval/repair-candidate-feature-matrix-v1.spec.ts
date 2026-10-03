import { describe, expect, it } from 'vitest';
import { buildCandidateFeatureMatrix } from './retrieval-candidate-feature-matrix-v1.js';
import {
  REPAIR_OVERLAY_FEATURE_NAMES,
  buildRepairCandidateFeatureMatrixV1,
  type RepairOverlayFeatureStatesV1,
} from './repair-candidate-feature-matrix-v1.js';

const SHA_A = `sha256:${'a'.repeat(64)}`;
const SHA_B = `sha256:${'b'.repeat(64)}`;
const SHA_C = `sha256:${'c'.repeat(64)}`;

function states(
  overrides: Partial<RepairOverlayFeatureStatesV1> = {},
): RepairOverlayFeatureStatesV1 {
  const result = Object.fromEntries(
    REPAIR_OVERLAY_FEATURE_NAMES.map((name) => [name, 'UNAVAILABLE']),
  ) as RepairOverlayFeatureStatesV1;
  return Object.assign(result, overrides);
}

function fixture() {
  const baseMatrix = buildCandidateFeatureMatrix([
    {
      packet_key: 'packet:a',
      semantic_similarity_768: 0.9,
      lexical_score: 0.5,
      exact_symbol_match: 1,
      source_revision_match: 1,
      representation_revision_match: 1,
    },
    {
      packet_key: 'packet:b',
      semantic_similarity_768: 0.7,
      lexical_score: 0.2,
      source_revision_match: 1,
      representation_revision_match: 1,
    },
  ]);

  const identities = [
    {
      candidateOrdinal: 0,
      packetKey: 'packet:a',
      sourceRef: 'src/a.ts',
      sourceRevision: SHA_A,
      workspaceRevision: SHA_B,
      semanticRevision: SHA_C,
      representationRevision: SHA_C,
    },
    {
      candidateOrdinal: 1,
      packetKey: 'packet:b',
      sourceRef: 'src/b.ts',
      sourceRevision: SHA_A,
      workspaceRevision: SHA_B,
      semanticRevision: SHA_C,
      representationRevision: SHA_C,
    },
  ];

  return { baseMatrix, identities };
}

describe('buildRepairCandidateFeatureMatrixV1', () => {
  it('preserves the existing 25-column base plane exactly and appends repair features', () => {
    const { baseMatrix, identities } = fixture();
    const featureStates = states({
      postgres_fts_score: 'PROVEN',
      ast_direct_span_match: 'PARTIAL',
    });

    const result = buildRepairCandidateFeatureMatrixV1({
      baseMatrix,
      baseMatrixManifestChecksum: SHA_A,
      candidateSnapshotRevision: SHA_B,
      ordinalMapChecksum: SHA_C,
      producerRevision: 'repair-feature-matrix-v1-test',
      identities,
      overlayFeatureStates: featureStates,
      overlayRows: [
        { candidateOrdinal: 0, values: { postgres_fts_score: 0.8, ast_direct_span_match: 1 } },
        { candidateOrdinal: 1, values: { postgres_fts_score: 0.4 } },
      ],
    });

    expect(result.baseFeatureCount).toBe(25);
    expect(result.repairFeatureCount).toBe(REPAIR_OVERLAY_FEATURE_NAMES.length);
    expect(result.featureCount).toBe(25 + REPAIR_OVERLAY_FEATURE_NAMES.length);

    for (let row = 0; row < baseMatrix.candidate_count; row++) {
      for (let feature = 0; feature < baseMatrix.feature_count; feature++) {
        const baseIndex = row * baseMatrix.feature_count + feature;
        const combinedIndex = row * result.featureCount + feature;
        expect(result.featureValues[combinedIndex]).toBe(baseMatrix.candidate_features[baseIndex]);
        expect(result.presenceMask[combinedIndex]).toBe(baseMatrix.presence_mask[baseIndex]);
      }
    }

    expect(result.overlayCoverage.postgres_fts_score).toEqual({
      state: 'PROVEN', presentRows: 2, missingRows: 0,
    });
    expect(result.overlayCoverage.ast_direct_span_match).toEqual({
      state: 'PARTIAL', presentRows: 1, missingRows: 1,
    });
    expect(result.overlayCoverage.latent_256_query_similarity).toEqual({
      state: 'UNAVAILABLE', presentRows: 0, missingRows: 2,
    });
    expect(result.canonicalAuthority).toBe(false);
    expect(result.retrievalVote).toBe(false);
    expect(result.rankingPromotion).toBe(false);
    expect(result.mutationAuthority).toBe(false);
  });

  it('is deterministic for the same frozen inputs', () => {
    const { baseMatrix, identities } = fixture();
    const input = {
      baseMatrix,
      baseMatrixManifestChecksum: SHA_A,
      candidateSnapshotRevision: SHA_B,
      ordinalMapChecksum: SHA_C,
      producerRevision: 'repair-feature-matrix-v1-test',
      identities,
      overlayFeatureStates: states(),
    };

    const first = buildRepairCandidateFeatureMatrixV1(input);
    const second = buildRepairCandidateFeatureMatrixV1(input);
    expect(first.manifestChecksum).toBe(second.manifestChecksum);
    expect(first.matrixChecksum).toBe(second.matrixChecksum);
    expect(first.presenceMaskChecksum).toBe(second.presenceMaskChecksum);
    expect(first.identityChecksum).toBe(second.identityChecksum);
  });

  it('fails closed when row order does not equal CandidateOrdinal', () => {
    const { baseMatrix, identities } = fixture();
    expect(() => buildRepairCandidateFeatureMatrixV1({
      baseMatrix,
      baseMatrixManifestChecksum: SHA_A,
      candidateSnapshotRevision: SHA_B,
      ordinalMapChecksum: SHA_C,
      producerRevision: 'test',
      identities: [identities[1]!, identities[0]!],
      overlayFeatureStates: states(),
    })).toThrow('REPAIR_CANDIDATE_ORDINAL_ROW_MISMATCH');
  });

  it('fails closed when an UNAVAILABLE feature receives a fabricated value', () => {
    const { baseMatrix, identities } = fixture();
    expect(() => buildRepairCandidateFeatureMatrixV1({
      baseMatrix,
      baseMatrixManifestChecksum: SHA_A,
      candidateSnapshotRevision: SHA_B,
      ordinalMapChecksum: SHA_C,
      producerRevision: 'test',
      identities,
      overlayFeatureStates: states(),
      overlayRows: [
        { candidateOrdinal: 0, values: { latent_256_query_similarity: 0.8 } },
      ],
    })).toThrow('REPAIR_FEATURE_UNAVAILABLE_HAS_VALUES:latent_256_query_similarity');
  });

  it('fails closed when a PROVEN feature does not cover the full frozen universe', () => {
    const { baseMatrix, identities } = fixture();
    expect(() => buildRepairCandidateFeatureMatrixV1({
      baseMatrix,
      baseMatrixManifestChecksum: SHA_A,
      candidateSnapshotRevision: SHA_B,
      ordinalMapChecksum: SHA_C,
      producerRevision: 'test',
      identities,
      overlayFeatureStates: states({ postgres_fts_score: 'PROVEN' }),
      overlayRows: [
        { candidateOrdinal: 0, values: { postgres_fts_score: 0.8 } },
      ],
    })).toThrow('REPAIR_FEATURE_COMPLETE_STATE_HAS_MISSING_ROWS:postgres_fts_score');
  });

  it('fails closed on non-finite challenger features', () => {
    const { baseMatrix, identities } = fixture();
    expect(() => buildRepairCandidateFeatureMatrixV1({
      baseMatrix,
      baseMatrixManifestChecksum: SHA_A,
      candidateSnapshotRevision: SHA_B,
      ordinalMapChecksum: SHA_C,
      producerRevision: 'test',
      identities,
      overlayFeatureStates: states({ postgres_fts_score: 'PARTIAL' }),
      overlayRows: [
        { candidateOrdinal: 0, values: { postgres_fts_score: Number.NaN } },
      ],
    })).toThrow('REPAIR_OVERLAY_VALUE_NON_FINITE:postgres_fts_score:0');
  });

  describe('CFM-PRESENCE-NULLABILITY-01', () => {
    // Required identity fields must reject undefined, null, '', and whitespace-only alike —
    // a bare `!value` falsy check rejects '' but not '   ', letting a blank-but-truthy string
    // masquerade as qualified provenance.
    it.each([undefined, null, '', '   '])(
      'rejects packetKey = %p as REPAIR_PACKET_KEY_INVALID_OR_DUPLICATE',
      (blank) => {
        const { baseMatrix, identities } = fixture();
        const broken = [{ ...identities[0]!, packetKey: blank as unknown as string }, identities[1]!];
        expect(() => buildRepairCandidateFeatureMatrixV1({
          baseMatrix,
          baseMatrixManifestChecksum: SHA_A,
          candidateSnapshotRevision: SHA_B,
          ordinalMapChecksum: SHA_C,
          producerRevision: 'test',
          identities: broken,
          overlayFeatureStates: states(),
        })).toThrow('REPAIR_PACKET_KEY_INVALID_OR_DUPLICATE:0');
      },
    );

    it.each([undefined, null, '', '   '])(
      'rejects sourceRef = %p as REPAIR_SOURCE_REF_REQUIRED',
      (blank) => {
        const { baseMatrix, identities } = fixture();
        const broken = [{ ...identities[0]!, sourceRef: blank as unknown as string }, identities[1]!];
        expect(() => buildRepairCandidateFeatureMatrixV1({
          baseMatrix,
          baseMatrixManifestChecksum: SHA_A,
          candidateSnapshotRevision: SHA_B,
          ordinalMapChecksum: SHA_C,
          producerRevision: 'test',
          identities: broken,
          overlayFeatureStates: states(),
        })).toThrow('REPAIR_SOURCE_REF_REQUIRED:0');
      },
    );

    // Optional revision fields legitimately allow null/undefined ("not supplied"), but a
    // supplied blank/whitespace-only value is never a real revision token and must fail closed.
    it.each(['', '   '])(
      'rejects a supplied blank sourceRevision = %p as REPAIR_SOURCE_REVISION_BLANK',
      (blank) => {
        const { baseMatrix, identities } = fixture();
        const broken = [{ ...identities[0]!, sourceRevision: blank }, identities[1]!];
        expect(() => buildRepairCandidateFeatureMatrixV1({
          baseMatrix,
          baseMatrixManifestChecksum: SHA_A,
          candidateSnapshotRevision: SHA_B,
          ordinalMapChecksum: SHA_C,
          producerRevision: 'test',
          identities: broken,
          overlayFeatureStates: states(),
        })).toThrow('REPAIR_SOURCE_REVISION_BLANK:0');
      },
    );

    it.each(['', '   '])(
      'rejects a supplied blank representationRevision = %p as REPAIR_REPRESENTATION_REVISION_BLANK',
      (blank) => {
        const { baseMatrix, identities } = fixture();
        const broken = [{ ...identities[0]!, representationRevision: blank }, identities[1]!];
        expect(() => buildRepairCandidateFeatureMatrixV1({
          baseMatrix,
          baseMatrixManifestChecksum: SHA_A,
          candidateSnapshotRevision: SHA_B,
          ordinalMapChecksum: SHA_C,
          producerRevision: 'test',
          identities: broken,
          overlayFeatureStates: states(),
        })).toThrow('REPAIR_REPRESENTATION_REVISION_BLANK:0');
      },
    );

    it.each([null, undefined] as const)(
      'accepts workspaceRevision = %p as legitimately not-supplied',
      (notSupplied) => {
        const { baseMatrix, identities } = fixture();
        const ok = [{ ...identities[0]!, workspaceRevision: notSupplied }, identities[1]!];
        expect(() => buildRepairCandidateFeatureMatrixV1({
          baseMatrix,
          baseMatrixManifestChecksum: SHA_A,
          candidateSnapshotRevision: SHA_B,
          ordinalMapChecksum: SHA_C,
          producerRevision: 'test',
          identities: ok,
          overlayFeatureStates: states(),
        })).not.toThrow();
      },
    );
  });
});
