import { describe, expect, it } from 'vitest';

import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { normalizeDenseExecutorHitsToCandidateOrdinals } from './dense-executor-candidate-ordinal-v1.js';

function mapFixture() {
  return materializeCandidateOrdinalMap({
    candidateSnapshotRevision: 'candidate-snapshot:test:v1',
    workspaceRevision: 'workspace:test:v1',
    producerRevision: 'ordinal-map:test:v1',
    candidates: [
      {
        canonicalId: 'canonical:a',
        packetKey: 'packet:a',
        treeNodeId: 'tree:a',
        symbolVersionId: 'symbol:a',
        workspaceRevision: 'workspace:test:v1',
        sourceRevision: 'source:a',
        graphRevision: 'graph:test:v1',
        semanticRevision: 'semantic_768:test:v1',
        degradedIdentity: false,
        evidenceRefs: ['evidence:a'],
      },
      {
        canonicalId: 'canonical:b',
        packetKey: 'packet:b',
        treeNodeId: 'tree:b',
        symbolVersionId: 'symbol:b',
        workspaceRevision: 'workspace:test:v1',
        sourceRevision: 'source:b',
        graphRevision: 'graph:test:v1',
        semanticRevision: 'semantic_768:test:v1',
        degradedIdentity: false,
        evidenceRefs: ['evidence:b'],
      },
    ],
  });
}

describe('dense executor CandidateOrdinal normalization', () => {
  it('resolves strong identity to existing ordinals without exposing executor IDs', () => {
    const map = mapFixture();
    const result = normalizeDenseExecutorHitsToCandidateOrdinals({
      ordinalMap: map,
      producerRevision: 'fanout-normalize:test:v1',
      hits: [
        {
          executor: 'QDRANT',
          score: 0.91,
          rank: 1,
          canonicalId: 'canonical:b',
          qdrantPointId: 'qdrant-local-991',
        },
        {
          executor: 'CAGRA',
          score: 0.82,
          rank: 2,
          packetKey: 'packet:a',
          executorLocalId: 77,
        },
      ],
    });

    expect(result.hits.map((hit) => ({ ordinal: hit.candidateOrdinal, rank: hit.rank, score: hit.score }))).toEqual([
      { ordinal: 1, rank: 1, score: 0.91 },
      { ordinal: 0, rank: 2, score: 0.82 },
    ]);
    expect(result.hits.every((hit) => hit.executorIdentityEscaped === false)).toBe(true);
    expect(result.receipt).toMatchObject({
      inputHitCount: 2,
      outputHitCount: 2,
      rejectedHitCount: 0,
      executorIdsEscapedAboveBoundary: false,
      ordinalRemappingPerformed: false,
      rankingMutationPerformed: false,
      canonicalWritesAttempted: false,
    });
    expect(JSON.stringify(result)).not.toContain('qdrant-local-991');
  });

  it('accepts a direct CandidateOrdinal only when corroborating identity matches the frozen map', () => {
    const map = mapFixture();
    const result = normalizeDenseExecutorHitsToCandidateOrdinals({
      ordinalMap: map,
      producerRevision: 'fanout-normalize:test:v1',
      hits: [
        {
          executor: 'TURBOVEC',
          score: 0.9,
          rank: 1,
          candidateOrdinal: 0,
          canonicalId: 'canonical:a',
          executorLocalId: 'external-id:0',
        },
        {
          executor: 'CUVS_EXACT',
          score: 0.8,
          rank: 2,
          candidateOrdinal: 0,
          canonicalId: 'canonical:b',
          executorLocalId: 0,
        },
      ],
    });

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]?.candidateOrdinal).toBe(0);
    expect(result.receipt.rejectedHitCount).toBe(1);
  });

  it('rejects executor-local IDs when no canonical/ordinal evidence exists', () => {
    const map = mapFixture();
    const result = normalizeDenseExecutorHitsToCandidateOrdinals({
      ordinalMap: map,
      producerRevision: 'fanout-normalize:test:v1',
      hits: [{ executor: 'QDRANT', score: 1, rank: 1, qdrantPointId: 1234 }],
    });

    expect(result.hits).toEqual([]);
    expect(result.receipt.rejectedHitCount).toBe(1);
  });

  it('deduplicates the same logical ordinal within one executor result set instead of creating vote inflation', () => {
    const map = mapFixture();
    const result = normalizeDenseExecutorHitsToCandidateOrdinals({
      ordinalMap: map,
      producerRevision: 'fanout-normalize:test:v1',
      hits: [
        { executor: 'QDRANT', score: 0.95, rank: 1, canonicalId: 'canonical:a' },
        { executor: 'QDRANT', score: 0.93, rank: 2, packetKey: 'packet:a' },
      ],
    });

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]).toMatchObject({ candidateOrdinal: 0, rank: 1, score: 0.95 });
    expect(result.receipt).toMatchObject({ inputHitCount: 2, outputHitCount: 1, rejectedHitCount: 1 });
  });

  it('does not reorder accepted hits or rewrite executor scores/ranks', () => {
    const map = mapFixture();
    const result = normalizeDenseExecutorHitsToCandidateOrdinals({
      ordinalMap: map,
      producerRevision: 'fanout-normalize:test:v1',
      hits: [
        { executor: 'CAGRA', score: -0.2, rank: 7, canonicalId: 'canonical:b' },
        { executor: 'CAGRA', score: 12.5, rank: 3, canonicalId: 'canonical:a' },
      ],
    });

    expect(result.hits.map(({ candidateOrdinal, score, rank }) => ({ candidateOrdinal, score, rank }))).toEqual([
      { candidateOrdinal: 1, score: -0.2, rank: 7 },
      { candidateOrdinal: 0, score: 12.5, rank: 3 },
    ]);
    expect(result.receipt.rankingMutationPerformed).toBe(false);
  });
});
