import { describe, expect, it } from 'vitest';
import { mergeAndRank, type LaneResult } from './multi-lane-retrieval.js';

describe('multi-lane ACE fusion safety', () => {
  it('does not fuse degraded legacy ACE hits', () => {
    const lanes: LaneResult[] = [
      {
        lane: 'ace_cache',
        degraded: true,
        hits: [{ id: 'legacy-only', text: 'legacy', score: 1, lane: 'ace_cache' }],
        latencyMs: 1,
        cacheHit: true,
      },
      {
        lane: 'sparse',
        hits: [{ id: 'current', text: 'current', score: 0.8, lane: 'sparse' }],
        latencyMs: 1,
        cacheHit: false,
      },
    ];

    const merged = mergeAndRank(lanes);
    expect(merged.map((hit) => hit.id)).toEqual(['current']);
  });

  it('still fuses a non-degraded ACE lane', () => {
    const lanes: LaneResult[] = [
      {
        lane: 'ace_cache',
        degraded: false,
        hits: [{ id: 'current-ace', text: 'current', score: 1, lane: 'ace_cache' }],
        latencyMs: 1,
        cacheHit: true,
      },
    ];

    expect(mergeAndRank(lanes).map((hit) => hit.id)).toEqual(['current-ace']);
  });

  it('counts a duplicate executor result once per logical lane', () => {
    const merged = mergeAndRank([{
      lane: 'sparse', hits: [
        { id: 'same', text: 'best', score: 0.9, lane: 'sparse' },
        { id: 'same', text: 'duplicate', score: 0.8, lane: 'sparse' },
      ], latencyMs: 1, cacheHit: false,
    }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].score).toBeCloseTo(0.6 / 61);
  });

  it('uses matching n-ary evidence as a bounded enrichment, never a new hit', () => {
    const base = mergeAndRank([{ lane: 'sparse', hits: [
      { id: 'candidate', text: 'current', score: 1, lane: 'sparse' },
    ], latencyMs: 1, cacheHit: false }]);
    const enriched = mergeAndRank([{ lane: 'sparse', hits: [
      { id: 'candidate', text: 'current', score: 1, lane: 'sparse' },
    ], latencyMs: 1, cacheHit: false }], {
      expectedWorkspaceRevision: 'workspace:r1',
      expectedSourceRevision: 'source:r1',
      expectedQueryRevision: 'query:r1',
      hypergraphEvidence: [{
        candidateId: 'candidate', workspaceRevision: 'workspace:r1', sourceRevision: 'source:r1',
        queryRevision: 'query:r1', relationCount: 1, entityCount: 3, evidenceRefCount: 2,
        structuralScore: 1, projectionHash: 'sha256:projection',
      }],
    });
    expect(enriched).toHaveLength(1);
    expect(enriched[0].score).toBeGreaterThan(base[0].score);
    expect(enriched[0].hypergraphEvidence?.relationCount).toBe(1);
  });

  it('ignores n-ary evidence when any revision does not match', () => {
    const merged = mergeAndRank([{ lane: 'sparse', hits: [
      { id: 'candidate', text: 'current', score: 1, lane: 'sparse' },
    ], latencyMs: 1, cacheHit: false }], {
      expectedWorkspaceRevision: 'workspace:r1', expectedSourceRevision: 'source:r1', expectedQueryRevision: 'query:r1',
      hypergraphEvidence: [{
        candidateId: 'candidate', workspaceRevision: 'workspace:stale', sourceRevision: 'source:r1',
        queryRevision: 'query:r1', relationCount: 2, entityCount: 4, evidenceRefCount: 3,
        structuralScore: 1, projectionHash: 'sha256:stale',
      }],
    });
    expect(merged[0].hypergraphEvidence).toBeUndefined();
  });
});
