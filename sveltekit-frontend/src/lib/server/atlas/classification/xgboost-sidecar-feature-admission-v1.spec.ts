import { describe, expect, it } from 'vitest';
import {
  admitXgboostSidecarFeatureBundleV1,
  XGBOOST_SIDECAR_FEATURES,
  xgboostSidecarFeatureSchemaRevision,
} from './xgboost-sidecar-feature-admission-v1.js';

const base = {
  schema: 'atlas.xgboost-sidecar-feature-admission.v1' as const,
  candidateSnapshotRevision: 'snapshot:v1',
  ordinalMapChecksum: 'a'.repeat(64),
  workspaceRevision: 'workspace:v1',
  featureRevision: 'feature:v1',
  featureSchemaRevision: xgboostSidecarFeatureSchemaRevision(),
  featureNames: [...XGBOOST_SIDECAR_FEATURES],
  rowCount: 2,
  featureValuesChecksum: 'b'.repeat(64),
};

const sidecar = {
  modelRevision: 'sha256:model',
  featureSchemaRevision: xgboostSidecarFeatureSchemaRevision(),
  featureNames: [...XGBOOST_SIDECAR_FEATURES],
};

describe('XGBoost sidecar feature admission', () => {
  it('admits an exact ordered ABI match', () => {
    expect(admitXgboostSidecarFeatureBundleV1({ sidecar, bundle: base })).toEqual({
      status: 'ADMITTED',
      featureSchemaRevision: sidecar.featureSchemaRevision,
      featureNames: [...XGBOOST_SIDECAR_FEATURES],
    });
  });

  it('rejects a static sidecar schema with an incorrect checksum', () => {
    expect(admitXgboostSidecarFeatureBundleV1({
      sidecar: { ...sidecar, featureSchemaRevision: 'wrong' }, bundle: base,
    })).toEqual({ status: 'REJECTED', reason: 'SIDECAR_FEATURE_SCHEMA_CHECKSUM_MISMATCH' });
  });

  it('rejects a bundle with a different feature revision', () => {
    expect(admitXgboostSidecarFeatureBundleV1({
      sidecar, bundle: { ...base, featureSchemaRevision: 'different' },
    })).toEqual({ status: 'REJECTED', reason: 'FEATURE_SCHEMA_REVISION_MISMATCH' });
  });

  it('rejects a reordered or differently named feature ABI', () => {
    expect(admitXgboostSidecarFeatureBundleV1({
      sidecar, bundle: { ...base, featureNames: ['wrong', ...base.featureNames.slice(1)] },
    })).toEqual({ status: 'REJECTED', reason: 'FEATURE_COLUMN_ORDER_MISMATCH' });
  });

  it('rejects missing bundle provenance instead of inventing it', () => {
    const { featureSchemaRevision: _ignored, ...missing } = base;
    expect(admitXgboostSidecarFeatureBundleV1({ sidecar, bundle: missing })).toEqual({
      status: 'REJECTED', reason: 'FEATURE_BUNDLE_INVALID',
    });
  });
});
