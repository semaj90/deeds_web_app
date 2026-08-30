import { describe, expect, it } from 'vitest';
import { buildRepairFeaturePresenceEvidenceV1 } from './repair-feature-presence-evidence-v1.js';
import { buildRepairMrlFeatureProducerV1 } from './repair-mrl-feature-producer-v1.js';

const SNAPSHOT = `lineage-qualified-canary:sha256:${'a'.repeat(64)}:v1:2`;
const ORDINAL = 'b'.repeat(64);

function axis(index: number): Float32Array {
  const out = new Float32Array(768);
  out[index] = 1;
  return out;
}

function mrlSet() {
  return buildRepairMrlFeatureProducerV1({
    candidateSnapshotRevision: SNAPSHOT,
    ordinalMapChecksum: ORDINAL,
    representationRevision: 'semantic-768-revision-v1',
    queryVector: axis(0),
    queryRepresentationRevision: 'semantic-768-revision-v1',
    producerRevision: 'repair-mrl-v1',
    candidates: [
      { candidateOrdinal: 0, vector: axis(0), representationRevision: 'semantic-768-revision-v1' },
      { candidateOrdinal: 1, vector: axis(1), representationRevision: 'semantic-768-revision-v1' },
    ],
  }).producerSet;
}

describe('buildRepairFeaturePresenceEvidenceV1', () => {
  it('defaults optional learned/derived features to UNAVAILABLE', () => {
    const evidence = buildRepairFeaturePresenceEvidenceV1({
      candidateSnapshotRevision: SNAPSHOT,
      ordinalMapChecksum: ORDINAL,
      candidateRowCount: 2,
    });

    expect(evidence.featurePresence.latent256).toBe('UNAVAILABLE');
    expect(evidence.featurePresence.latent256QuerySimilarity).toBe('UNAVAILABLE');
    expect(evidence.featurePresence.semanticMrl512QuerySimilarity).toBe('UNAVAILABLE');
    expect(evidence.evidence.repairProducerSetChecksum).toBeNull();
  });

  it('promotes only MRL query-similarity presence from a verified MRL producer set', () => {
    const set = mrlSet();
    const evidence = buildRepairFeaturePresenceEvidenceV1({
      candidateSnapshotRevision: SNAPSHOT,
      ordinalMapChecksum: ORDINAL,
      candidateRowCount: 2,
      repairProducerSet: set,
    });

    expect(evidence.featurePresence.semanticMrl512QuerySimilarity).toBe('DERIVED');
    expect(evidence.featurePresence.semanticMrl256QuerySimilarity).toBe('DERIVED');
    expect(evidence.featurePresence.semanticMrl128QuerySimilarity).toBe('DERIVED');
    expect(evidence.featurePresence.latent256).toBe('UNAVAILABLE');
    expect(evidence.featurePresence.latent256QuerySimilarity).toBe('UNAVAILABLE');
    expect(evidence.evidence.repairProducerSetChecksum).toBe(set.producerSetChecksum);
  });

  it('rejects producer evidence from another candidate snapshot', () => {
    const set = mrlSet();
    expect(() => buildRepairFeaturePresenceEvidenceV1({
      candidateSnapshotRevision: `other:${'c'.repeat(64)}`,
      ordinalMapChecksum: ORDINAL,
      candidateRowCount: 2,
      repairProducerSet: set,
    })).toThrow('REPAIR_PRESENCE_PRODUCER_SET_CANDIDATE_SNAPSHOT_MISMATCH');
  });

  it('rejects a producer set whose carried artifact was tampered', () => {
    const set = mrlSet();
    const first = set.artifacts[0]!;
    const tampered = {
      ...set,
      artifacts: [
        {
          ...first,
          rows: first.rows.map((row) =>
            row.candidateOrdinal === 0 ? { ...row, value: 0.123 } : row,
          ),
        },
        ...set.artifacts.slice(1),
      ],
    };

    expect(() => buildRepairFeaturePresenceEvidenceV1({
      candidateSnapshotRevision: SNAPSHOT,
      ordinalMapChecksum: ORDINAL,
      candidateRowCount: 2,
      repairProducerSet: tampered,
    })).toThrow('REPAIR_FEATURE_ARTIFACT_OUTPUT_CHECKSUM_MISMATCH');
  });
});
