import { describe, expect, it } from 'vitest';
import { normalizeSemanticSearchHitsV1 } from './semantic-search-hits-v1.js';

describe('normalizeSemanticSearchHitsV1', () => {
  it('keeps canonical stable identity separate from the physical Qdrant ID', () => {
    const [hit] = normalizeSemanticSearchHitsV1([{
      stable_key: 'packet:canonical-1',
      packet_key: 'packet:canonical-1',
      source_ref: 'scripts/atlas/owner.mjs',
      content: 'source-bound snippet',
      semantic_score: 0.87,
      qdrant_id: 'physical-point-7',
    }]);
    expect(hit.id).toBe('packet:canonical-1');
    expect(hit.qdrant_id).toBe('physical-point-7');
    expect(hit.sources).toEqual(['qdrant']);
  });

  it('drops unhydrated or malformed rows and bounds content', () => {
    const hits = normalizeSemanticSearchHitsV1([
      { stable_key: 'packet:no-content', source_ref: 'src/a.ts', semantic_score: 0.8 },
      { stable_key: 'packet:bad', source_ref: 'src/b.ts', content: 'x', semantic_score: NaN },
      { stable_key: 'packet:ok', source_ref: 'src/c.ts', content: 'x'.repeat(5000), semantic_score: 0.7 },
    ]);
    expect(hits).toHaveLength(1);
    expect(hits[0].content).toHaveLength(4096);
  });
});
