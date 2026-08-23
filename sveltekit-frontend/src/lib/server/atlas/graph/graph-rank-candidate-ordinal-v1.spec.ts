import { describe, expect, it } from 'vitest';

import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { CandidateFeatureRowV1Schema } from '../features/candidate-feature-row-v1.js';
import {
  adaptAtlasRapidsPageRankReceiptToCandidateOrdinals,
  applyGraphRankHitsToCandidateFeatureRows,
  normalizeGraphRankExecutorHitsToCandidateOrdinals,
} from './graph-rank-candidate-ordinal-v1.js';

function ordinalMap() {
  return materializeCandidateOrdinalMap({
    candidateSnapshotRevision: 'candidate:s1',
    workspaceRevision: 'workspace:w1',
    producerRevision: 'candidate-map:test',
    candidates: [
      {
        canonicalId: 'canonical:a',
        packetKey: 'packet:a',
        treeNodeId: 'tree:a',
        symbolVersionId: 'symbol:a',
        workspaceRevision: 'workspace:w1',
        sourceRevision: 'source:a1',
        graphRevision: 'graph:g1',
        semanticRevision: 'semantic:s1',
        degradedIdentity: false,
        evidenceRefs: [],
      },
      {
        canonicalId: 'canonical:b',
        packetKey: 'packet:b',
        treeNodeId: 'tree:b',
        symbolVersionId: 'symbol:b',
        workspaceRevision: 'workspace:w1',
        sourceRevision: 'source:b1',
        graphRevision: 'graph:g1',
        semanticRevision: 'semantic:s1',
        degradedIdentity: false,
        evidenceRefs: [],
      },
    ],
  });
}

function rows() {
  const map = ordinalMap();
  return map.candidates.map((candidate) => CandidateFeatureRowV1Schema.parse({
    schema: 'atlas.candidate-feature-row.v1',
    candidateOrdinal: candidate.candidateOrdinal,
    canonicalId: candidate.canonicalId,
    packetKey: candidate.packetKey,
    treeNodeId: candidate.treeNodeId,
    symbolVersionId: candidate.symbolVersionId,
    workspaceRevision: candidate.workspaceRevision,
    sourceRevision: candidate.sourceRevision,
    graphRevision: candidate.graphRevision,
    semanticRevision: candidate.semanticRevision,
    featureRevision: 'feature:f1',
    semanticRelevance: null,
    lexicalRelevance: null,
    astAffinity: null,
    graphAuthority: null,
    personalizedPageRank: null,
    communityAffinity: null,
    manifold4OrientationSimilarity: null,
    crossEncoderRawScore: null,
    crossEncoderCalibratedScore: null,
    crossEncoderAvailable: false,
    domainAffinity: null,
    executionUtility: null,
    memoryUtility: null,
    laneMask: [],
    degradedIdentity: false,
    evidenceRefs: [],
  }));
}

