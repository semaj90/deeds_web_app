import { describe, expect, it } from 'vitest';
import {
  buildXgboostSidecarFeatureProjectionV1,
  materializeXgboostSidecarFeatureProjectionV1,
} from './xgboost-sidecar-feature-projection-v1.js';
import { XGBOOST_SIDECAR_FEATURES } from './xgboost-sidecar-feature-admission-v1.js';

function manifest() {
  return buildXgboostSidecarFeatureProjectionV1({
    projectionRevision: 'projection:test:v1',
    sourceFeatureRevision: 'source-features:test:v1',
    mappings: XGBOOST_SIDECAR_FEATURES.map((targetName) => ({
      targetName,
      sourceName: `source.${targetName}`,
      derivationRevision: 'derivation:test:v1',
      evidenceRefs: [`evidence:${targetName}`],
    })),
  });
}

describe('XGBoost sidecar feature projection', () => {
  it('materializes an explicit, checksummed projection', () => {
    const projection = manifest();
    const sourceValues = Object.fromEntries(XGBOOST_SIDECAR_FEATURES.map((name) => [`source.${name}`, 0.5]));
    const result = materializeXgboostSidecarFeatureProjectionV1({ manifest: projection, sourceValues });
    expect(result.status).toBe('ADMITTED');
    if (result.status === 'ADMITTED') expect(Object.keys(result.values)).toHaveLength(16);
  });

  it('rejects missing source evidence instead of defaulting to zero', () => {
    const projection = manifest();
    const sourceValues = Object.fromEntries(XGBOOST_SIDECAR_FEATURES
      .slice(0, -1).map((name) => [`source.${name}`, 0.5]));
    expect(materializeXgboostSidecarFeatureProjectionV1({ manifest: projection, sourceValues })).toEqual({
      status: 'REJECTED', reason: 'SOURCE_FEATURE_MISSING:source.trace_score',
    });
  });

  it('rejects a tampered manifest checksum', () => {
    const projection = manifest();
    expect(materializeXgboostSidecarFeatureProjectionV1({
      manifest: { ...projection, projectionChecksum: 'f'.repeat(64) }, sourceValues: {},
    })).toEqual({ status: 'REJECTED', reason: 'PROJECTION_CHECKSUM_MISMATCH' });
  });

  it('rejects the canonical snapshot ABI until an explicit mapping exists', () => {
    const projection = manifest();
    expect(materializeXgboostSidecarFeatureProjectionV1({
      manifest: projection,
      sourceValues: { semanticRelevance: 1, lexicalRelevance: 1 },
    })).toEqual({ status: 'REJECTED', reason: 'SOURCE_FEATURE_MISSING:source.cosine_score' });
  });
});
