import { describe, expect, it } from 'vitest';
import { QueryProfileRouter, type SearchProfile } from './query-profile-router.js';

describe('QueryProfileRouter', () => {
  it('routes ace/cache queries to the ACE profile and exposes aliases', () => {
    const profile: SearchProfile = QueryProfileRouter.route('ACE context cache Redis');
    expect(profile).toBe('ace_cache');
    expect(QueryProfileRouter.getPriors(profile)).toEqual([72, 94, 25, 22]);
    expect(QueryProfileRouter.getAliases(profile)).toEqual(expect.arrayContaining(['ace_context', 'redis_cache']));
  });

  it('routes LangExtract queries and WebGPU queries to dedicated profiles', () => {
    expect(QueryProfileRouter.route('LangExtract evidence extraction')).toBe('langextract');
    expect(QueryProfileRouter.route('GPU WebGPU similarity')).toBe('gpu_topology');
  });
});
