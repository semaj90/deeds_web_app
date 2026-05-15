import { describe, it, expect } from 'vitest';
import { QueryProfileRouter } from '../../src/lib/server/retrieval/query-profile-router.js';

describe('QueryProfileRouter', () => {
  it('should route Redis queries to ace_cache profile', () => {
    const profile = QueryProfileRouter.route('How do I clear the Redis cache for ACE?');
    expect(profile).toBe('ace_cache');
    const priors = QueryProfileRouter.getPriors(profile);
    expect(priors).toContain(72);
    expect(priors).toContain(94);
  });

  it('should route legal queries to legal_analysis profile', () => {
    const profile = QueryProfileRouter.route('Find statutes regarding evidence upload.');
    expect(profile).toBe('legal_analysis');
    const priors = QueryProfileRouter.getPriors(profile);
    expect(priors).toContain(47);
  });

  it('should route GPU queries to gpu_topology profile', () => {
    const profile = QueryProfileRouter.route('What is the current WebGPU manifold state?');
    expect(profile).toBe('gpu_topology');
    const priors = QueryProfileRouter.getPriors(profile);
    expect(priors).toContain(20);
  });

  it('should fallback to general profile for unknown queries', () => {
    const profile = QueryProfileRouter.route('Hello world');
    expect(profile).toBe('general');
    expect(QueryProfileRouter.getPriors(profile)).toEqual([]);
  });
});
