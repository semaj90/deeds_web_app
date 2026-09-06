import { describe, expect, it } from 'vitest';
import {
  compareRerankShadowV1,
  RERANK_SHADOW_MAX_CANDIDATES,
  type RerankShadowCandidateV1,
} from './rerank-shadow-evaluation-v1.js';

const candidates: RerankShadowCandidateV1[] = [
  { candidateOrdinal: 0, canonicalId: 'c0', packetKey: 'p0', sourceRef: 'src/a.ts', sourceRevision: 'sha256:a', relevanceGrade: 3 },
  { candidateOrdinal: 1, canonicalId: 'c1', packetKey: 'p1', sourceRef: 'src/b.ts', sourceRevision: 'sha256:b', relevanceGrade: 0 },
  { candidateOrdinal: 2, canonicalId: 'c2', packetKey: 'p2', sourceRef: 'src/c.ts', sourceRevision: 'sha256:c', relevanceGrade: 2 },
  { candidateOrdinal: 3, canonicalId: 'c3', packetKey: 'p3', sourceRef: 'src/d.ts', sourceRevision: 'sha256:d', relevanceGrade: 1 },
];

const input = {
  requestId: 'req-shadow-1',
  candidateSnapshotRevision: 'snapshot-1',
  candidates,
  servedCandidateIds: ['c0', 'c2', 'c3', 'c1'],
  baseline: {
    armId: 'mixedbread-crossencoder',
    modelRevision: 'mixedbread:v1',
    orderedCandidateIds: ['c0', 'c2', 'c3', 'c1'],
    latencyMs: 10,
    tokenCount: 128,
  },
  challenger: {
    armId: 'ornith-shadow',
    modelRevision: 'ornith-1.5-9b',
    orderedCandidateIds: ['c2', 'c0', 'c1', 'c3'],
    latencyMs: 30,
    tokenCount: 512,
  },
} as const;

describe('RerankShadowComparisonV1', () => {
  it('produces deterministic identity and ranking evidence without deciding promotion', () => {
    const first = compareRerankShadowV1(input);
    const second = compareRerankShadowV1(input);

    expect(first).toEqual(second);
    expect(first.status).toBe('SHADOW_COMPARISON_PROVEN');
    expect(first.promotionVerdict).toBeNull();
    expect(first.servedOrderIntegrityOk).toBe(true);
    expect(first.identityIntegrityOk).toBe(true);
    expect(first.metrics.labelsAvailable).toBe(true);
    expect(first.metrics.top1Agreement).toBe(false);
    expect(first.metrics.topKOverlapAt10).toBe(1);
    expect(first.resource.latencyDeltaMs).toBe(20);
  });

  it('rejects a challenger that changes the candidate population', () => {
    expect(() => compareRerankShadowV1({
      ...input,
      challenger: { ...input.challenger, orderedCandidateIds: ['c2', 'c0', 'c1', 'unknown'] },
    })).toThrow('RERANK_SHADOW_CHALLENGER_UNKNOWN_CANDIDATE');
  });

  it('rejects duplicate identity and oversized populations', () => {
    expect(() => compareRerankShadowV1({
      ...input,
      candidates: [{ ...candidates[0], canonicalId: candidates[1].canonicalId }, ...candidates.slice(1)],
    })).toThrow('RERANK_SHADOW_DUPLICATE_CANONICAL_ID');

    const oversized = Array.from({ length: RERANK_SHADOW_MAX_CANDIDATES + 1 }, (_, index) => ({
      candidateOrdinal: index,
      canonicalId: `c${index}`,
      packetKey: `p${index}`,
      sourceRef: `src/${index}.ts`,
      sourceRevision: `sha256:${index}`,
    }));
    expect(() => compareRerankShadowV1({
      ...input,
      candidates: oversized,
      servedCandidateIds: oversized.map((candidate) => candidate.canonicalId),
      baseline: { ...input.baseline, orderedCandidateIds: oversized.map((candidate) => candidate.canonicalId) },
      challenger: { ...input.challenger, orderedCandidateIds: oversized.map((candidate) => candidate.canonicalId) },
    })).toThrow(`RERANK_SHADOW_CANDIDATE_LIMIT_EXCEEDED:${RERANK_SHADOW_MAX_CANDIDATES + 1}`);
  });

  it('does not claim quality metrics when reviewed labels are absent', () => {
    const unlabeled = candidates.map(({ relevanceGrade: _relevanceGrade, ...candidate }) => candidate);
    const receipt = compareRerankShadowV1({
      ...input,
      candidates: unlabeled,
    });
    expect(receipt.metrics.labelsAvailable).toBe(false);
    expect(receipt.metrics.baseline.ndcgAt10).toBeNull();
    expect(receipt.metrics.challenger.mrrAt10).toBeNull();
  });
});
