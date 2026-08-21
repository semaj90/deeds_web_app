import { describe, expect, it } from 'vitest';
import {
  QUERY_ROUTING_FEATURE_ORDER_V1,
  compileQueryRoutingFeatures,
} from './query-routing-features-v1.js';
import {
  formatEmbeddingGemmaInput,
  truncateEmbeddingGemmaMrl,
} from '../../embedding/embedding-contract-768.js';

describe('query routing feature vector v1', () => {
  it('emits a deterministic ordered feature vector without claiming classification', () => {
    const query = 'Why does the Qdrant projection fail for graphify.ts?';
    const first = compileQueryRoutingFeatures(query);
    const second = compileQueryRoutingFeatures(query);

    expect(first).toEqual(second);
    expect(first.status).toBe('FEATURES_ONLY');
    expect(first.embeddingRepresentationId).toBeNull();
    expect(first.featureOrder).toEqual([...QUERY_ROUTING_FEATURE_ORDER_V1]);
    expect(first.values).toHaveLength(QUERY_ROUTING_FEATURE_ORDER_V1.length);
    expect(first.values[6]).toBe(1);
    expect(first.values[8]).toBe(0);
    expect(first.values[10]).toBe(1);
  });

  it('fails closed on empty input', () => {
    expect(() => compileQueryRoutingFeatures('   ')).toThrow('QUERY_ROUTING_EMPTY_QUERY');
  });

  it('composes router features with the canonical EmbeddingGemma query/MRL boundary', () => {
    const formatted = formatEmbeddingGemmaInput('code_query', 'where is the Qdrant writer');
    const features = compileQueryRoutingFeatures(formatted);
    const compact = truncateEmbeddingGemmaMrl(new Array(768).fill(1), 128);

    expect(features.status).toBe('FEATURES_ONLY');
    expect(features.values[10]).toBe(1);
    expect(compact).toHaveLength(128);
    expect(Math.sqrt(compact.reduce((sum, value) => sum + value * value, 0))).toBeCloseTo(1, 5);
  });
});