describe('graph rank CandidateOrdinal boundary', () => {
  it('normalizes cuGraph PageRank receipt by packetKey and discards gpuNodeId', () => {
    const map = ordinalMap();
    const normalized = adaptAtlasRapidsPageRankReceiptToCandidateOrdinals({
      ordinalMap: map,
      producerRevision: 'graph-rank-adapter:test',
      receipt: {
        schema: 'atlas.graph-pagerank-receipt.v1',
        operation: 'pagerank',
        backend: 'cugraph.pagerank',
        algorithmRevision: 'cugraph:pagerank:v1',
        graphRevision: 'graph:g1',
        projectionRevision: 'projection:p1',
        nodeTableHash: 'node-hash',
        edgeTableHash: 'edge-hash',
        seedChecksum: 'seed-hash',
        seedCount: 0,
        candidateFilterCount: 2,
        alpha: 0.85,
        tol: 1e-6,
        maxIter: 100,
        didConverge: true,
        precomputedOutWeight: true,
        cacheHit: false,
        nodeCount: 2,
        edgeCount: 1,
        results: [
          { rank: 1, gpuNodeId: 9001, nodeKey: 'gpu-local-a', packetKey: 'packet:a', score: 0.7 },
          { rank: 2, gpuNodeId: 9002, nodeKey: 'gpu-local-b', packetKey: 'packet:b', score: 0.3 },
        ],
        timings: { kernelMs: 1, resultSelectMs: 1 },
      },
    });

    expect(normalized.hits.map((hit) => hit.candidateOrdinal)).toEqual([0, 1]);
    expect(normalized.hits.map((hit) => hit.score)).toEqual([0.7, 0.3]);
    expect(normalized.hits.every((hit) => hit.executorIdentityEscaped === false)).toBe(true);
    expect(normalized.receipt.rejectedHitCount).toBe(0);
    expect(JSON.stringify(normalized.hits)).not.toContain('9001');
  });

  it('rejects executor-local-only identity instead of treating node ids as canonical', () => {
    const normalized = normalizeGraphRankExecutorHitsToCandidateOrdinals({
      ordinalMap: ordinalMap(),
      executor: 'NETWORKX_PAGERANK',
      metric: 'GLOBAL_PAGERANK',
      graphRevision: 'graph:g1',
      projectionRevision: 'projection:p1',
      algorithmRevision: 'networkx:pagerank:oracle-v1',
      producerRevision: 'graph-rank-adapter:test',
      hits: [{ score: 1, rank: 1, nodeKey: 'canonical:a', executorLocalId: 'canonical:a' }],
    });

    expect(normalized.hits).toEqual([]);
    expect(normalized.receipt.rejectedHitCount).toBe(1);
  });

  it('requires graph revision parity with the frozen candidate world', () => {
    const normalized = normalizeGraphRankExecutorHitsToCandidateOrdinals({
      ordinalMap: ordinalMap(),
      executor: 'CUSTOM_PAGERANK',
      metric: 'GLOBAL_PAGERANK',
      graphRevision: 'graph:wrong',
      projectionRevision: 'projection:p1',
      algorithmRevision: 'custom:pagerank:v1',
      producerRevision: 'graph-rank-adapter:test',
      hits: [{ score: 1, rank: 1, packetKey: 'packet:a' }],
    });

    expect(normalized.hits).toEqual([]);
    expect(normalized.receipt.rejectedHitCount).toBe(1);
  });

  it('writes one selected graph producer into the existing candidate feature row', () => {
    const map = ordinalMap();
    const normalized = normalizeGraphRankExecutorHitsToCandidateOrdinals({
      ordinalMap: map,
      executor: 'NETWORKX_PAGERANK',
      metric: 'GLOBAL_PAGERANK',
      graphRevision: 'graph:g1',
      projectionRevision: 'projection:p1',
      algorithmRevision: 'networkx:pagerank:oracle-v1',
      producerRevision: 'graph-rank-adapter:test',
      hits: [
        { score: 0.8, rank: 1, packetKey: 'packet:a' },
        { score: 0.2, rank: 2, packetKey: 'packet:b' },
      ],
    });

    const updated = applyGraphRankHitsToCandidateFeatureRows({
      ordinalMap: map,
      rows: rows(),
      hits: normalized.hits,
      outputFeatureRevision: 'feature:f2',
      evidenceRef: 'receipt:networkx-pagerank-test',
    });

    expect(updated.map((row) => row.graphAuthority)).toEqual([0.8, 0.2]);
    expect(updated.every((row) => row.laneMask.includes('graph'))).toBe(true);
    expect(updated.every((row) => row.featureRevision === 'feature:f2')).toBe(true);
  });

  it('rejects mixing PageRank executors as independent votes', () => {
    const map = ordinalMap();
    const left = normalizeGraphRankExecutorHitsToCandidateOrdinals({
      ordinalMap: map,
      executor: 'NETWORKX_PAGERANK',
      metric: 'GLOBAL_PAGERANK',
      graphRevision: 'graph:g1',
      projectionRevision: 'projection:p1',
      algorithmRevision: 'networkx:v1',
      producerRevision: 'test',
      hits: [{ score: 0.8, rank: 1, packetKey: 'packet:a' }],
    }).hits[0]!;
    const right = normalizeGraphRankExecutorHitsToCandidateOrdinals({
      ordinalMap: map,
      executor: 'CUGRAPH_PAGERANK',
      metric: 'GLOBAL_PAGERANK',
      graphRevision: 'graph:g1',
      projectionRevision: 'projection:p1',
      algorithmRevision: 'cugraph:v1',
      producerRevision: 'test',
      hits: [{ score: 0.8, rank: 1, packetKey: 'packet:b' }],
    }).hits[0]!;

    expect(() => applyGraphRankHitsToCandidateFeatureRows({
      ordinalMap: map,
      rows: rows(),
      hits: [left, right],
      outputFeatureRevision: 'feature:f2',
      evidenceRef: 'receipt:mixed',
    })).toThrow('GRAPH_RANK_MULTIPLE_PRODUCERS_REJECTED');
  });
});
