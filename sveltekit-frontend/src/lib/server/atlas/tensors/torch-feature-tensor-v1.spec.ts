// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { buildCandidateFeatureMatrix } from '../../retrieval/retrieval-candidate-feature-matrix-v1.js';
import { CANDIDATE_FEATURE_NAMES } from '../contracts/feature-extraction-v1.js';
import {
  buildTorchFeatureTensorV1,
  validateTorchFeatureTensorArtifactV1,
} from './torch-feature-tensor-v1.js';

function matrix() {
  return buildCandidateFeatureMatrix([
    {
      packet_key: 'packet:a',
      semantic_similarity_768: 0.9,
      lexical_score: 0.7,
      execution_utility: 0.5,
    },
    {
      packet_key: 'packet:b',
      semantic_similarity_768: 0.8,
      exact_symbol_match: 1,
    },
  ]);
}

describe('TorchFeatureTensorV1', () => {
  it('freezes row-major float32 features, uint8 mask, row identity and revision lineage', () => {
    const built = buildTorchFeatureTensorV1({
      matrix: matrix(),
      queryId: 'query:1',
      workspaceRevision: 'workspace:1',
      representationRevision: 'semantic:1',
      featureRevision: 'features:1',
    });

    expect(built.artifact.rowCount).toBe(2);
    expect(built.artifact.columnCount).toBe(25);
    expect(built.artifact.columnNames).toEqual([...CANDIDATE_FEATURE_NAMES]);
    expect(built.artifact.rowKeys).toEqual(['packet:a', 'packet:b']);
    expect(built.artifact.layout).toBe('ROW_MAJOR_CONTIGUOUS');
    expect(built.artifact.dtype).toBe('float32');
    expect(built.artifact.presenceMaskDtype).toBe('uint8');
    expect(built.features).toBeInstanceOf(Float32Array);
    expect(built.presenceMask).toBeInstanceOf(Uint8Array);
    expect(built.artifact.featureBytesSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(built.artifact.presenceMaskBytesSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(built.artifact.evidenceAuthority).toBe(false);
    expect(built.artifact.canonicalOwnerChanged).toBe(false);
  });

  it('is deterministic for identical matrix bytes and lineage', () => {
    const input = {
      matrix: matrix(),
      queryId: 'query:1',
      workspaceRevision: 'workspace:1',
      representationRevision: 'semantic:1',
      featureRevision: 'features:1',
    };
    const a = buildTorchFeatureTensorV1(input);
    const b = buildTorchFeatureTensorV1({ ...input, matrix: matrix() });
    expect(a.artifact).toEqual(b.artifact);
    expect(Array.from(a.features)).toEqual(Array.from(b.features));
  });

  it('rejects a non-canonical feature-column order', () => {
    const built = buildTorchFeatureTensorV1({
      matrix: matrix(), queryId: 'query:1', workspaceRevision: 'workspace:1',
      representationRevision: 'semantic:1', featureRevision: 'features:1',
    });
    const swapped = [...built.artifact.columnNames];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    expect(() => validateTorchFeatureTensorArtifactV1({ ...built.artifact, columnNames: swapped })).toThrow(
      'TORCH_FEATURE_COLUMN_ORDER_MISMATCH:0',
    );
  });

  it('rejects invalid mask/value combinations instead of laundering them into tensor input', () => {
    const broken = matrix();
    broken.presence_mask[0] = 0;
    broken.candidate_features[0] = 0.9;
    expect(() => buildTorchFeatureTensorV1({
      matrix: broken, queryId: 'query:1', workspaceRevision: 'workspace:1',
      representationRevision: 'semantic:1', featureRevision: 'features:1',
    })).toThrow('TORCH_FEATURE_MISSING_VALUE_NOT_ZERO:0');
  });

  it('rejects non-finite tensor values even if a caller bypasses the candidate builder', () => {
    const broken = matrix();
    broken.candidate_features[0] = Number.POSITIVE_INFINITY;
    expect(() => buildTorchFeatureTensorV1({
      matrix: broken, queryId: 'query:1', workspaceRevision: 'workspace:1',
      representationRevision: 'semantic:1', featureRevision: 'features:1',
    })).toThrow('TORCH_FEATURE_NON_FINITE:0');
  });
});
