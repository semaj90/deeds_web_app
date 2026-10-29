import { describe, expect, it } from 'vitest';
import { ATLAS_SYSTEM_RECORD_KEY, buildAtlasQdrantFilter } from './qdrant-filter-contract.js';

describe('Qdrant administrative-record filter contract', () => {
  it('serializes a simulation jurisdiction filter as a scalar MatchInterface value', () => {
    expect(buildAtlasQdrantFilter({ jurisdiction: 'fictional-state' })).toEqual({
      must: [{ key: 'jurisdiction', match: { value: 'fictional-state' } }],
      must_not: [{ key: ATLAS_SYSTEM_RECORD_KEY, match: { value: true } }],
    });
  });

  it('always excludes atlas system records while preserving caller filters', () => {
    expect(buildAtlasQdrantFilter({ workspace_revision: 41, tags: ['ts', 'graph'] })).toEqual({
      must: [
        { key: 'workspace_revision', match: { value: 41 } },
        { key: 'tags', match: { any: ['ts', 'graph'] } },
      ],
      must_not: [{ key: ATLAS_SYSTEM_RECORD_KEY, match: { value: true } }],
    });
  });
});

