import { describe, expect, it } from 'vitest';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { admitFanoutExecutorResultsV1 } from './fanout-admission-v1.js';

const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const sourceRevisionA = `sha256:${'b'.repeat(64)}`;
const sourceRevisionB = `sha256:${'c'.repeat(64)}`;
const graphRevision = 'd'.repeat(64);
const candidateSnapshotRevision = 'candidate-snapshot:fixture:v1';

function ordinalMap() {
  return materializeCandidateOrdinalMap({
    workspaceRevision,
    candidateSnapshotRevision,
    producerRevision: 'test:fanout-admission:v1',
    candidates: [
      {
        canonicalId: 'canonical:a', packetKey: 'packet:a', treeNodeId: 'tree:a', symbolVersionId: null,
        workspaceRevision, sourceRevision: sourceRevisionA, graphRevision, semanticRevision: 'semantic_768:v1',
        degradedIdentity: false, evidenceRefs: ['evidence:a'],
      },
      {
        canonicalId: 'canonical:b', packetKey: 'packet:b', treeNodeId: 'tree:b', symbolVersionId: null,
        workspaceRevision, sourceRevision: sourceRevisionB, graphRevision, semanticRevision: 'semantic_768:v1',
        degradedIdentity: false, evidenceRefs: ['evidence:b'],
      },
      {
        canonicalId: 'canonical:degraded', packetKey: null, treeNodeId: null, symbolVersionId: null,
        workspaceRevision, sourceRevision: sourceRevisionB, graphRevision, semanticRevision: 'semantic_768:v1',
        degradedIdentity: true, evidenceRefs: ['evidence:degraded'],
      },
    ],
  });
}

function gate(map = ordinalMap()) {
  return {
    revisionOwnerStatus: 'REVISION_OWNER_PROVEN' as const,
    graphRevisionOwnerStatus: 'GRAPH_FANOUT_REVISION_OWNER_PROVEN' as const,
    workspaceRevision,
    graphRevision,
    candidateSnapshotRevision,
    ordinalMapChecksum: map.ordinalMapChecksum,
    qdrantIdentityLineageStatus: 'PROVEN' as const,
    producerRevision: 'test:fanout-gate:v1',
  };
}

function result(overrides: Record<string, unknown> = {}) {
  return {
    executor: 'QDRANT' as const,
    logicalLane: 'SEMANTIC' as const,
    executorResultId: 'qdrant:point:9',
    canonicalId: 'canonical:a',
    identityStatus: 'ADMITTED' as const,
    workspaceRevision,
    sourceRevision: sourceRevisionA,
    graphRevision,
    candidateSnapshotRevision,
    semanticRevision: 'semantic_768:v1',
    score: 0.9,
    evidenceRefs: ['qdrant:receipt:1'],
    ...overrides,
  };
}

