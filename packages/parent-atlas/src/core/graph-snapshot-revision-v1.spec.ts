import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  GraphSnapshotRevisionV1Schema,
  assertGraphSnapshotRevisionMatchesHashes,
  bindGraphNodeToSnapshotRevision,
  buildGraphSnapshotRevisionV1,
  computeGraphSnapshotRevisionChecksum,
  verifyGraphSnapshotRevisionV1,
} from './graph-snapshot-revision-v1.js';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const sourceInventoryHash = digest('sources');
const fixture = {
  snapshotId: '22222222-2222-4222-8222-222222222222',
  workspaceRevision: `sha256:${digest('workspace-manifest')}`,
  sourceInventoryRevision: `sha256:${sourceInventoryHash}`,
  identityContractVersion: 'atlas-graph-identity-v2',
  parserContractVersion: 'treesitter-8095-v2',
  sourceInventoryHash,
  topologyHash: digest('topology'),
  policyHash: digest('policy'),
  producerRevision: 'graphify:producer-r2',
} as const;

function revision(overrides: Partial<typeof fixture> = {}) {
  return buildGraphSnapshotRevisionV1({ ...fixture, ...overrides });
}

describe('GraphSnapshotRevisionV1', () => {
  it('owns deterministic graphRevision and snapshot-specific checksum', () => {
    const first = revision();
    const second = revision({ snapshotId: '33333333-3333-4333-8333-333333333333' });
    expect(first.graphRevision).toBe(second.graphRevision);
    expect(first.revisionChecksum).not.toBe(second.revisionChecksum);
    expect(computeGraphSnapshotRevisionChecksum(first)).toBe(first.revisionChecksum);
    expect(verifyGraphSnapshotRevisionV1(first)).toEqual(first);
    expect(GraphSnapshotRevisionV1Schema.parse(first)).toEqual(first);
  });

  it('changes logical graph revision when workspace world state or topology changes', () => {
    const baseline = revision();
    expect(revision({ workspaceRevision: `sha256:${digest('changed-workspace')}` }).graphRevision)
      .not.toBe(baseline.graphRevision);
    expect(revision({ topologyHash: digest('changed-topology') }).graphRevision)
      .not.toBe(baseline.graphRevision);
  });

  it('rejects Git/prose workspace revisions and source inventory revision drift', () => {
    expect(() => buildGraphSnapshotRevisionV1({ ...fixture, workspaceRevision: 'workspace:main@abc' as never })).toThrow();
    expect(() => buildGraphSnapshotRevisionV1({
      ...fixture,
      sourceInventoryRevision: `sha256:${digest('other')}`,
    })).toThrow('GRAPH_SOURCE_INVENTORY_REVISION_MISMATCH');
  });

  it('binds nodes only through the owning snapshot and validates source revision format', () => {
    const current = revision();
    expect(bindGraphNodeToSnapshotRevision(current, {
      snapshotId: current.snapshotId,
      nodeKey: 'symbol:foo',
      sourceRevision: `sha256:${digest('source')}`,
      treeNodeId: 'tree:foo',
      symbolVersionId: null,
    }).snapshotId).toBe(current.snapshotId);
    expect(() => bindGraphNodeToSnapshotRevision(current, {
      snapshotId: '33333333-3333-4333-8333-333333333333',
      nodeKey: 'symbol:wrong-snapshot',
      sourceRevision: null,
      treeNodeId: null,
      symbolVersionId: null,
    })).toThrow('GRAPH_SNAPSHOT_NODE_REVISION_MISMATCH');
  });

  it('rejects hash drift and receipt tampering', () => {
    const current = revision();
    expect(() => assertGraphSnapshotRevisionMatchesHashes(current, {
      topologyHash: current.topologyHash,
      policyHash: current.policyHash,
      sourceInventoryHash: digest('changed'),
    })).toThrow('GRAPH_SNAPSHOT_REVISION_HASH_MISMATCH');
    expect(() => verifyGraphSnapshotRevisionV1({ ...current, graphRevision: 'f'.repeat(64) }))
      .toThrow(/GRAPH_REVISION_MISMATCH/);
    expect(() => verifyGraphSnapshotRevisionV1({ ...current, revisionChecksum: 'e'.repeat(64) }))
      .toThrow(/GRAPH_SNAPSHOT_REVISION_CHECKSUM_MISMATCH/);
  });
});
