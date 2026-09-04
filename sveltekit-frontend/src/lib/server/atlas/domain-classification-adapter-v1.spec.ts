import { describe, expect, it } from 'vitest';
import { classifyDomainTaxonomy } from './domain-taxonomy.js';
import { buildRulesDomainClassificationV1 } from './domain-classification-adapter-v1.js';

describe('buildRulesDomainClassificationV1', () => {
  it('adapts a real classifyDomainTaxonomy() auth-domain result into DomainClassificationV1', () => {
    const classification = classifyDomainTaxonomy({
      sourceRef: 'src/lib/server/auth/session.ts',
      summary: 'Validates Lucia session tokens and login credentials for authentication',
      imports: ['lucia', 'bcrypt'],
    });
    expect(classification.primary_domain).toBe('auth');

    const result = buildRulesDomainClassificationV1(classification, {
      canonicalId: 'packet:auth-session',
      sourceRevision: 'sha256:'.padEnd(71, '0'),
    });

    expect(result.classifierFamily).toBe('RULES');
    expect(result.predictedDomain).toBe('auth');
    expect(result.trainingSnapshotRevision).toBeUndefined();
    expect(result.probabilities.auth).toBeGreaterThan(0);
    expect(result.confidence).toBe(classification.confidence);
  });

  it('adapts a no-confident-match result (null predictedDomain) without throwing', () => {
    const classification = classifyDomainTaxonomy({ summary: 'a completely generic sentence' });
    expect(classification.primary_domain).toBeNull();

    const result = buildRulesDomainClassificationV1(classification, {
      canonicalId: 'packet:generic',
      sourceRevision: 'sha256:'.padEnd(71, '0'),
    });
    expect(result.predictedDomain).toBeNull();
  });

  it('carries source_ref evidence through as evidenceRefs', () => {
    const classification = classifyDomainTaxonomy({
      sourceRef: 'src/lib/server/graph/pagerank.ts',
      summary: 'Computes PageRank over the dependency graph',
    });
    const result = buildRulesDomainClassificationV1(classification, {
      canonicalId: 'packet:graph-pagerank',
      sourceRevision: 'sha256:'.padEnd(71, '0'),
    });
    expect(result.evidenceRefs.length).toBeGreaterThan(0);
    expect(result.evidenceRefs).toContain('src/lib/server/graph/pagerank.ts');
  });
});