describe('FanoutAdmissionV1', () => {
  it('normalizes admitted executor results to the existing CandidateOrdinal without remapping', () => {
    const map = ordinalMap();
    const expected = map.candidates.find((candidate) => candidate.canonicalId === 'canonical:a')!.candidateOrdinal;
    const receipt = admitFanoutExecutorResultsV1({ gate: gate(map), ordinalMap: map, results: [result()] });
    expect(receipt.admitted).toHaveLength(1);
    expect(receipt.admitted[0]!.candidateOrdinal).toBe(expected);
    expect(receipt.admitted[0]!.canonicalId).toBe('canonical:a');
    expect('executorResultId' in receipt.admitted[0]!).toBe(false);
    expect(receipt.executorIdsEscapedAboveBoundary).toBe(false);
    expect(receipt.ordinalRemappingPerformed).toBe(false);
    expect(receipt.rankingMutationPerformed).toBe(false);
    expect(receipt.extraRrfVotesCreated).toBe(false);
    expect(receipt.fanoutAdmissionProven).toBe(true);
  });

  it('rejects degraded retrieval evidence while still admitting the canonical subset', () => {
    const map = ordinalMap();
    const receipt = admitFanoutExecutorResultsV1({
      gate: gate(map), ordinalMap: map,
      results: [
        result(),
        result({ executorResultId: 'qdrant:degraded', canonicalId: 'canonical:degraded', identityStatus: 'DEGRADED', sourceRevision: sourceRevisionB }),
      ],
    });
    expect(receipt.admitted).toHaveLength(1);
    expect(receipt.rejected).toEqual([expect.objectContaining({ canonicalId: 'canonical:degraded', reason: 'IDENTITY_NOT_ADMITTED' })]);
    expect(receipt.fanoutAdmissionProven).toBe(true);
  });

  it('blocks Qdrant fanout when Qdrant identity lineage is not proven without blocking another proven executor', () => {
    const map = ordinalMap();
    const receipt = admitFanoutExecutorResultsV1({
      gate: { ...gate(map), qdrantIdentityLineageStatus: 'DEGRADED' },
      ordinalMap: map,
      results: [
        result(),
        result({ executor: 'CUVS_EXACT', executorResultId: 17 }),
      ],
    });
    expect(receipt.rejected[0]?.reason).toBe('QDRANT_IDENTITY_LINEAGE_NOT_PROVEN');
    expect(receipt.admitted).toEqual([expect.objectContaining({ executor: 'CUVS_EXACT', canonicalId: 'canonical:a' })]);
  });

  it('rejects source, graph, workspace, and candidate snapshot drift', () => {
    const map = ordinalMap();
    const cases = [
      [result({ sourceRevision: sourceRevisionB }), 'SOURCE_REVISION_MISMATCH'],
      [result({ graphRevision: 'e'.repeat(64) }), 'GRAPH_REVISION_MISMATCH'],
      [result({ workspaceRevision: `sha256:${'f'.repeat(64)}` }), 'WORKSPACE_REVISION_MISMATCH'],
      [result({ candidateSnapshotRevision: 'candidate-snapshot:other' }), 'CANDIDATE_SNAPSHOT_REVISION_MISMATCH'],
    ] as const;
    for (const [candidateResult, expectedReason] of cases) {
      const receipt = admitFanoutExecutorResultsV1({ gate: gate(map), ordinalMap: map, results: [candidateResult] });
      expect(receipt.admitted).toHaveLength(0);
      expect(receipt.rejected[0]?.reason).toBe(expectedReason);
      expect(receipt.fanoutAdmissionProven).toBe(false);
    }
  });

  it('rejects executor IDs that attempt to substitute for canonical identity', () => {
    const map = ordinalMap();
    const receipt = admitFanoutExecutorResultsV1({
      gate: gate(map), ordinalMap: map,
      results: [result({ executorResultId: 'canonical:a' })],
    });
    expect(receipt.admitted).toHaveLength(0);
    expect(receipt.rejected[0]?.reason).toBe('EXECUTOR_IDENTITY_SUBSTITUTION');
  });

  it('fails before per-result admission when the ordinal snapshot/checksum does not match the proof gate', () => {
    const map = ordinalMap();
    expect(() => admitFanoutExecutorResultsV1({
      gate: { ...gate(map), ordinalMapChecksum: '0'.repeat(64) }, ordinalMap: map, results: [result()],
    })).toThrow('FANOUT_ORDINAL_MAP_CHECKSUM_MISMATCH');
    expect(() => admitFanoutExecutorResultsV1({
      gate: { ...gate(map), candidateSnapshotRevision: 'candidate-snapshot:other' }, ordinalMap: map, results: [result()],
    })).toThrow('FANOUT_ORDINAL_MAP_SNAPSHOT_REVISION_MISMATCH');
  });

  it('does not accept unproven global revision-owner states', () => {
    const map = ordinalMap();
    expect(() => admitFanoutExecutorResultsV1({
      gate: { ...gate(map), revisionOwnerStatus: 'REVISION_OWNER_READY_FOR_CONTROLLED_CANARY' as never },
      ordinalMap: map, results: [result()],
    })).toThrow();
    expect(() => admitFanoutExecutorResultsV1({
      gate: { ...gate(map), graphRevisionOwnerStatus: 'GRAPH_SNAPSHOT_REVISION_OWNER_NOT_PROVEN' as never },
      ordinalMap: map, results: [result()],
    })).toThrow();
  });
});
