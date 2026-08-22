import { describe, expect, it } from 'vitest';
import {
  buildCodebaseQdrantFilter,
  collectionHasQuantizationFromInfo,
} from '../src/lib/server/search/qdrant-search.js';

describe('canonical codebase Qdrant search policy', () => {
  it('builds scalar payload constraints with must + match.value', () => {
    expect(buildCodebaseQdrantFilter({
      collection: 'codebase_chunks_768',
      topoClass: 'SERVICE',
    })).toEqual({
      must: [
        { key: 'atlas_enriched', match: { value: true } },
        { key: 'topo_class', match: { value: 'SERVICE' } },
      ],
    });
  });

  it('does not invent an atlas_enriched filter for unrelated collections', () => {
    expect(buildCodebaseQdrantFilter({ collection: 'other_collection' })).toBeUndefined();
    expect(buildCodebaseQdrantFilter({ collection: 'other_collection', topoClass: 'TEST' })).toEqual({
      must: [{ key: 'topo_class', match: { value: 'TEST' } }],
    });
  });

  it('detects configured collection quantization only from collection config', () => {
    expect(collectionHasQuantizationFromInfo({
      config: { quantization_config: { scalar: { type: 'int8' } } },
    })).toBe(true);
    expect(collectionHasQuantizationFromInfo({ config: { quantization_config: null } })).toBe(false);
    expect(collectionHasQuantizationFromInfo({ config: {} })).toBe(false);
    expect(collectionHasQuantizationFromInfo(null)).toBe(false);
  });
});
