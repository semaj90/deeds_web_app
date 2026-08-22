import { beforeEach, describe, expect, it, vi } from 'vitest';

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock('$lib/server/db/client.js', () => ({
  db: { execute },
}));

import { hydratePacketDomainLineageV1 } from './packet-domain-lineage-v1.js';
import type { FeatureEnvelope } from './feature-envelope.js';

function envelope(overrides: Partial<FeatureEnvelope> = {}): FeatureEnvelope {
  return {
    chunk_id: 'chunk-1',
    packet_key: 'packet-1',
    source_ref: 'src/lib/retrieval/search.ts',
    content_hash: 'abc123',
    domain: 'search',
    domain_class: 'retrieval',
    retrieval_score: 0.8,
    fusion_score: 0.04,
    fusion_rank: 1,
    created_at: new Date('2026-08-22T00:00:00.000Z'),
    ...overrides,
  };
}

describe('hydratePacketDomainLineageV1', () => {
  beforeEach(() => {
    execute.mockReset();
  });

  it('hydrates canonical packet domain + exact fact provenance with two read-only queries', async () => {
    execute
      .mockResolvedValueOnce({
        rows: [{
          packet_key: 'packet-1',
          source_ref: 'src/lib/retrieval/search.ts',
          content_hash: 'abc123',
          domain_class: 'retrieval',
          reward_prior: 8,
        }],
      })
      .mockResolvedValueOnce({
        rows: [{
          packet_key: 'packet-1',
          source_ref: 'src/lib/retrieval/search.ts',
          domain_class: 'retrieval',
          domain_confidence: 0.93,
          classifier_kind: 'canonical-domain-taxonomy',
          classifier_version: 'parent-atlas-domain-taxonomy-v1',
          content_hash: 'abc123',
        }],
      });

    const result = await hydratePacketDomainLineageV1([envelope()]);

    expect(execute).toHaveBeenCalledTimes(2);
    expect(result.proof).toMatchObject({
      packetResolvedCount: 1,
      lineageProvenCount: 1,
      lineageBlockedCount: 0,
      readFailedCount: 0,
    });
    expect(result.envelopes[0]).toMatchObject({
      packet_key: 'packet-1',
      domain_class: 'retrieval',
      domain_class_source: 'feature_domain_facts:canonical-domain-taxonomy',
      domain_classifier_version: 'parent-atlas-domain-taxonomy-v1',
      domain_class_confidence: 0.93,
      domain_fact_content_hash: 'abc123',
      domain_lineage_status: 'PROVEN',
      reward_prior: 0.8,
    });
  });

  it('preserves canonical label but blocks lineage when the fact ledger has no corroborating row', async () => {
    execute
      .mockResolvedValueOnce({
        rows: [{
          packet_key: 'packet-1',
          source_ref: 'src/lib/retrieval/search.ts',
          content_hash: 'abc123',
          domain_class: 'graph',
          reward_prior: 2,
        }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const result = await hydratePacketDomainLineageV1([envelope()]);

    expect(result.proof.lineageProvenCount).toBe(0);
    expect(result.proof.statusCounts.DOMAIN_FACT_MISSING).toBe(1);
    expect(result.envelopes[0]).toMatchObject({
      domain_class: 'graph',
      domain_class_source: 'atlas_packets.domain_class',
      domain_classifier_version: null,
      domain_lineage_status: 'DOMAIN_FACT_MISSING',
      reward_prior: 0.2,
    });
  });

  it('fails open for retrieval when either read query fails', async () => {
    execute.mockRejectedValueOnce(new Error('read unavailable'));

    const result = await hydratePacketDomainLineageV1([envelope()]);

    expect(result.proof).toMatchObject({
      packetResolvedCount: 0,
      lineageProvenCount: 0,
      lineageBlockedCount: 1,
      readFailedCount: 1,
    });
    expect(result.envelopes[0]).toMatchObject({
      packet_key: 'packet-1',
      domain_class: 'retrieval',
      domain_classifier_version: null,
      domain_lineage_status: 'DOMAIN_LEDGER_READ_FAILED',
      reward_prior: null,
    });
  });
});
