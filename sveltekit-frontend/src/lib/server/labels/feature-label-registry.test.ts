// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  FEATURE_LABEL_REGISTRY,
  featureLabelRegistrySignature,
  getFeatureLabelDefinition,
  normalizeFeatureLabel,
} from './feature-label-registry.js';

describe('feature-label registry', () => {
  it('normalizes common aliases into canonical labels', () => {
    expect(normalizeFeatureLabel('api endpoint')).toBe('api-route');
    expect(normalizeFeatureLabel('svelte page')).toBe('ui-component');
    expect(normalizeFeatureLabel('neo4j topology')).toBe('graph');
    expect(normalizeFeatureLabel('redis cache')).toBe('cache');
    expect(normalizeFeatureLabel('drizzle sql')).toBe('database');
  });

  it('returns stable definitions and a deterministic signature', () => {
    const def = getFeatureLabelDefinition('route handler');
    expect(def.key).toBe('api-route');
    expect(def.aliases).toContain('endpoint');
    expect(FEATURE_LABEL_REGISTRY.length).toBeGreaterThanOrEqual(10);
    expect(featureLabelRegistrySignature()).toHaveLength(16);
  });
});
