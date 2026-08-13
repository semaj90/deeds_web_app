import { describe, expect, it } from 'vitest';

import { buildClusterAcePacket } from './cluster-ace-packet.js';
import {
  decideClusterPacketConsumer,
  deriveClusterPacketConsumerFeatures,
  toPolicyDecisionReceiptPayload,
} from './cluster-packet-consumer.js';

function makePacket(overrides: Partial<Parameters<typeof buildClusterAcePacket>[0]> = {}) {
  return buildClusterAcePacket({
    clusterSummaryKey: 'cluster:summary:0',
    summaryRecord: {
      summary: 'A cluster summary that is short but informative.',
      clusterId: 0,
      size: 12,
      clusterCount: 4,
      filePaths: ['src/a.ts', 'src/b.ts'],
      authority: { clusterAuthorityScore: 0.88, maxPageRank: 0.64, avgPageRank: 0.31, memberCount: 12 },
      pageRankTop5: [{ filePath: 'src/a.ts', pageRank: 0.64, karpathyBlend: 0.8 }],
      trainedAt: '2026-08-12T16:00:00.000Z',
      updatedAt: '2026-08-12T16:15:00.000Z',
    },
    workspaceRevision: 'workspace:rev:1',
    sourceRevision: 'source:rev:1',
    graphRevision: 'graph:rev:1',
    representationRevision: 1,
    representationId: 'semantic_768',
    centroidKey: 'gpu:autoencoder:centroids_64',
    ...overrides,
  }).packet;
}

describe('cluster-packet-consumer', () => {
  it('derives read-only consumer features from the canonical packet', () => {
    const packet = makePacket();
    const features = deriveClusterPacketConsumerFeatures(packet, {
      now: new Date('2026-08-13T00:00:00.000Z'),
      cacheHot: true,
      retrievalFrequency: 6,
      executionSuccessRate: 0.9,
    });

    expect(features.packetKey).toBe(packet.packet_key);
    expect(features.representationId).toBe('semantic_768');
    expect(features.clusterId).toBe(0);
    expect(features.topFileCount).toBe(2);
    expect(features.summaryChars).toBeGreaterThan(0);
    expect(features.ageMs).toBeGreaterThan(0);
  });

  it('produces the same decision for the same input and policy', () => {
    const packet = makePacket();
    const input = {
      requestId: 'req-consumer-1',
      runtime: {
        now: new Date('2026-08-13T00:00:00.000Z'),
        cacheHot: true,
        retrievalFrequency: 8,
        executionSuccessRate: 0.95,
      },
      policy: {
        version: 'cluster-packet-policy.v1',
        selectionThreshold: 0.55,
        promotionThreshold: 0.75,
      },
    } as const;

    const a = decideClusterPacketConsumer(packet, input);
    const b = decideClusterPacketConsumer(packet, input);

    expect(a.decision).toEqual(b.decision);
    expect(a.receipt.decisionId).toBe(b.receipt.decisionId);
    expect(a.receipt.resultingStateHash).toBe(b.receipt.resultingStateHash);
    expect(a.decision.selected).toBe(true);
    expect(a.decision.promote).toBe(true);
  });

  it('maps the decision into the shared policy receipt payload', () => {
    const packet = makePacket();
    const { receipt } = decideClusterPacketConsumer(packet, {
      requestId: 'req-consumer-2',
      runtime: {
        now: new Date('2026-08-13T00:00:00.000Z'),
        cacheHot: false,
        retrievalFrequency: 0,
        executionSuccessRate: 0.2,
      },
      policy: {
        version: 'cluster-packet-policy.v1',
        selectionThreshold: 0.9,
        promotionThreshold: 0.95,
      },
    });

    const payload = toPolicyDecisionReceiptPayload(receipt, {
      decidedBy: 'cluster-packet-consumer',
      sourceEvidenceRefs: [receipt.packetKey, 'cluster:summary:0'],
    });

    expect(payload.decisionId).toBe(receipt.decisionId);
    expect(payload.decision).toBe('rejected');
    expect(payload.decidedBy).toBe('cluster-packet-consumer');
    expect(payload.policyRevision).toBe('cluster-packet-policy.v1');
    expect(payload.sourceEvidenceRefs).toContain('cluster:summary:0');
    expect(payload.metadata?.requestId).toBe('req-consumer-2');
  });
});
