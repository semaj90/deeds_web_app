import { describe, expect, it } from 'vitest';

import { compareQueryDomainToPacketV1 } from './domain-class-match-v1.js';
import type { PacketDomainLineageV1 } from './packet-domain-lineage-v1.js';

function lineage(overrides: Partial<PacketDomainLineageV1> = {}): PacketDomainLineageV1 {
  return {
    schema: 'atlas.packet-domain-lineage.v1',
    packetKey: 'packet-1',
    status: 'PROVEN',
    domainClass: 'retrieval',
    domainClassSource: 'feature_domain_facts:heuristic_path_classifier',
    classifierVersion: 'domain-classifier-v1',
    domainConfidence: 0.95,
    domainFactContentHash: 'abc123',
    rewardPrior: 0.7,
    lineageProven: true,
    ...overrides,
  };
}

describe('DomainClassMatchV1', () => {
  it('emits 1 for an exact canonical primary-domain match', () => {
    const result = compareQueryDomainToPacketV1({
      query: 'rerank vector search results from qdrant retrieval candidates',
      lineage: lineage({ domainClass: 'retrieval' }),
    });

    expect(result.queryDomainClass).toBe('retrieval');
    expect(result.domainClassMatch).toBe(1);
    expect(result.matchKind).toBe('EXACT_PRIMARY');
    expect(result.featureEligible).toBe(true);
    expect(result.comparisonChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('emits 0.5 when the proven candidate is a canonical secondary query domain', () => {
    const result = compareQueryDomainToPacketV1({
      query: 'search qdrant vectors and persist the result with postgres sql',
      lineage: lineage({ domainClass: 'database' }),
    });

    expect(result.queryDomainClass).not.toBeNull();
    expect(result.querySecondaryDomains).toContain('database');
    expect(result.domainClassMatch).toBe(0.5);
    expect(result.matchKind).toBe('SECONDARY');
    expect(result.featureEligible).toBe(true);
  });

  it('emits 0 only when both sides are proven and canonically disagree', () => {
    const result = compareQueryDomainToPacketV1({
      query: 'render a svelte button component and modal layout',
      lineage: lineage({ domainClass: 'database' }),
    });

    expect(result.queryDomainClass).toBe('ui');
    expect(result.domainClassMatch).toBe(0);
    expect(result.matchKind).toBe('PROVEN_MISMATCH');
    expect(result.featureEligible).toBe(true);
  });

  it('keeps unresolved query classification as null rather than false negative zero', () => {
    const result = compareQueryDomainToPacketV1({
      query: 'xyzzy plugh frobnicate',
      lineage: lineage(),
    });

    expect(result.queryDomainClass).toBeNull();
    expect(result.domainClassMatch).toBeNull();
    expect(result.matchKind).toBe('QUERY_DOMAIN_UNRESOLVED');
    expect(result.featureEligible).toBe(false);
  });

  it('keeps unproven candidate lineage as null', () => {
    const result = compareQueryDomainToPacketV1({
      query: 'qdrant retrieval search ranking',
      lineage: lineage({
        status: 'DOMAIN_FACT_AMBIGUOUS',
        classifierVersion: null,
        lineageProven: false,
      }),
    });

    expect(result.domainClassMatch).toBeNull();
    expect(result.matchKind).toBe('CANDIDATE_DOMAIN_LINEAGE_UNPROVEN');
    expect(result.featureEligible).toBe(false);
  });

  it('never treats general fallback as a numeric match feature', () => {
    const result = compareQueryDomainToPacketV1({
      query: 'qdrant retrieval search ranking',
      lineage: lineage({ domainClass: 'general' }),
    });

    expect(result.domainClassMatch).toBeNull();
    expect(result.matchKind).toBe('CANDIDATE_DOMAIN_FALLBACK');
    expect(result.featureEligible).toBe(false);
  });
});
