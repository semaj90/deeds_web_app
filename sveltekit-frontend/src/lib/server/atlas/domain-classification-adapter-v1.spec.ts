import { describe, expect, it } from 'vitest';
import { classifyDomainTaxonomy } from './domain-taxonomy.js';
import {
  buildOkfDomainClassificationBatchV1,
  buildOkfDomainClassificationProposalArrayV1,
  buildRulesDomainClassificationV1,
} from './domain-classification-adapter-v1.js';

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

describe('buildOkfDomainClassificationBatchV1', () => {
  it('emits a deterministic proposal array with source and taxonomy revisions kept distinct', () => {
    const classification = classifyDomainTaxonomy({
      sourceRef: 'src/lib/server/graph/pagerank.ts',
      summary: 'Computes PageRank over a retrieval graph',
    });
    const input = {
      classification,
      subjectRef: 'packet:graph-pagerank',
      subjectKind: 'file' as const,
      sourceRevision: 'sha256:'.padEnd(71, '1'),
    };

    const first = buildOkfDomainClassificationBatchV1(input);
    const second = buildOkfDomainClassificationBatchV1(input);

    expect(first).toEqual(second);
    expect(first.status).toBe('PROPOSAL_ONLY');
    expect(first.rows.length).toBeGreaterThan(0);
    expect(first.rows.every((row) => row.sourceRevision === input.sourceRevision)).toBe(true);
    expect(first.rows.every((row) => row.taxonomyRevision === first.taxonomyRevision)).toBe(true);
    expect(first.rows.every((row) => row.evidenceRefs.includes('src/lib/server/graph/pagerank.ts'))).toBe(true);
    expect(first.canonicalAuthority).toBe(false);
    expect(first.writesPerformed).toBe(false);
  });

  it('returns unavailable instead of manufacturing evidence when no source refs exist', () => {
    const classification = classifyDomainTaxonomy({ summary: 'graph retrieval' });
    const result = buildOkfDomainClassificationBatchV1({
      classification,
      subjectRef: 'packet:unbound',
      subjectKind: 'file',
      sourceRevision: 'sha256:'.padEnd(71, '2'),
    });

    expect(result).toMatchObject({ status: 'UNAVAILABLE', rows: [], reason: 'CLASSIFICATION_EVIDENCE_REFS_MISSING' });
  });

  it('rejects source revision strings that are not canonical SHA-256 digests', () => {
    const classification = classifyDomainTaxonomy({
      sourceRef: 'src/lib/server/graph/pagerank.ts',
      summary: 'Computes PageRank over a retrieval graph',
    });

    expect(() => buildOkfDomainClassificationBatchV1({
      classification,
      subjectRef: 'packet:graph-pagerank',
      subjectKind: 'file',
      sourceRevision: 'producer-v1',
    })).toThrow('OKF_DOMAIN_SOURCE_REVISION_INVALID');
  });
});

describe('buildOkfDomainClassificationProposalArrayV1', () => {
  it('creates a stable rows array across candidates without granting persistence authority', () => {
    const candidates = [
      {
        classification: classifyDomainTaxonomy({ sourceRef: 'docs:search', summary: 'Search retrieval index' }),
        subjectRef: 'docs:search',
        subjectKind: 'document' as const,
        sourceRevision: 'sha256:'.padEnd(71, '3'),
      },
      {
        classification: classifyDomainTaxonomy({ sourceRef: 'docs:auth', summary: 'Authentication and login' }),
        subjectRef: 'docs:auth',
        subjectKind: 'document' as const,
        sourceRevision: 'sha256:'.padEnd(71, '4'),
      },
    ];

    const result = buildOkfDomainClassificationProposalArrayV1({ candidates });

    expect(result.status).toBe('PROPOSAL_ONLY');
    expect(result.rows.map((row) => row.subjectRef)).toEqual([...result.rows.map((row) => row.subjectRef)].sort());
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
  });

  it('rejects duplicate candidate identity before producing proposal rows', () => {
    const candidate = {
      classification: classifyDomainTaxonomy({ sourceRef: 'docs:auth', summary: 'Authentication and login' }),
      subjectRef: 'docs:auth',
      subjectKind: 'document' as const,
      sourceRevision: 'sha256:'.padEnd(71, '5'),
    };

    expect(() => buildOkfDomainClassificationProposalArrayV1({ candidates: [candidate, candidate] }))
      .toThrow('OKF_DOMAIN_CLASSIFICATION_DUPLICATE_CANDIDATE');
  });
});
