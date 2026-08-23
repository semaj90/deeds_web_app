import { describe, expect, it } from 'vitest';

import type { FeatureEnvelope } from './feature-envelope.js';
import {
  extractDomainRerankEvidenceV1,
  projectRerankPolicyFeaturesV1,
} from './domain-rerank-evidence-v1.js';

function envelope(overrides: Partial<FeatureEnvelope> = {}): FeatureEnvelope {
  return {
    chunk_id: 'chunk-1',
    packet_key: 'packet-1',
    source_ref: 'src/lib/server/retrieval/search-runtime.ts',
    domain_class: 'retrieval',
    metadata: {
      name: 'metadata',
      score: 0.93,
      matched_tags: ['retrieval'],
      confidence: 0.91,
    },
    created_at: new Date('2026-08-22T00:00:00.000Z'),
    ...overrides,
  };
}

describe('DomainRerankEvidenceV1', () => {
  it('preserves the categorical domain label but refuses to invent a numeric domain score', () => {
    const result = extractDomainRerankEvidenceV1(envelope());

    expect(result.domainClass).toBe('retrieval');
    expect(result.labelSource).toBe('feature_envelope_domain_class');
    expect(result.domainScore).toBeNull();
    expect(result.domainClassMatch).toBeNull();
    expect(result.rankingEligible).toBe(false);
    expect(result.trainingEligible).toBe(false);
    expect(result.blockers).toContain('DOMAIN_CLASSIFIER_LINEAGE_MISSING');
    expect(result.blockers).toContain('QUERY_DOMAIN_MISSING');
    expect(result.blockers).toContain('DOMAIN_SCORE_PRODUCER_MISSING');
  });

  it('does not reinterpret the generic metadata composite as domain affinity', () => {
    const result = extractDomainRerankEvidenceV1(envelope({
      metadata: {
        name: 'metadata',
        score: 1,
        matched_tags: ['anything'],
        confidence: 1,
      },
    }));

    expect(result.domainClass).toBe('retrieval');
    expect(result.domainScore).toBeNull();
    expect(result.domainClassMatch).toBeNull();
  });

  it('records classifier lineage when present without promoting it to a score', () => {
    const result = extractDomainRerankEvidenceV1({
      ...envelope(),
      classifier_version: 'parent-atlas-domain-taxonomy-v1',
      domain_class_source: 'canonical',
    });

    expect(result.classifierVersion).toBe('parent-atlas-domain-taxonomy-v1');
    expect(result.classifierSource).toBe('canonical');
    expect(result.blockers).not.toContain('DOMAIN_CLASSIFIER_LINEAGE_MISSING');
    expect(result.blockers).toContain('QUERY_DOMAIN_MISSING');
    expect(result.rankingEligible).toBe(false);
  });

  it('normalizes raw domain labels only when domain_class is absent', () => {
    const result = extractDomainRerankEvidenceV1(envelope({
      domain_class: undefined,
      domain: 'topology',
    }));

    expect(result.domainClass).toBe('graph');
    expect(result.labelSource).toBe('feature_envelope_domain');
  });

  it('keeps reward prior and domain-class match independent', () => {
    expect(projectRerankPolicyFeaturesV1({
      rewardPrior: 0.8,
      domainClassMatch: 0.25,
    })).toEqual({
      rewardPrior: 0.8,
      domainClassMatch: 0.25,
    });

    expect(projectRerankPolicyFeaturesV1({})).toEqual({
      rewardPrior: null,
      domainClassMatch: null,
    });
  });
});
