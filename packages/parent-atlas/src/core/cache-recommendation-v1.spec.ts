import { describe, expect, it } from 'vitest';
import {
  cacheRecommendationV1Schema,
  decideMemoryActionV1,
  type MemoryAction,
  type MemoryBlockStateV1,
} from './cache-recommendation-v1.js';

const block = (o: Partial<MemoryBlockStateV1> = {}): MemoryBlockStateV1 => ({
  materializationId: 'mat:1', canonicalId: 'pk:1', sourceRevision: 'src:1', representationRevision: 'rep:1',
  residentBytes: 1000, predictedReuse: 0.99, estimatedRecomputeMs: 500, currentlyLeased: false,
  tier: 'CPU', recomputable: true, ...o,
});
const decide = (advisoryAction: MemoryAction, b = block(), gpuAdmissibleBytes = 1_000_000) =>
  decideMemoryActionV1({ block: b, currentSourceRevision: 'src:1', currentRepresentationRevision: 'rep:1', gpuAdmissibleBytes, advisoryAction });

describe('decideMemoryActionV1 guards', () => {
  it('accepts the advisory action when every guard passes', () => {
    const r = decide('PROMOTE_GPU');
    expect(r.action).toBe('PROMOTE_GPU');
    expect(r.servable).toBe(true);
    expect(r.canonicalAuthority).toBe(false);
  });

  it('stale source revision overrides a high-reuse prefetch/promote score', () => {
    const r = decide('PROMOTE_GPU', block({ sourceRevision: 'src:0' }));
    expect(r.action).toBe('REJECT_STALE');
    expect(r.servable).toBe(false);
    expect(r.reasonCodes).toContain('STALE_REVISION');
  });

  it('stale representation revision is rejected too', () => {
    expect(decide('KEEP_RESIDENT', block({ representationRevision: 'rep:0' })).action).toBe('REJECT_STALE');
  });

  it('stale but leased waits for the lease instead of evicting', () => {
    const r = decide('EVICT_RECOMPUTABLE', block({ sourceRevision: 'src:0', currentlyLeased: true }));
    expect(r.action).toBe('WAIT_FOR_LEASE');
    expect(r.servable).toBe(false);
    expect(r.reasonCodes).toEqual(expect.arrayContaining(['STALE_REVISION', 'LEASE_PROTECTED']));
  });

  it('active lease blocks demotion and eviction recommendations', () => {
    for (const a of ['DEMOTE_CPU', 'EVICT_RECOMPUTABLE'] as const) {
      const r = decide(a, block({ currentlyLeased: true }));
      expect(r.action).toBe('KEEP_RESIDENT');
      expect(r.advisoryAction).toBe(a);
      expect(r.reasonCodes).toContain('LEASE_PROTECTED');
    }
  });

  it('GPU promotion over the admissible budget is downgraded, never forced', () => {
    expect(decide('PROMOTE_GPU', block({ tier: 'NONE', residentBytes: 10 }), 5).action).toBe('PREFETCH_CPU');
    expect(decide('PROMOTE_GPU', block({ tier: 'CPU', residentBytes: 10 }), 5).action).toBe('KEEP_RESIDENT');
  });

  it('only recomputable blocks may be evicted', () => {
    expect(decide('EVICT_RECOMPUTABLE', block({ recomputable: false })).reasonCodes).toContain('NOT_RECOMPUTABLE');
    expect(decide('EVICT_RECOMPUTABLE', block({ recomputable: true })).action).toBe('EVICT_RECOMPUTABLE');
  });

  it('schema refuses canonical authority', () => {
    const r = decide('KEEP_RESIDENT');
    expect(() => cacheRecommendationV1Schema.parse({ ...r, canonicalAuthority: true })).toThrow();
  });
});
