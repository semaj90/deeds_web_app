import { describe, expect, it } from 'vitest';

import { materializeCandidateOrdinalMap } from './canonical-candidate-v1.js';
import { materializeCandidateFeatureSnapshot } from './candidate-feature-snapshot-v1.js';
import { materializeCandidateFeatureColumnar } from './candidate-feature-columnar-v1.js';
import {
  computeGpuPhysicalRows,
  featureCellIndex,
  gatherCandidateFeatureGpuRows,
  materializeCandidateFeatureGpuPack,
} from './candidate-feature-gpu-pack-v1.js';
import { verifyCandidateFeatureGpuParity } from './candidate-feature-gpu-parity-v1.js';

function fixture() {
  const ordinalMap = materializeCandidateOrdinalMap({
    candidateSnapshotRevision: 'candidate-snapshot:gpu-pack:v1',
    workspaceRevision: 'workspace:gpu-pack:v1',
    producerRevision: 'gpu-pack-test:v1',
    candidates: [
      {
        canonicalId: 'candidate:c', packetKey: 'packet:c', treeNodeId: 'tree:c', symbolVersionId: 'symbol:c',
        workspaceRevision: 'workspace:gpu-pack:v1', sourceRevision: 'source:c:v1', graphRevision: 'graph:v1', semanticRevision: 'semantic:768:v1', degradedIdentity: false, evidenceRefs: ['e:c'],
      },
      {
        canonicalId: 'candidate:a', packetKey: 'packet:a', treeNodeId: 'tree:a', symbolVersionId: 'symbol:a',
        workspaceRevision: 'workspace:gpu-pack:v1', sourceRevision: 'source:a:v1', graphRevision: 'graph:v1', semanticRevision: 'semantic:768:v1', degradedIdentity: false, evidenceRefs: ['e:a'],
      },
      {
        canonicalId: 'candidate:b', packetKey: 'packet:b', treeNodeId: 'tree:b', symbolVersionId: 'symbol:b',
        workspaceRevision: 'workspace:gpu-pack:v1', sourceRevision: 'source:b:v1', graphRevision: 'graph:v1', semanticRevision: 'semantic:768:v1', degradedIdentity: true, evidenceRefs: ['e:b'],
      },
    ],
  });

  const byId = new Map(ordinalMap.rows.map((row) => [row.canonicalId, row.candidateOrdinal]));
  const row = (canonicalId: 'candidate:a' | 'candidate:b' | 'candidate:c', values: Record<string, number | null>, lanes: Array<'semantic' | 'lexical' | 'ast' | 'graph' | 'domain' | 'memory'>, degradedIdentity = false) => {
    const ordinal = byId.get(canonicalId)!;
    const suffix = canonicalId.at(-1)!;
    return {
      schema: 'atlas.candidate-feature-row.v1' as const,
      candidateOrdinal: ordinal,
      canonicalId,
      packetKey: `packet:${suffix}`,
      treeNodeId: `tree:${suffix}`,
      symbolVersionId: `symbol:${suffix}`,
      workspaceRevision: 'workspace:gpu-pack:v1',
      sourceRevision: `source:${suffix}:v1`,
      graphRevision: 'graph:v1',
      semanticRevision: 'semantic:768:v1',
      featureRevision: 'features:gpu-pack:v1',
      semanticRelevance: values.semanticRelevance ?? null,
      lexicalRelevance: values.lexicalRelevance ?? null,
      astAffinity: values.astAffinity ?? null,
      graphAuthority: values.graphAuthority ?? null,
      personalizedPageRank: null,
      communityAffinity: null,
      manifold4OrientationSimilarity: null,
      crossEncoderRawScore: null,
      crossEncoderCalibratedScore: null,
      crossEncoderAvailable: false,
      domainAffinity: values.domainAffinity ?? null,
      executionUtility: null,
      memoryUtility: values.memoryUtility ?? null,
      laneMask: lanes,
      degradedIdentity,
      evidenceRefs: [`e:${suffix}`],
    };
  };

  const snapshot = materializeCandidateFeatureSnapshot({
    ordinalMap,
    featureRevision: 'features:gpu-pack:v1',
    producerRevision: 'gpu-pack-test:v1',
    rows: [
      row('candidate:c', { semanticRelevance: 0.25, lexicalRelevance: 0 }, ['semantic', 'lexical']),
      row('candidate:a', { semanticRelevance: 1, astAffinity: 0.75, memoryUtility: 0 }, ['semantic', 'ast', 'memory']),
      row('candidate:b', { semanticRelevance: 0.5, graphAuthority: 0.4, domainAffinity: 0.2 }, ['semantic', 'graph', 'domain'], true),
    ],
  });

  return materializeCandidateFeatureColumnar({ snapshot, producerRevision: 'gpu-pack-test:v1' });
}

