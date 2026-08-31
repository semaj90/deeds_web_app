import { describe, expect, it } from 'vitest';
import {
  buildRepairFeatureProducerArtifactV1,
  buildRepairFeatureProducerSetV1,
  verifyRepairFeatureProducerArtifactV1,
  verifyRepairFeatureProducerSetV1,
} from './repair-feature-producer-v1.js';

const SHA_A = `sha256:${'a'.repeat(64)}`;
const SHA_B = `sha256:${'b'.repeat(64)}`;
const SHA_C = `sha256:${'c'.repeat(64)}`;
const BARE_ROW_SHA = 'd'.repeat(64);

function artifact() {
  return buildRepairFeatureProducerArtifactV1({
    featureName: 'postgres_fts_score',
    state: 'PROVEN',
    candidateSnapshotRevision: `lineage-qualified-canary:${SHA_A}:v1:2`,
    ordinalMapChecksum: 'b'.repeat(64),
    candidateRowCount: 2,
    producerId: 'fts-proof',
    producerRevision: 'fts-rev-1',
    derivation: 'OBSERVED_SCALAR',
    inputChecksum: SHA_C,
    rows: [
      { candidateOrdinal: 0, value: 0.75, inputRowChecksum: BARE_ROW_SHA },
      { candidateOrdinal: 1, value: 0.25, inputRowChecksum: SHA_B },
    ],
  });
}

describe('persisted RepairFeatureProducerV1 validation', () => {
  it('accepts both bare and sha256-prefixed row input checksums', () => {
    const value = artifact();
    expect(() => verifyRepairFeatureProducerArtifactV1(value)).not.toThrow();
    expect(value.rows[0]?.inputRowChecksum).toBe(BARE_ROW_SHA);
    expect(value.rows[1]?.inputRowChecksum).toBe(SHA_B);
  });

  it('fails with a coded error when persisted artifact rows are absent', () => {
    const value = { ...artifact(), rows: undefined } as unknown as ReturnType<typeof artifact>;
    expect(() => verifyRepairFeatureProducerArtifactV1(value)).toThrow(
      'REPAIR_FEATURE_ARTIFACT_ROWS_INVALID:postgres_fts_score',
    );
  });

  it('fails with a coded error when a persisted producer set lacks full artifacts', () => {
    const value = artifact();
    const set = buildRepairFeatureProducerSetV1({
      candidateSnapshotRevision: value.candidateSnapshotRevision,
      ordinalMapChecksum: value.ordinalMapChecksum,
      candidateRowCount: 2,
      artifacts: [value],
    });
    const legacySummaryOnly = { ...set, artifacts: undefined } as unknown as typeof set;
    expect(() => verifyRepairFeatureProducerSetV1(legacySummaryOnly)).toThrow(
      'REPAIR_FEATURE_SET_ARTIFACTS_INVALID',
    );
  });

  it('keeps generated artifact and set checksums sha256-prefixed', () => {
    const value = artifact();
    const set = buildRepairFeatureProducerSetV1({
      candidateSnapshotRevision: value.candidateSnapshotRevision,
      ordinalMapChecksum: value.ordinalMapChecksum,
      candidateRowCount: 2,
      artifacts: [value],
    });
    expect(value.inputChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(value.outputChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(value.artifactChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(set.producerSetChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
