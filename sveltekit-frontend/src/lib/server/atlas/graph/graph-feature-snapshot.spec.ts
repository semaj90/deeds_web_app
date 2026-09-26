// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { admitCurrentGraphFeatureSnapshotV1 } from './graph-feature-snapshot.js';

const row = (packetKey: string, graphRevision = 'graph:r1') => ({
  packetKey,
  graphRevision,
  pagerank: 0.5,
  personalizedPageRank: null,
  communityId: null,
  algorithmRevisions: ['networkx:r1'],
});

describe('admitCurrentGraphFeatureSnapshotV1', () => {
  const base = {
    workspaceRevision: 'workspace:r1',
    graphRevision: 'graph:r1',
    ordinalMapChecksum: 'ordinal:r1',
    expectedPacketKeys: ['packet:a', 'packet:b'],
  };

  it('admits an exact sealed current graph feature set without claiming authority', () => {
    const result = admitCurrentGraphFeatureSnapshotV1({
      ...base,
      graphManifestStatus: 'SEALED_CURRENT',
      rows: [row('packet:b'), row('packet:a')],
    });
    expect(result.status).toBe('ADMITTED');
    expect(result.canonicalAuthority).toBe(false);
    expect(result.writesPerformed).toBe(false);
  });

  it('blocks an unsealed graph and preserves the supplied rows as observations', () => {
    const result = admitCurrentGraphFeatureSnapshotV1({
      ...base,
      graphManifestStatus: 'HISTORICAL',
      rows: [row('packet:a')],
    });
    expect(result.status).toBe('BLOCKED_CURRENT_GRAPH');
    expect(result.reason).toBe('GRAPH_MANIFEST_HISTORICAL');
    expect(result.rowCount).toBe(1);
    expect(result.writesPerformed).toBe(false);
  });

  it('blocks revision mismatches, duplicates, and missing nodes', () => {
    expect(admitCurrentGraphFeatureSnapshotV1({
      ...base,
      graphManifestStatus: 'SEALED_CURRENT',
      rows: [row('packet:a'), row('packet:a')],
    }).reason).toBe('GRAPH_FEATURE_DUPLICATE_PACKET_KEY');

    expect(admitCurrentGraphFeatureSnapshotV1({
      ...base,
      graphManifestStatus: 'SEALED_CURRENT',
      rows: [row('packet:a', 'graph:old'), row('packet:b')],
    }).reason).toBe('GRAPH_FEATURE_REVISION_MISMATCH');

    expect(admitCurrentGraphFeatureSnapshotV1({
      ...base,
      graphManifestStatus: 'SEALED_CURRENT',
      rows: [row('packet:a')],
    }).reason).toBe('GRAPH_FEATURE_ROW_COUNT_MISMATCH');
  });
});
