import { describe, expect, it } from 'vitest';
import {
  normalizePacketRewardPriorV1,
  resolvePacketDomainLineageV1,
  type PacketDomainCanonicalRowV1,
  type PacketDomainFactRowV1,
} from './packet-domain-lineage-v1.js';

const envelope = {
  packet_key: 'packet-1',
  source_ref: 'src/lib/retrieval/search.ts',
  content_hash: 'abc123',
  domain_class: 'retrieval' as const,
  domain: 'search',
};

const packet: PacketDomainCanonicalRowV1 = {
  packetKey: 'packet-1',
  sourceRef: 'src/lib/retrieval/search.ts',
  contentHash: 'abc123',
  domainClass: 'retrieval',
  rewardPrior: 7.5,
};

const fact: PacketDomainFactRowV1 = {
  packetKey: 'packet-1',
  sourceRef: 'src/lib/retrieval/search.ts',
  domainClass: 'retrieval',
  domainConfidence: 0.91,
  classifierKind: 'canonical-domain-taxonomy',
  classifierVersion: 'parent-atlas-domain-taxonomy-v1',
  contentHash: 'abc123',
};

describe('PacketDomainLineageV1', () => {
  it('proves exact packet/source/content/domain lineage and keeps reward prior independent', () => {
    const result = resolvePacketDomainLineageV1({
      envelope,
      packets: [packet],
      facts: [fact],
    });

    expect(result).toMatchObject({
      status: 'PROVEN',
      domainClass: 'retrieval',
      domainClassSource: 'feature_domain_facts:canonical-domain-taxonomy',
      classifierVersion: 'parent-atlas-domain-taxonomy-v1',
      domainConfidence: 0.91,
      rewardPrior: 0.75,
      lineageProven: true,
    });
  });

  it('does not accept a packet source-ref mismatch', () => {
    const result = resolvePacketDomainLineageV1({
      envelope,
      packets: [{ ...packet, sourceRef: 'src/other.ts' }],
      facts: [fact],
    });

    expect(result.status).toBe('PACKET_SOURCE_REF_MISMATCH');
    expect(result.lineageProven).toBe(false);
    expect(result.classifierVersion).toBeNull();
  });

  it('does not accept a packet content-hash mismatch', () => {
    const result = resolvePacketDomainLineageV1({
      envelope,
      packets: [{ ...packet, contentHash: 'different' }],
      facts: [fact],
    });

    expect(result.status).toBe('PACKET_CONTENT_HASH_MISMATCH');
    expect(result.lineageProven).toBe(false);
  });

  it('keeps the canonical packet label observable when the provenance fact is missing', () => {
    const result = resolvePacketDomainLineageV1({
      envelope,
      packets: [packet],
      facts: [],
    });

    expect(result).toMatchObject({
      status: 'DOMAIN_FACT_MISSING',
      domainClass: 'retrieval',
      domainClassSource: 'atlas_packets.domain_class',
      classifierVersion: null,
      rewardPrior: 0.75,
      lineageProven: false,
    });
  });

  it('rejects a fact whose source/content/domain does not corroborate the canonical packet', () => {
    const result = resolvePacketDomainLineageV1({
      envelope,
      packets: [packet],
      facts: [{ ...fact, domainClass: 'graph' }],
    });

    expect(result.status).toBe('DOMAIN_FACT_MISMATCH');
    expect(result.domainClass).toBe('retrieval');
    expect(result.classifierVersion).toBeNull();
    expect(result.lineageProven).toBe(false);
  });

  it('does not use latest-wins when multiple classifier facts corroborate the same packet', () => {
    const result = resolvePacketDomainLineageV1({
      envelope,
      packets: [packet],
      facts: [
        fact,
        { ...fact, classifierVersion: 'parent-atlas-domain-taxonomy-v2' },
      ],
    });

    expect(result.status).toBe('DOMAIN_FACT_AMBIGUOUS');
    expect(result.classifierVersion).toBeNull();
    expect(result.lineageProven).toBe(false);
  });

  it('normalizes aliases but never turns them into a numeric domain score', () => {
    const result = resolvePacketDomainLineageV1({
      envelope: { ...envelope, domain_class: undefined, domain: 'ranking' },
      packets: [{ ...packet, domainClass: 'ranking' }],
      facts: [{ ...fact, domainClass: 'retrieval' }],
    });

    expect(result.domainClass).toBe('retrieval');
    expect('domainScore' in result).toBe(false);
  });

  it('normalizes the historical 0..10 reward prior explicitly at the storage boundary', () => {
    expect(normalizePacketRewardPriorV1(0)).toBe(0);
    expect(normalizePacketRewardPriorV1(5)).toBe(0.5);
    expect(normalizePacketRewardPriorV1(10)).toBe(1);
    expect(normalizePacketRewardPriorV1(25)).toBe(1);
    expect(normalizePacketRewardPriorV1(null)).toBeNull();
  });
});
