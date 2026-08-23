import { describe, it, expect } from 'vitest';
import { classifyDomainFromText, KEYWORD_DOMAINS } from '$lib/server/classifier/domain-classifier';

describe('Domain Classifier', () => {
  it('should classify auth domain from keywords', () => {
    const text = 'session validation login token authenticate lucia';
    const result = classifyDomainFromText(text);
    expect(result.domain).toBe('auth');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('should classify retrieval domain from keywords', () => {
    const text = 'search query rank candidate embedding vector qdrant rrf hybrid';
    const result = classifyDomainFromText(text);
    expect(result.domain).toBe('retrieval');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('should classify database domain from keywords', () => {
    const text = 'sql postgres drizzle schema migration transaction';
    const result = classifyDomainFromText(text);
    expect(result.domain).toBe('database');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('should classify ui domain from keywords', () => {
    const text = 'button component render modal dialog svelte onclick';
    const result = classifyDomainFromText(text);
    expect(result.domain).toBe('ui');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('should classify network domain from keywords', () => {
    const text = 'fetch http request response api endpoint server client';
    const result = classifyDomainFromText(text);
    expect(result.domain).toBe('network');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('should classify ml domain from keywords', () => {
    const text = 'xgboost classifier embedding som kmeans tensor model train predict';
    const result = classifyDomainFromText(text);
    expect(result.domain).toBe('ml');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('should classify graph domain from keywords', () => {
    const text = 'neo4j edge node pagerank community topology relationship';
    const result = classifyDomainFromText(text);
    expect(result.domain).toBe('graph');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('should fall back to general domain when no keywords match', () => {
    const text = 'xyz abc def ghi jkl';
    const result = classifyDomainFromText(text);
    expect(result.domain).toBe('general');
    expect(result.confidence).toBe(0);
  });

  it('should be case-insensitive', () => {
    const textLower = 'session login token';
    const textUpper = 'SESSION LOGIN TOKEN';
    const resultLower = classifyDomainFromText(textLower);
    const resultUpper = classifyDomainFromText(textUpper);
    expect(resultLower.domain).toBe(resultUpper.domain);
    expect(resultLower.confidence).toBe(resultUpper.confidence);
  });

  it('should return keyword counts for all domains', () => {
    const text = 'session login search query postgres sql';
    const result = classifyDomainFromText(text);
    expect(result.counts).toHaveProperty('auth');
    expect(result.counts).toHaveProperty('retrieval');
    expect(result.counts).toHaveProperty('database');
    expect(result.counts.auth).toBeGreaterThan(0);
    expect(result.counts.retrieval).toBeGreaterThan(0);
    expect(result.counts.database).toBeGreaterThan(0);
  });

  it('should pick highest-scoring domain on tie', () => {
    const text = 'search query session login';
    const result = classifyDomainFromText(text);
    expect(['auth', 'retrieval']).toContain(result.domain);
  });

  it('should export KEYWORD_DOMAINS with all required domains', () => {
    const requiredDomains = ['auth', 'ui', 'retrieval', 'network', 'database', 'cache', 'agent', 'graph', 'ml', 'general'];
    for (const domain of requiredDomains) {
      expect(KEYWORD_DOMAINS).toHaveProperty(domain);
    }
  });

  it('should have non-empty keyword lists (except general)', () => {
    const domainsWithKeywords = ['auth', 'ui', 'retrieval', 'network', 'database', 'cache', 'agent', 'graph', 'ml'];
    for (const domain of domainsWithKeywords) {
      expect(KEYWORD_DOMAINS[domain as keyof typeof KEYWORD_DOMAINS].length).toBeGreaterThan(0);
    }
  });
});
