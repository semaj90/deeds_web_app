import { describe, expect, it } from 'vitest';
import { buildCandidateFeatureMatrix } from './retrieval-candidate-feature-matrix-v1.js';
import { buildRepairCandidateFeatureBundleV1 } from './repair-candidate-feature-bundle-v1.js';
import {
  buildRepairFeatureProducerArtifactV1,
  buildRepairFeatureProducerSetV1,
} from './repair-feature-producer-v1.js';
import {
  buildRepairMrlFeatureProducerV1,
  mrlPrefixNormalizeV1,
} from './repair-mrl-feature-producer-v1.js';

const SHA_A = `sha256:${'a'.repeat(64)}`;
const SHA_B = `sha256:${'b'.repeat(64)}`;
const SHA_C = `sha256:${'c'.repeat(64)}`;
const BARE_SHA_B = 'b'.repeat(64);
const SNAPSHOT_TOKEN = `lineage-qualified-canary:${SHA_A}:v1:2`;

function axis(index: number): Float32Array {
  const out = new Float32Array(768);
  out[index] = 1;
  return out;
}

function identities() {
  return [
    { candidateOrdinal: 0, packetKey: 'packet:a', sourceRef: 'src/a.ts' },
    { candidateOrdinal: 1, packetKey: 'packet:b', sourceRef: 'src/b.ts' },
  ];
}

describe('RepairFeatureProducerV1', () => {
  it('builds a checksummed complete producer artifact and joins it into a producer set', () => {
    const artifact = buildRepairFeatureProducerArtifactV1({
      featureName: 'postgres_fts_score',
      state: 'PROVEN',
      candidateSnapshotRevision: SHA_A,
      ordinalMapChecksum: SHA_B,
      candidateRowCount: 2,
      producerId: 'fts-proof',
      producerRevision: 'fts-rev-1',
      derivation: 'OBSERVED_SCALAR',
      inputChecksum: SHA_C,
      rows: [
        { candidateOrdinal: 0, value: 0.75 },
        { candidateOrdinal: 1, value: 0.25 },
      ],
    });

    expect(artifact.rows).toHaveLength(2);
    expect(artifact.artifactChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);

    const set = buildRepairFeatureProducerSetV1({
      candidateSnapshotRevision: SHA_A,
      ordinalMapChecksum: SHA_B,
      candidateRowCount: 2,
      artifacts: [artifact],
    });

    expect(set.artifacts).toHaveLength(1);
    expect(set.overlayFeatureStates.postgres_fts_score).toBe('PROVEN');
    expect(set.overlayFeatureStates.latent_256_query_similarity).toBe('UNAVAILABLE');
    expect(set.overlayRows).toEqual([
      { candidateOrdinal: 0, values: { postgres_fts_score: 0.75 } },
      { candidateOrdinal: 1, values: { postgres_fts_score: 0.25 } },
    ]);
  });

  it('accepts the live opaque snapshot token and bare ordinal-map checksum encoding', () => {
    const artifact = buildRepairFeatureProducerArtifactV1({
      featureName: 'postgres_fts_score',
      state: 'PROVEN',
      candidateSnapshotRevision: SNAPSHOT_TOKEN,
      ordinalMapChecksum: BARE_SHA_B,
      candidateRowCount: 2,
      producerId: 'fts-proof',
      producerRevision: 'fts-rev-1',
      derivation: 'OBSERVED_SCALAR',
      inputChecksum: SHA_C,
      rows: [
        { candidateOrdinal: 0, value: 0.75 },
        { candidateOrdinal: 1, value: 0.25 },
      ],
    });

    const set = buildRepairFeatureProducerSetV1({
      candidateSnapshotRevision: SNAPSHOT_TOKEN,
      ordinalMapChecksum: BARE_SHA_B,
      candidateRowCount: 2,
      artifacts: [artifact],
    });

    expect(set.candidateSnapshotRevision).toBe(SNAPSHOT_TOKEN);
    expect(set.ordinalMapChecksum).toBe(BARE_SHA_B);
  });

  it('rejects a complete-state artifact with missing candidate coverage', () => {
    expect(() => buildRepairFeatureProducerArtifactV1({
      featureName: 'postgres_fts_score',
      state: 'PROVEN',
      candidateSnapshotRevision: SHA_A,
      ordinalMapChecksum: SHA_B,
      candidateRowCount: 2,
      producerId: 'fts-proof',
      producerRevision: 'fts-rev-1',
      derivation: 'OBSERVED_SCALAR',
      inputChecksum: SHA_C,
      rows: [{ candidateOrdinal: 0, value: 0.75 }],
    })).toThrow('REPAIR_FEATURE_ARTIFACT_COMPLETE_STATE_INCOMPLETE:postgres_fts_score');
  });

  it('rejects MRL feature metadata that claims a non-MRL derivation', () => {
    expect(() => buildRepairFeatureProducerArtifactV1({
      featureName: 'semantic_mrl_256_query_similarity',
      state: 'DERIVED',
      candidateSnapshotRevision: SHA_A,
      ordinalMapChecksum: SHA_B,
      candidateRowCount: 2,
      producerId: 'bad-mrl',
      producerRevision: 'bad-mrl-v1',
      derivation: 'OBSERVED_SCALAR',
      inputChecksum: SHA_C,
      representationId: 'semantic_mrl_256',
      representationRevision: 'semantic-rev-1:mrl256:l2-v1',
      sourceRepresentationId: 'semantic_768',
      sourceRepresentationRevision: 'semantic-rev-1',
      rows: [
        { candidateOrdinal: 0, value: 1 },
        { candidateOrdinal: 1, value: 0 },
      ],
    })).toThrow('REPAIR_FEATURE_ARTIFACT_MRL_DERIVATION_INVALID:semantic_mrl_256_query_similarity');
  });
});

