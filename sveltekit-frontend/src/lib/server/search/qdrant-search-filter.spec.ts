import { describe, expect, it } from 'vitest';
import { buildCodebaseQdrantFilter } from './qdrant-search.js';

describe('buildCodebaseQdrantFilter', () => {
  it('excludes both historical task-semantic canary payload shapes', () => {
    const filter = buildCodebaseQdrantFilter({ collection: 'codebase_chunks_768_v2' });

    expect(filter).toEqual({
      must_not: [
        { key: 'canary', match: { value: true } },
        { key: 'source_ref', match: { value: 'canary://task-semantic' } },
      ],
    });
  });

  it('preserves collection and topology requirements alongside fixture exclusion', () => {
    const filter = buildCodebaseQdrantFilter({ collection: 'codebase_chunks_768', topoClass: 'backend' });

    expect(filter?.must).toEqual([
      { key: 'atlas_enriched', match: { value: true } },
      { key: 'topo_class', match: { value: 'backend' } },
    ]);
    expect(filter?.must_not).toHaveLength(2);
  });
});
