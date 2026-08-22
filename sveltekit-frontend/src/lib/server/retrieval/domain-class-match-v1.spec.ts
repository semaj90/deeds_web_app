import { describe, expect, it } from 'vitest';
import { compareQueryDomainToPacketV1 } from './domain-class-match-v1.js';
import type { PacketDomainLineageV1 } from './packet-domain-lineage-v1.js';

function lineage(overrides: Partial<PacketDomainLineageV1> = {}): PacketDomainLineageV1 {
  return {
    schema: 'atlas.packet-domain-lineage.v1', packetKey: 'packet-1', status: 'PROVEN',
    domainClass: 'retrieval', domainClassSource: 'feature_domain_facts:heuristic_path_classifier',
    classifierVersion: 'domain-classifier-v1', domainConfidence: 0.95,
    domainFactContentHash: 'abc123', rewardPrior: 0.7, lineageProven: true, ...overrides,
  };
}

describe('DomainClassMatchV1', () => {
  it('emits 1 for exact primary match', () => {
    const r = compareQueryDomainToPacketV1({ query: 'rerank vector search results from qdrant retrieval candidates', lineage: lineage() });
    expect(r.queryDomainClass).toBe('retrieval'); expect(r.domainClassMatch).toBe(1); expect(r.matchKind).toBe('EXACT_PRIMARY'); expect(r.featureEligible).toBe(true);
  });
  it('emits 0.5 for canonical secondary match', () => {
    const r = compareQueryDomainToPacketV1({ query: 'search qdrant vectors and persist the result with postgres sql', lineage: lineage({ domainClass: 'database' }) });
    expect(r.querySecondaryDomains).toContain('database'); expect(r.domainClassMatch).toBe(0.5); expect(r.matchKind).toBe('SECONDARY');
  });
  it('emits 0 only for proven mismatch', () => {
    const r = compareQueryDomainToPacketV1({ query: 'render a svelte button component and modal layout', lineage: lineage({ domainClass: 'database' }) });
    expect(r.queryDomainClass).toBe('ui'); expect(r.domainClassMatch).toBe(0); expect(r.matchKind).toBe('PROVEN_MISMATCH');
  });
  it('keeps unresolved query as null', () => {
    const r = compareQueryDomainToPacketV1({ query: 'xyzzy plugh frobnicate', lineage: lineage() });
    expect(r.queryDomainClass).toBeNull(); expect(r.domainClassMatch).toBeNull(); expect(r.featureEligible).toBe(false);
  });
  it('keeps unproven candidate lineage as null', () => {
    const r = compareQueryDomainToPacketV1({ query: 'qdrant retrieval search ranking', lineage: lineage({ status: 'DOMAIN_FACT_AMBIGUOUS', classifierVersion: null, lineageProven: false }) });
    expect(r.domainClassMatch).toBeNull(); expect(r.matchKind).toBe('CANDIDATE_DOMAIN_LINEAGE_UNPROVEN');
  });
  it('never treats general fallback as numeric match', () => {
    const r = compareQueryDomainToPacketV1({ query: 'qdrant retrieval search ranking', lineage: lineage({ domainClass: 'general' }) });
    expect(r.domainClassMatch).toBeNull(); expect(r.matchKind).toBe('CANDIDATE_DOMAIN_FALLBACK');
  });
});
