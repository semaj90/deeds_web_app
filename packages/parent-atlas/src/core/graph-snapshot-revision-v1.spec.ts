import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  GraphSnapshotRevisionV1Schema,
  assertGraphSnapshotRevisionMatchesHashes,
  bindGraphNodeToSnapshotRevision,
  computeGraphSnapshotRevisionChecksum,
} from './graph-snapshot-revision-v1.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const revision = {
  schemaVersion: 'graph-snapshot-revision-v1' as const,
  snapshotId: '22222222-2222-4222-8222-222222222222',
  workspaceRevision: 'workspace:main@abc',
  sourceInventoryRevision: 'inventory:2026-08-21',
  graphRevision: 'graph:2026-08-21:r1',
  identityContractVersion: 'atlas-graph-identity-v2',
  parserContractVersion: 'treesitter-8095-v2',
  sourceInventoryHash: digest('sources'),
  topologyHash: digest('topology'),
  policyHash: digest('policy'),
  producerRevision: 'graphify:producer-r1',
};

describe('GraphSnapshotRevisionV1', () => {
  it('accepts snapshot lineage and produces a deterministic checksum', () => {
    const parsed = GraphSnapshotRevisionV1Schema.parse(revision);
    expect(computeGraphSnapshotRevisionChecksum(parsed)).toHaveLength(64);
    expect(computeGraphSnapshotRevisionChecksum({ ...parsed })).toBe(computeGraphSnapshotRevisionChecksum(parsed));
  });

  it('binds nodes only through the owning snapshot', () => {
    expect(bindGraphNodeToSnapshotRevision(revision, {
      snapshotId: revision.snapshotId,
      nodeKey: 'symbol:foo',
      sourceRevision: null,
      treeNodeId: 'tree:foo',
      symbolVersionId: null,
    }).snapshotId).toBe(revision.snapshotId);
    expect(() => bindGraphNodeToSnapshotRevision(revision, {
      snapshotId: '33333333-3333-4333-8333-333333333333',
      nodeKey: 'symbol:wrong-snapshot',
      sourceRevision: null,
      treeNodeId: null,
      symbolVersionId: null,
    })).toThrow('GRAPH_SNAPSHOT_NODE_REVISION_MISMATCH');
  });

  it('rejects source, topology, or policy hash drift', () => {
    expect(() => assertGraphSnapshotRevisionMatchesHashes(revision, {
      topologyHash: revision.topologyHash,
      policyHash: revision.policyHash,
      sourceInventoryHash: digest('changed'),
    })).toThrow('GRAPH_SNAPSHOT_REVISION_HASH_MISMATCH');
  });
});