describe('Repair MRL producer', () => {
  it('matches prefix + L2 normalization geometry on known vectors', () => {
    const normalized = mrlPrefixNormalizeV1(axis(0), 128);
    expect(normalized[0]).toBe(1);
    expect(normalized[1]).toBe(0);

    const result = buildRepairMrlFeatureProducerV1({
      candidateSnapshotRevision: SHA_A,
      ordinalMapChecksum: SHA_B,
      representationRevision: 'embeddinggemma-artifact-sha256:1234',
      queryVector: axis(0),
      queryRepresentationRevision: 'embeddinggemma-artifact-sha256:1234',
      producerRevision: 'repair-mrl-v1',
      candidates: [
        { candidateOrdinal: 0, vector: axis(0), representationRevision: 'embeddinggemma-artifact-sha256:1234' },
        { candidateOrdinal: 1, vector: axis(1), representationRevision: 'embeddinggemma-artifact-sha256:1234' },
      ],
    });

    expect(result.artifacts).toHaveLength(3);
    expect(result.producerSet.artifacts).toHaveLength(3);
    for (const artifact of result.artifacts) {
      expect(artifact.state).toBe('DERIVED');
      expect(artifact.derivation).toBe('MRL_PREFIX_L2_RENORMALIZE');
      expect(artifact.rows[0]?.value).toBeCloseTo(1, 6);
      expect(artifact.rows[1]?.value).toBeCloseTo(0, 6);
      expect(artifact.sourceRepresentationId).toBe('semantic_768');
    }
    expect(result.producerSet.overlayFeatureStates.semantic_mrl_512_query_similarity).toBe('DERIVED');
    expect(result.producerSet.overlayFeatureStates.semantic_mrl_256_query_similarity).toBe('DERIVED');
    expect(result.producerSet.overlayFeatureStates.semantic_mrl_128_query_similarity).toBe('DERIVED');
    expect(result.producerSet.overlayFeatureStates.latent_256_query_similarity).toBe('UNAVAILABLE');
  });

  it('fails closed on query/document representation revision mismatch', () => {
    expect(() => buildRepairMrlFeatureProducerV1({
      candidateSnapshotRevision: SHA_A,
      ordinalMapChecksum: SHA_B,
      representationRevision: 'semantic-rev-1',
      queryVector: axis(0),
      queryRepresentationRevision: 'semantic-rev-1',
      producerRevision: 'repair-mrl-v1',
      candidates: [
        { candidateOrdinal: 0, vector: axis(0), representationRevision: 'semantic-rev-1' },
        { candidateOrdinal: 1, vector: axis(1), representationRevision: 'semantic-rev-2' },
      ],
    })).toThrow('REPAIR_MRL_CANDIDATE_REPRESENTATION_REVISION_MISMATCH:1');
  });
});

