import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HypergraphRoutingService } from '$lib/server/retrieval/hypergraph-routing-service.js';

describe('HypergraphRoutingService', () => {
  let service: HypergraphRoutingService;

  beforeEach(() => {
    service = HypergraphRoutingService.getInstance();
    vi.clearAllMocks();
  });

  it('should infer profile from query text', () => {
    const profile = service.inferProfile('tell me about ACE context cache');
    expect(profile).toBeDefined();
    expect(profile?.name).toBe('ace');
  });

  it('should return null for unknown profile', () => {
    const profile = service.inferProfile('something completely different');
    expect(profile).toBeNull();
  });

  it('should build a valid Qdrant filter', () => {
    const routing = {
      clusterIds: [1, 2, 3],
      clusterField: 'gpu_cluster' as const,
      cards: [],
      method: 'test'
    };
    const filter = service.buildFilter(routing);
    expect(filter.must).toBeDefined();
    expect(filter.must[0].key).toBe('gpu_cluster');
    expect(filter.must[0].match.any).toEqual([1, 2, 3]);
  });

  it('should handle routing failure by falling open to priors', async () => {
    // Mock fetch failure
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    
    const embedding = new Array(768).fill(0);
    const result = await service.route(embedding, 'ACE cache');
    
    expect(result.method).toBe('fail-open-priors');
    expect(result.clusterIds).toContain(72); // ACE prior
  });
});
