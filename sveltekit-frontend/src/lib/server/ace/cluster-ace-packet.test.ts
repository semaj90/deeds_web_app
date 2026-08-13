import { describe, expect, it } from 'vitest';
import {
  buildClusterAcePacket,
  hashClusterAcePacketProjection,
} from './cluster-ace-packet';

const baseInput = {
  clusterSummaryKey: 'cluster:summary:7',
  workspaceRevision: 'workspace-rev-123',
  sourceRevision: 'source-rev-abc',
  graphRevision: 'graph-rev-1',
  summaryRecord: {
    clusterId: 7,
    size: 12,
    summary: 'This cluster groups packetized code summaries and their hot file paths.',
    filePaths: [
      'src/b.ts',
      'src/a.ts',
      'src/a.ts',
    ],
    authority: { clusterAuthorityScore: 0.91 },
    pageRankTop5: [
      { filePath: 'src/b.ts', pageRank: 0.2 },
      { filePath: 'src/a.ts', pageRank: 0.3 },
    ],
    trainedAt: '2026-08-13T02:35:34.490Z',
    updatedAt: '2026-08-13T02:55:02.983Z',
  },
} as const;

describe('buildClusterAcePacket', () => {
  it('produces stable identity for the same inputs', () => {
    const first = buildClusterAcePacket(baseInput);
    const second = buildClusterAcePacket(baseInput);

    expect(first.packet.packet_key).toBe(second.packet.packet_key);
    expect(first.canonicalHash).toBe(second.canonicalHash);
    expect(hashClusterAcePacketProjection(first.packet)).toBe(hashClusterAcePacketProjection(second.packet));
  });

  it('normalizes top files before identity hashing', () => {
    const reversed = buildClusterAcePacket({
      ...baseInput,
      summaryRecord: {
        ...baseInput.summaryRecord,
        filePaths: ['src/a.ts', 'src/b.ts'],
      },
    });

    expect(reversed.packet.packet_key).toBe(buildClusterAcePacket(baseInput).packet.packet_key);
    expect(reversed.canonicalHash).toBe(buildClusterAcePacket(baseInput).canonicalHash);
  });

  it('keeps canonical lineage on the packet payload', () => {
    const { packet } = buildClusterAcePacket(baseInput);
    expect(packet.feature_id).toBe('cluster:7');
    expect(packet.source_ref).toBe('cluster:summary:7');
    expect(packet.metadata?.schemaVersion).toBe('ace.cluster.packet.v1');
    expect(packet.packet_key).toBe(packet.packet_id);
  });
});