describe('Repair candidate feature bundle', () => {
  it('binds the producer-set checksum to the populated tournament matrix', () => {
    const mrl = buildRepairMrlFeatureProducerV1({
      candidateSnapshotRevision: SHA_A,
      ordinalMapChecksum: SHA_B,
      representationRevision: 'semantic-rev-1',
      queryVector: axis(0),
      queryRepresentationRevision: 'semantic-rev-1',
      producerRevision: 'repair-mrl-v1',
      candidates: [
        { candidateOrdinal: 0, vector: axis(0), representationRevision: 'semantic-rev-1' },
        { candidateOrdinal: 1, vector: axis(1), representationRevision: 'semantic-rev-1' },
      ],
    });

    const baseMatrix = buildCandidateFeatureMatrix([
      { packet_key: 'packet:a', semantic_similarity_768: 1 },
      { packet_key: 'packet:b', semantic_similarity_768: 0 },
    ]);

    const bundle = buildRepairCandidateFeatureBundleV1({
      matrixInput: {
        baseMatrix,
        baseMatrixManifestChecksum: SHA_C,
        candidateSnapshotRevision: SHA_A,
        ordinalMapChecksum: SHA_B,
        producerRevision: 'repair-matrix-v1',
        identities: identities(),
      },
      producerSet: mrl.producerSet,
    });

    expect(bundle.producerSetChecksum).toBe(mrl.producerSet.producerSetChecksum);
    expect(bundle.bundleChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(bundle.matrix.overlayCoverage.semantic_mrl_512_query_similarity).toEqual({
      state: 'DERIVED', presentRows: 2, missingRows: 0,
    });
    expect(bundle.matrix.overlayCoverage.latent_256_query_similarity).toEqual({
      state: 'UNAVAILABLE', presentRows: 0, missingRows: 2,
    });
    expect(bundle.matrix.retrievalVote).toBe(false);
    expect(bundle.matrix.rankingPromotion).toBe(false);
  });

  it('rejects persisted producer-set overlay tampering before matrix construction', () => {
    const mrl = buildRepairMrlFeatureProducerV1({
      candidateSnapshotRevision: SHA_A,
      ordinalMapChecksum: SHA_B,
      representationRevision: 'semantic-rev-1',
      queryVector: axis(0),
      queryRepresentationRevision: 'semantic-rev-1',
      producerRevision: 'repair-mrl-v1',
      candidates: [
        { candidateOrdinal: 0, vector: axis(0), representationRevision: 'semantic-rev-1' },
        { candidateOrdinal: 1, vector: axis(1), representationRevision: 'semantic-rev-1' },
      ],
    });
    const tampered = {
      ...mrl.producerSet,
      overlayRows: mrl.producerSet.overlayRows.map((row) =>
        row.candidateOrdinal === 0
          ? { ...row, values: { ...row.values, semantic_mrl_512_query_similarity: 0.123 } }
          : row,
      ),
    };
    const baseMatrix = buildCandidateFeatureMatrix([
      { packet_key: 'packet:a' },
      { packet_key: 'packet:b' },
    ]);

    expect(() => buildRepairCandidateFeatureBundleV1({
      matrixInput: {
        baseMatrix,
        baseMatrixManifestChecksum: SHA_C,
        candidateSnapshotRevision: SHA_A,
        ordinalMapChecksum: SHA_B,
        producerRevision: 'repair-matrix-v1',
        identities: identities(),
      },
      producerSet: tampered,
    })).toThrow('REPAIR_FEATURE_SET_CHECKSUM_MISMATCH');
  });

  it('rejects tampering inside a carried producer artifact even if summaries are untouched', () => {
    const mrl = buildRepairMrlFeatureProducerV1({
      candidateSnapshotRevision: SHA_A,
      ordinalMapChecksum: SHA_B,
      representationRevision: 'semantic-rev-1',
      queryVector: axis(0),
      queryRepresentationRevision: 'semantic-rev-1',
      producerRevision: 'repair-mrl-v1',
      candidates: [
        { candidateOrdinal: 0, vector: axis(0), representationRevision: 'semantic-rev-1' },
        { candidateOrdinal: 1, vector: axis(1), representationRevision: 'semantic-rev-1' },
      ],
    });
    const firstArtifact = mrl.producerSet.artifacts[0]!;
    const tamperedArtifact = {
      ...firstArtifact,
      rows: firstArtifact.rows.map((row) =>
        row.candidateOrdinal === 0 ? { ...row, value: 0.123 } : row,
      ),
    };
    const tamperedSet = {
      ...mrl.producerSet,
      artifacts: [tamperedArtifact, ...mrl.producerSet.artifacts.slice(1)],
    };
    const baseMatrix = buildCandidateFeatureMatrix([
      { packet_key: 'packet:a' },
      { packet_key: 'packet:b' },
    ]);

    expect(() => buildRepairCandidateFeatureBundleV1({
      matrixInput: {
        baseMatrix,
        baseMatrixManifestChecksum: SHA_C,
        candidateSnapshotRevision: SHA_A,
        ordinalMapChecksum: SHA_B,
        producerRevision: 'repair-matrix-v1',
        identities: identities(),
      },
      producerSet: tamperedSet,
    })).toThrow('REPAIR_FEATURE_ARTIFACT_OUTPUT_CHECKSUM_MISMATCH');
  });

  it('rejects a producer set from another candidate snapshot', () => {
    const artifact = buildRepairFeatureProducerArtifactV1({
      featureName: 'postgres_fts_score',
      state: 'PROVEN',
      candidateSnapshotRevision: SHA_C,
      ordinalMapChecksum: SHA_B,
      candidateRowCount: 2,
      producerId: 'fts-proof',
      producerRevision: 'fts-rev-1',
      derivation: 'OBSERVED_SCALAR',
      inputChecksum: SHA_A,
      rows: [
        { candidateOrdinal: 0, value: 1 },
        { candidateOrdinal: 1, value: 0 },
      ],
    });
    const producerSet = buildRepairFeatureProducerSetV1({
      candidateSnapshotRevision: SHA_C,
      ordinalMapChecksum: SHA_B,
      candidateRowCount: 2,
      artifacts: [artifact],
    });
    const baseMatrix = buildCandidateFeatureMatrix([
      { packet_key: 'packet:a' },
      { packet_key: 'packet:b' },
    ]);

    expect(() => buildRepairCandidateFeatureBundleV1({
      matrixInput: {
        baseMatrix,
        baseMatrixManifestChecksum: SHA_A,
        candidateSnapshotRevision: SHA_A,
        ordinalMapChecksum: SHA_B,
        producerRevision: 'repair-matrix-v1',
        identities: identities(),
      },
      producerSet,
    })).toThrow('REPAIR_BUNDLE_CANDIDATE_SNAPSHOT_MISMATCH');
  });
});
