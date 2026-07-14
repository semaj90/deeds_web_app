import { describe, expect, it } from 'vitest';
import {
  CANONICAL_DOMAINS,
  classifyDomainTaxonomy,
  normalizeDomainLabel,
  DOMAIN_TAXONOMY_VERSION,
} from './domain-taxonomy.js';

describe('domain taxonomy', () => {
  it('maps legacy fallback labels to general without pretending they are canonical', () => {
    const result = normalizeDomainLabel('general_abstractions');

    expect(result.original).toBe('general_abstractions');
    expect(result.canonical).toBeNull();
    expect(result.fallback).toBe('general');
    expect(result.normalization).toBe('deprecated_fallback');
  });

  it('recognizes canonical labels', () => {
    const result = normalizeDomainLabel('retrieval');

    expect(result.canonical).toBe('retrieval');
    expect(result.fallback).toBeNull();
    expect(result.normalization).toBe('canonical');
  });

  it('keeps general out of the canonical label set', () => {
    expect(CANONICAL_DOMAINS).not.toContain('general');
  });

  it('classifies retrieval evidence from query-adjacent text', () => {
    const classification = classifyDomainTaxonomy({
      sourceRef: 'src/lib/server/retrieval/search-runtime.ts',
      featureId: 'retrieval.search.runtime',
      summary: 'Hybrid qdrant bm25 rerank pipeline',
    });

    expect(classification.classifier_version).toBe(DOMAIN_TAXONOMY_VERSION);
    expect(classification.primary_domain).toBe('retrieval');
    expect(classification.fallback_label).toBeNull();
    expect(classification.confidence).toBeGreaterThan(0);
    expect(classification.evidence.length).toBeGreaterThan(0);
  });

  it('falls back to general when evidence is weak', () => {
    const classification = classifyDomainTaxonomy({
      sourceRef: 'src/lib/server/misc/placeholder.ts',
      summary: 'miscellaneous helper',
    });

    expect(classification.primary_domain).toBeNull();
    expect(classification.fallback_label).toBe('general');
    expect(classification.secondary_domains).not.toContain('general');
  });
});
