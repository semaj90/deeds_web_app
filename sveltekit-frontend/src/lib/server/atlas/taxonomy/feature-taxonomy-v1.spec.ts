import { describe, it, expect } from 'vitest';
import {
  CANONICAL_FEATURE_LABELS,
  FEATURE_TAXONOMY_V1,
  matchFeatureLabel,
  isCanonicalFeatureLabel,
} from './feature-taxonomy-v1.js';

describe('FeatureTaxonomyV1 Contract', () => {
  it('defines exactly 21 canonical product feature labels', () => {
    expect(CANONICAL_FEATURE_LABELS).toHaveLength(21);
    for (const label of CANONICAL_FEATURE_LABELS) {
      expect(FEATURE_TAXONOMY_V1[label]).toBeDefined();
      expect(FEATURE_TAXONOMY_V1[label].sveltekitRoutes.length).toBeGreaterThan(0);
      expect(FEATURE_TAXONOMY_V1[label].tokenBudget).toBeGreaterThan(0);
      expect(FEATURE_TAXONOMY_V1[label].nesFsmState).toMatch(/^NES_STATE_/);
    }
  });

  it('correctly matches direct labels and route paths', () => {
    expect(matchFeatureLabel('auth')).toBe('auth');
    expect(matchFeatureLabel('/login')).toBe('auth');
    expect(matchFeatureLabel('/chat')).toBe('chat');
    expect(matchFeatureLabel('/demos/bento-dashboard')).toBe('html5_visual_playground');
    expect(matchFeatureLabel('/codebase-wiki')).toBe('wiki');
    expect(matchFeatureLabel('/admin')).toBe('admin_ops');
    expect(matchFeatureLabel('/demos/collab-canvas')).toBe('canvas');
    expect(matchFeatureLabel('/cases')).toBe('cases');
    expect(matchFeatureLabel('/evidence')).toBe('evidence');
    expect(matchFeatureLabel('/terminal')).toBe('terminal');
  });

  it('correctly matches query keywords to feature labels', () => {
    expect(matchFeatureLabel('how do I reset user permission and jwt?')).toBe('auth');
    expect(matchFeatureLabel('run whisper audio transcribe')).toBe('media_transcribe');
    expect(matchFeatureLabel('search global vector rag search')).toBe('search_rag');
    expect(matchFeatureLabel('run crime reconstruction courtroom simulation')).toBe('reconstruction_sim');
    expect(matchFeatureLabel('export charging memo pdf report')).toBe('reports');
  });

  it('validates canonical feature labels safely', () => {
    expect(isCanonicalFeatureLabel('auth')).toBe(true);
    expect(isCanonicalFeatureLabel('chat')).toBe(true);
    expect(isCanonicalFeatureLabel('not_a_feature')).toBe(false);
  });
});
