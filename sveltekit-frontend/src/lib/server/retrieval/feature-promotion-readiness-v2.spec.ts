import { describe, expect, it } from 'vitest';
import {
  buildFeaturePromotionReadinessV2,
  isFeaturePromotionReadinessV2,
  type FeaturePromotionGatesV2,
} from './feature-promotion-readiness-v2.js';

const evidence = (state: 'PROVEN' | 'OPEN' | 'BLOCKED' | 'DEFERRED', ref?: string) => ({
  state,
  evidenceRefs: state === 'PROVEN' && ref ? [ref] : [],
});

const gates: FeaturePromotionGatesV2 = {
  FEATURE_ARTIFACT_PRESENT: evidence('OPEN'),
  SAME_SNAPSHOT_COORDINATES: evidence('PROVEN', 'receipt:mapreduce-v3'),
  GRAIN_QUALIFICATION: evidence('PROVEN', 'receipt:mapreduce-v3'),
  INPUT_PROVENANCE: evidence('BLOCKED', 'receipt:mapreduce-v3'),
  MISSING_VALUE_POLICY: evidence('OPEN'),
  PLACEHOLDER_MASKING: evidence('OPEN'),
  CONTEXT_MANIFEST_READBACK: evidence('OPEN'),
  PRODUCTION_SCORER_CALLER: evidence('OPEN'),
  HELD_OUT_EVALUATION: evidence('DEFERRED'),
  PERSISTENCE_AUTHORIZATION: evidence('DEFERRED'),
};

function build(
  gateOverrides: Partial<FeaturePromotionGatesV2> = {},
  storage = {
    table: 'codebase_chunk_index' as const,
    column: 'content_embedding_768' as const,
    storageType: 'vector(768)' as const,
  },
) {
  return buildFeaturePromotionReadinessV2({
    featureId: 'semantic_768',
    candidateSnapshotRevision: `sha256:${'a'.repeat(64)}`,
    ordinalMapChecksum: 'b'.repeat(64),
    representationId: 'semantic_768',
    storage,
    gates: { ...gates, ...gateOverrides },
    canonicalAuthority: false,
    writesPerformed: false,
  });
}

describe('FeaturePromotionReadinessV2', () => {
  it('keeps the current semantic cohort NOT_READY when no feature artifact is admitted', () => {
    const receipt = build();
    expect(receipt.highestReadyStage).toBe('NOT_READY');
    expect(receipt.canonicalAuthority).toBe(false);
    expect(receipt.writesPerformed).toBe(false);
    expect(isFeaturePromotionReadinessV2(receipt)).toBe(true);
  });

  it('allows ARTIFACT_ONLY for a cited artifact without qualifying its inputs', () => {
    const receipt = build({
      FEATURE_ARTIFACT_PRESENT: evidence('PROVEN', 'fixture:feature-artifact'),
    });
    expect(receipt.highestReadyStage).toBe('ARTIFACT_ONLY');
    expect(receipt.gates.INPUT_PROVENANCE.state).toBe('BLOCKED');
  });

  it('requires evidence references for every PROVEN gate', () => {
    expect(() => build({
      INPUT_PROVENANCE: evidence('PROVEN'),
    })).toThrow(/evidence reference/i);
  });

  it('does not reach matrix admission while any input gate is open or blocked', () => {
    const receipt = build({
      FEATURE_ARTIFACT_PRESENT: evidence('PROVEN', 'fixture:feature-artifact'),
      INPUT_PROVENANCE: evidence('PROVEN', 'receipt:qualified-input'),
      MISSING_VALUE_POLICY: evidence('PROVEN', 'test:presence-mask'),
      PLACEHOLDER_MASKING: evidence('PROVEN', 'test:placeholder-mask'),
    });
    expect(receipt.highestReadyStage).toBe('MATRIX_ADMITTED');
  });

  it('requires context readback and a real scorer caller before SCORER_EXPOSED', () => {
    const receipt = build({
      FEATURE_ARTIFACT_PRESENT: evidence('PROVEN', 'fixture:feature-artifact'),
      INPUT_PROVENANCE: evidence('PROVEN', 'receipt:qualified-input'),
      MISSING_VALUE_POLICY: evidence('PROVEN', 'test:presence-mask'),
      PLACEHOLDER_MASKING: evidence('PROVEN', 'test:placeholder-mask'),
      CONTEXT_MANIFEST_READBACK: evidence('PROVEN', 'receipt:context-readback'),
    });
    expect(receipt.highestReadyStage).toBe('MATRIX_ADMITTED');
  });

  it('requires held-out evaluation and persistence authorization before promotion', () => {
    const receipt = build({
      FEATURE_ARTIFACT_PRESENT: evidence('PROVEN', 'fixture:feature-artifact'),
      INPUT_PROVENANCE: evidence('PROVEN', 'receipt:qualified-input'),
      MISSING_VALUE_POLICY: evidence('PROVEN', 'test:presence-mask'),
      PLACEHOLDER_MASKING: evidence('PROVEN', 'test:placeholder-mask'),
      CONTEXT_MANIFEST_READBACK: evidence('PROVEN', 'receipt:context-readback'),
      PRODUCTION_SCORER_CALLER: evidence('PROVEN', 'source:search-runtime-caller'),
    });
    expect(receipt.highestReadyStage).toBe('SCORER_EXPOSED');
  });

  it('rejects checksum tampering and a legacy storage coordinate', () => {
    const receipt = build();
    expect(isFeaturePromotionReadinessV2({ ...receipt, checksum: `sha256:${'0'.repeat(64)}` })).toBe(false);
    expect(() => build({}, {
        table: 'codebase_chunk_index',
        column: 'content_embedding',
        storageType: 'halfvec(768)',
      } as never)).toThrow();
  });
});
