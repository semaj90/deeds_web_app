import { describe, expect, it } from 'vitest';
import { candidateFeatureSnapshotChecksum } from '../features/candidate-feature-snapshot-v1.js';
import { CANDIDATE_SCALAR_FEATURES } from '../features/candidate-feature-columnar-v1.js';
import {
  buildXgboostFeatureProjectionV2,
  materializeXgboostFeatureProjectionV2,
} from './xgboost-feature-projection-v2.js';

function snapshot(overrides: Record<string, unknown> = {}) {
  const row: Record<string, unknown> = {
    schema: 'atlas.candidate-feature-row.v1',
    candidateOrdinal: 0,
    canonicalId: 'candidate:0',
    packetKey: 'packet:0',
    sourceRef: 'src/0.ts',
    treeNodeId: null,
    symbolVersionId: null,
    workspaceRevision: 'workspace:1',
    sourceRevision: 'source:1',
    graphRevision: 'graph:1',
    semanticRevision: 'semantic:1',
    featureRevision: 'features:1',
    representationBindings: [],
    crossEncoderAvailable: true,
    laneMask: ['semantic'],
    degradedIdentity: false,
    evidenceRefs: ['evidence:0'],
  };
  for (const feature of CANDIDATE_SCALAR_FEATURES) row[feature] = 0.5;
  Object.assign(row, overrides);
  const payload = {
    candidateSnapshotRevision: 'snapshot:1',
    ordinalMapChecksum: 'a'.repeat(64),
    workspaceRevision: 'workspace:1',
    featureRevision: 'features:1',
    rows: [row],
  };
  return {
    schema: 'atlas.candidate-feature-snapshot.v1',
    ...payload,
    rowCount: 1,
    snapshotChecksum: candidateFeatureSnapshotChecksum(payload),
    identityAuthority: false,
    canonicalOwnerChanged: false,
    producerRevision: 'producer:1',
  };
}

function manifest() {
  return buildXgboostFeatureProjectionV2({
    projectionRevision: 'projection:v2',
    sourceFeatureRevision: 'features:1',
    modelAbiRevision: 'model-abi:v2',
    mappings: CANDIDATE_SCALAR_FEATURES.map((sourceName) => ({
      targetName: sourceName,
      sourceName,
      derivationRevision: 'derivation:v1',
      evidenceRefs: [`evidence:${sourceName}`],
      nullPolicy: 'REJECT' as const,
    })),
  });
}

describe('XGBoost feature projection V2', () => {
  it('materializes the typed candidate ABI without legacy aliases', () => {
    const result = materializeXgboostFeatureProjectionV2({ manifest: manifest(), snapshot: snapshot() });
    expect(result.status).toBe('ADMITTED');
    if (result.status === 'ADMITTED') {
      expect(result.featureNames).toEqual([...CANDIDATE_SCALAR_FEATURES]);
      expect(result.rows[0]?.sourceRef).toBe('src/0.ts');
      expect(result.rows[0]?.values).toHaveLength(CANDIDATE_SCALAR_FEATURES.length);
    }
  });

  it('rejects null feature evidence instead of defaulting to zero', () => {
    const result = materializeXgboostFeatureProjectionV2({
      manifest: manifest(),
      snapshot: snapshot({ semanticRelevance: null }),
    });
    expect(result).toEqual({ status: 'REJECTED', reason: 'FEATURE_VALUE_MISSING:0:semanticRelevance' });
  });

  it('rejects missing source identity before model input is produced', () => {
    const result = materializeXgboostFeatureProjectionV2({
      manifest: manifest(),
      snapshot: snapshot({ sourceRef: null }),
    });
    expect(result).toEqual({ status: 'REJECTED', reason: 'SOURCE_REF_MISSING:0' });
  });

});
