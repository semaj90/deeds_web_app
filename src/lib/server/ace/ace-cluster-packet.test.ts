import { describe, it, expect } from 'vitest';
import { buildClusterAcePacket } from './ace-cluster-packet';

describe('buildClusterAcePacket', () => {
  it('should build a valid cluster ACE packet', () => {
    const packet = buildClusterAcePacket({
      clusterId: 0,
      centroidMeta: {
        trainedAt: '2026-08-13T02:35:34.490Z',
        clusterCount: 33,
        totalPoints: 105761
      },
      summaryRecord: {
        summary: 'SOM cluster 0: 33 centroids, 105761 points',
        size: 105761,
        filePaths: ['src/lib/server/db/client.ts', 'src/lib/server/db/schema.ts'],
        updatedAt: '2026-08-13T02:35:34.490Z'
      },
      workspaceRevision: 'v1.0.0',
      sourceRevision: 'abc123'
    });

    // Verify required fields
    expect(packet.packet_key).toBe('ace:cluster:0:abc123');
    expect(packet.feature_id).toBe('cluster:0');
    expect(packet.source_ref).toBe('cluster:summary:0');
    expect(packet.summary).toBe('SOM cluster 0: 33 centroids, 105761 points');
    expect(packet.cluster_id).toBe(0);
    expect(packet.som_cluster).toBe(0);
    expect(packet.domain).toBe('cluster');
    expect(packet.trace_id).toBe('abc123');

    // Verify metadata structure
    expect(packet.metadata).toBeDefined();
    expect(packet.metadata!.cluster).toBeDefined();
    expect(packet.metadata!.cluster.id).toBe(0);
    expect(packet.metadata!.cluster.trainedAt).toBe('2026-08-13T02:35:34.490Z');
    expect(packet.metadata!.cluster.clusterCount).toBe(33);
    expect(packet.metadata!.cluster.totalPoints).toBe(105761);

    expect(packet.metadata!.semantic).toBeDefined();
    expect(packet.metadata!.semantic.summary).toBe('SOM cluster 0: 33 centroids, 105761 points');
    expect(packet.metadata!.semantic.size).toBe(105761);
    expect(packet.metadata!.semantic.filePaths).toHaveLength(2);
    expect(packet.metadata!.semantic.topFiles).toHaveLength(2);
    expect(packet.metadata!.semantic.topFiles[0].sourceRef).toBe('src/lib/server/db/client.ts');
    expect(packet.metadata!.semantic.topFiles[1].sourceRef).toBe('src/lib/server/db/schema.ts');

    expect(packet.metadata!.provenance).toBeDefined();
    expect(packet.metadata!.provenance.centroidKey).toBe('gpu:autoencoder:centroids_64');
    expect(packet.metadata!.provenance.summaryKey).toBe('cluster:summary:0');
    expect(packet.metadata!.provenance.summaryUpdatedAt).toBe('2026-08-13T02:35:34.490Z');

    // Verify bounds
    expect(packet.metadata!.bounds).toBeDefined();
    expect(packet.metadata!.bounds.topFiles).toBe(2);
    expect(packet.metadata!.bounds.summaryChars).toBe('SOM cluster 0: 33 centroids, 105761 points'.length);

    // Verify created_at
    expect(packet.created_at).toBeDefined();
    expect(new Date(packet.created_at!).getTime()).toBeGreaterThan(0);
  });

  it('should throw on missing clusterId', () => {
    expect(() => buildClusterAcePacket({
      clusterId: undefined,
      centroidMeta: { trainedAt: '2026-08-13T02:35:34.490Z' },
      summaryRecord: {
        summary: 'test',
        size: 100,
        filePaths: ['test.ts']
      },
      workspaceRevision: 'v1.0.0',
      sourceRevision: 'abc123'
    })).toThrow('buildClusterAcePacket: clusterId is required');
  });

  it('should throw on invalid trainedAt', () => {
    expect(() => buildClusterAcePacket({
      clusterId: 0,
      centroidMeta: { trainedAt: 'invalid-date' },
      summaryRecord: {
        summary: 'test',
        size: 100,
        filePaths: ['test.ts']
      },
      workspaceRevision: 'v1.0.0',
      sourceRevision: 'abc123'
    })).toThrow('buildClusterAcePacket: invalid trainedAt timestamp');
  });

  it('should throw on empty summary', () => {
    expect(() => buildClusterAcePacket({
      clusterId: 0,
      centroidMeta: { trainedAt: '2026-08-13T02:35:34.490Z' },
      summaryRecord: {
        summary: '   ',
        size: 100,
        filePaths: ['test.ts']
      },
      workspaceRevision: 'v1.0.0',
      sourceRevision: 'abc123'
    })).toThrow('buildClusterAcePacket: summaryRecord.summary must not be empty after trim');
  });

  it('should throw on empty filePaths', () => {
    expect(() => buildClusterAcePacket({
      clusterId: 0,
      centroidMeta: { trainedAt: '2026-08-13T02:35:34.490Z' },
      summaryRecord: {
        summary: 'test',
        size: 100,
        filePaths: ['']
      },
      workspaceRevision: 'v1.0.0',
      sourceRevision: 'abc123'
    })).toThrow('buildClusterAcePacket: summaryRecord.filePaths must contain non-empty strings');
  });

  it('should throw on missing workspaceRevision', () => {
    expect(() => buildClusterAcePacket({
      clusterId: 0,
      centroidMeta: { trainedAt: '2026-08-13T02:35:34.490Z' },
      summaryRecord: {
        summary: 'test',
        size: 100,
        filePaths: ['test.ts']
      },
      workspaceRevision: '',
      sourceRevision: 'abc123'
    })).toThrow('buildClusterAcePacket: workspaceRevision is required');
  });

  it('should throw on missing sourceRevision', () => {
    expect(() => buildClusterAcePacket({
      clusterId: 0,
      centroidMeta: { trainedAt: '2026-08-13T02:35:34.490Z' },
      summaryRecord: {
        summary: 'test',
        size: 100,
        filePaths: ['test.ts']
      },
      workspaceRevision: 'v1.0.0',
      sourceRevision: ''
    })).toThrow('buildClusterAcePacket: sourceRevision is required');
  });

  it('should generate deterministic packetKey', () => {
    const packet1 = buildClusterAcePacket({
      clusterId: 0,
      centroidMeta: { trainedAt: '2026-08-13T02:35:34.490Z' },
      summaryRecord: {
        summary: 'test',
        size: 100,
        filePaths: ['test.ts']
      },
      workspaceRevision: 'v1.0.0',
      sourceRevision: 'abc123'
    });

    const packet2 = buildClusterAcePacket({
      clusterId: 0,
      centroidMeta: { trainedAt: '2026-08-13T02:35:34.490Z' },
      summaryRecord: {
        summary: 'test',
        size: 100,
        filePaths: ['test.ts']
      },
      workspaceRevision: 'v1.0.0',
      sourceRevision: 'abc123'
    });

    expect(packet1.packet_key).toBe(packet2.packet_key);
    expect(packet1.packet_key).toBe('ace:cluster:0:abc123');
  });

  it('should handle pageRankTop5', () => {
    const packet = buildClusterAcePacket({
      clusterId: 1,
      centroidMeta: { trainedAt: '2026-08-13T02:35:34.490Z' },
      summaryRecord: {
        summary: 'Test cluster',
        size: 50,
        filePaths: ['test.ts'],
        pageRankTop5: [
          'src/lib/server/db/client.ts',
          { sourceRef: 'src/lib/server/db/schema.ts' },
          { sourceRef: 'src/lib/server/db/schema-postgres.ts', pageRank: 0.95 }
        ]
      },
      workspaceRevision: 'v1.0.0',
      sourceRevision: 'def456'
    });

    expect(packet.metadata!.semantic.topFiles).toHaveLength(3);
    expect(packet.metadata!.semantic.topFiles[0].sourceRef).toBe('src/lib/server/db/client.ts');
    expect(packet.metadata!.semantic.topFiles[1].sourceRef).toBe('src/lib/server/db/schema.ts');
    expect(packet.metadata!.semantic.topFiles[2].sourceRef).toBe('src/lib/server/db/schema-postgres.ts');
    expect(packet.metadata!.semantic.topFiles[2].pageRank).toBe(0.95);
  });

  it('should handle optional fields', () => {
    const packet = buildClusterAcePacket({
      clusterId: 2,
      centroidMeta: { trainedAt: '2026-08-13T02:35:34.490Z' },
      summaryRecord: {
        summary: 'Minimal cluster',
        size: 10,
        filePaths: ['minimal.ts']
      },
      workspaceRevision: 'v1.0.0',
      sourceRevision: 'ghi789'
    });

    // Optional fields should be undefined when not provided
    expect(packet.metadata!.cluster.clusterCount).toBeUndefined();
    expect(packet.metadata!.cluster.totalPoints).toBeUndefined();
    expect(packet.metadata!.semantic.authorityScore).toBeUndefined();
    expect(packet.metadata!.provenance.graphRevision).toBeUndefined();
  });
});
