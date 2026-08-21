import { describe, expect, it } from 'vitest';
import {
  buildCodebaseQdrantFilter,
  collectionHasQuantizationFromInfo,
} from '../src/lib/server/search/qdrant-search.js';

describe('canonical codebase Qdrant policy helpers', () => {
  it('compiles scalar payload restrictions into Qdrant must/match conditions', () => {
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

  it('does not inject the codebase enrichment filter into unrelated collections', () => {
    expect(buildCodebaseQdrantFilter({ collection: 'legal_canon_chunks' })).toBeUndefined();
    expect(buildCodebaseQdrantFilter({
      collection: 'legal_canon_chunks',
      topoClass: 'CASE',
    })).toEqual({
      must: [{ key: 'topo_class', match: { value: 'CASE' } }],
    });
  });

  it('discovers collection quantization only from Qdrant collection config', () => {
    expect(collectionHasQuantizationFromInfo({
      config: { quantization_config: { scalar: { type: 'int8' } } },
    })).toBe(true);
    expect(collectionHasQuantizationFromInfo({
      config: { quantization_config: null },
    })).toBe(false);
    expect(collectionHasQuantizationFromInfo({ config: {} })).toBe(false);
    expect(collectionHasQuantizationFromInfo(null)).toBe(false);
  });
});