describe('CandidateFeatureGpuPackV1', () => {
  it('pads only physical rows and preserves the logical ordinal prefix', () => {
    const columnar = fixture();
    const pack = materializeCandidateFeatureGpuPack({ columnar, rowAlignment: 4, producerRevision: 'gpu-pack-test:v1' });

    expect(pack.logicalRows).toBe(3);
    expect(pack.physicalRows).toBe(4);
    expect(pack.paddingRows).toBe(1);
    expect(pack.validMask).toEqual([1, 1, 1, 0]);
    expect(pack.paddedRowsCarryIdentity).toBe(false);
    expect(pack.gpuResident).toBe(false);

    const paddedBase = 3 * pack.featureCount;
    expect(pack.featureValues.slice(paddedBase)).toEqual(Array(pack.featureCount).fill(0));
    expect(pack.featurePresence.slice(paddedBase)).toEqual(Array(pack.featureCount).fill(0));
    expect(pack.laneMaskU16[3]).toBe(0);
    expect(pack.degradedIdentity[3]).toBe(0);
  });

  it('keeps a missing zero distinct from a real zero after physical packing', () => {
    const columnar = fixture();
    const pack = materializeCandidateFeatureGpuPack({ columnar, rowAlignment: 4, producerRevision: 'gpu-pack-test:v1' });

    const missingLexical = featureCellIndex(0, 'lexicalRelevance'); // candidate:a after canonical sort
    const realMemoryZero = featureCellIndex(0, 'memoryUtility');
    expect(pack.featureValues[missingLexical]).toBe(0);
    expect(pack.featurePresence[missingLexical]).toBe(0);
    expect(pack.featureValues[realMemoryZero]).toBe(0);
    expect(pack.featurePresence[realMemoryZero]).toBe(1);
  });

  it('gathers arbitrary logical ordinals without admitting padded rows', () => {
    const columnar = fixture();
    const pack = materializeCandidateFeatureGpuPack({ columnar, rowAlignment: 4, producerRevision: 'gpu-pack-test:v1' });
    const gather = gatherCandidateFeatureGpuRows({ pack, selectedOrdinals: [2, 0], producerRevision: 'gpu-pack-test:v1' });

    expect(gather.selectedOrdinals).toEqual([2, 0]);
    expect(gather.selectedRowCount).toBe(2);
    expect(gather.featureValues.length).toBe(2 * pack.featureCount);
    expect(() => gatherCandidateFeatureGpuRows({ pack, selectedOrdinals: [3], producerRevision: 'gpu-pack-test:v1' })).toThrow('FEATURE_GPU_GATHER_ORDINAL_OUT_OF_RANGE:3');
    expect(() => gatherCandidateFeatureGpuRows({ pack, selectedOrdinals: [1, 1], producerRevision: 'gpu-pack-test:v1' })).toThrow('FEATURE_GPU_GATHER_DUPLICATE_ORDINAL');
  });

  it('emits deterministic CPU packing parity without claiming CUDA execution', () => {
    const columnar = fixture();
    const first = materializeCandidateFeatureGpuPack({ columnar, rowAlignment: 4, producerRevision: 'gpu-pack-test:v1' });
    const second = materializeCandidateFeatureGpuPack({ columnar, rowAlignment: 4, producerRevision: 'gpu-pack-test:v1' });
    expect(first.gpuPackChecksum).toBe(second.gpuPackChecksum);

    const gather = gatherCandidateFeatureGpuRows({ pack: first, selectedOrdinals: [2, 0], producerRevision: 'gpu-pack-test:v1' });
    const receipt = verifyCandidateFeatureGpuParity({ columnar, pack: first, gather, producerRevision: 'gpu-pack-test:v1' });
    expect(receipt.challenger).toBe('CPU_PACK_REFERENCE');
    expect(receipt.gpuExecutionObserved).toBe(false);
    expect(receipt.maxAbsFeatureDelta).toBe(0);
    expect(receipt.paddingMaskParity).toBe(true);
    expect(receipt.paddingZeroParity).toBe(true);
  });

  it('rejects a CUDA label without actual GPU execution and any observed feature drift', () => {
    const columnar = fixture();
    const pack = materializeCandidateFeatureGpuPack({ columnar, rowAlignment: 4, producerRevision: 'gpu-pack-test:v1' });
    const gather = gatherCandidateFeatureGpuRows({ pack, selectedOrdinals: [2, 0], producerRevision: 'gpu-pack-test:v1' });

    expect(() => verifyCandidateFeatureGpuParity({
      columnar, pack, gather, challenger: 'PYTORCH_CUDA', gpuExecutionObserved: false, producerRevision: 'gpu-pack-test:v1',
    })).toThrow('FEATURE_GPU_PARITY_CHALLENGER_REQUIRES_GPU_EXECUTION_OBSERVATION');

    const drifted = [...gather.featureValues];
    drifted[0] = (drifted[0] ?? 0) + 0.001;
    expect(() => verifyCandidateFeatureGpuParity({
      columnar, pack, gather, observedFeatureValues: drifted, producerRevision: 'gpu-pack-test:v1',
    })).toThrow('FEATURE_GPU_PARITY_VALUE_MISMATCH');
  });

  it('validates alignment as a bounded power of two', () => {
    expect(computeGpuPhysicalRows(33, 32)).toBe(64);
    expect(computeGpuPhysicalRows(0, 32)).toBe(0);
    expect(() => computeGpuPhysicalRows(3, 3)).toThrow('FEATURE_GPU_PACK_ROW_ALIGNMENT_INVALID:3');
  });
});
