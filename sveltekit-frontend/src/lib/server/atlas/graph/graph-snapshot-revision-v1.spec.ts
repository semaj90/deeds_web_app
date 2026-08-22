import { describe, expect, it } from 'vitest';
import {
  buildGraphSnapshotRevisionV1,
  buildGraphSnapshotRevisionWriteV1,
  verifyGraphSnapshotRevisionV1,
} from './graph-snapshot-revision-v1';

const fixture = {
  snapshotId: '11111111-1111-4111-8111-111111111111',
  workspaceRevision: 'git:0123456789abcdef',
  sourceInventoryRevision: 'inventory:git:0123456789abcdef:abc123',
  identityContractVersion: 'identity-contract-v1',
  parserContractVersion: 'tree-sitter-typescript-v1',
  sourceInventoryHash: '1'.repeat(64),
  topologyHash: '2'.repeat(64),
  policyHash: '3'.repeat(64),
  producerRevision: 'graph-snapshot-materializer-v1',
} as const;

describe('GraphSnapshotRevisionV1', () => {
  it('derives the same logical graphRevision across different snapshot occurrence IDs', () => {
    const first = buildGraphSnapshotRevisionV1(fixture);
    const second = buildGraphSnapshotRevisionV1({
      ...fixture,
      snapshotId: '22222222-2222-4222-8222-222222222222',
    });

    expect(first.graphRevision).toBe(second.graphRevision);
    expect(first.revisionChecksum).not.toBe(second.revisionChecksum);
    expect(verifyGraphSnapshotRevisionV1(first)).toEqual(first);
    expect(verifyGraphSnapshotRevisionV1(second)).toEqual(second);
  });

  it('changes graphRevision when relevant world state changes', () => {
    const baseline = buildGraphSnapshotRevisionV1(fixture);
    const changedWorkspace = buildGraphSnapshotRevisionV1({
      ...fixture,
      workspaceRevision: 'git:fedcba9876543210',
    });
    const changedTopology = buildGraphSnapshotRevisionV1({
      ...fixture,
      topologyHash: '4'.repeat(64),
    });

    expect(changedWorkspace.graphRevision).not.toBe(baseline.graphRevision);
    expect(changedTopology.graphRevision).not.toBe(baseline.graphRevision);
  });

  it('fails closed on graphRevision or receipt checksum tampering', () => {
    const revision = buildGraphSnapshotRevisionV1(fixture);
    expect(() => verifyGraphSnapshotRevisionV1({
      ...revision,
      graphRevision: 'f'.repeat(64),
    })).toThrow(/GRAPH_REVISION_MISMATCH/);

    expect(() => verifyGraphSnapshotRevisionV1({
      ...revision,
      revisionChecksum: 'e'.repeat(64),
    })).toThrow(/GRAPH_SNAPSHOT_REVISION_CHECKSUM_MISMATCH/);
  });

  it('maps sourceInventorySnapshotId to snapshot-level sourceInventoryRevision without inventing node sourceRevision', () => {
    const write = buildGraphSnapshotRevisionWriteV1({
      snapshotId: fixture.snapshotId,
      workspaceRevision: fixture.workspaceRevision,
      sourceInventorySnapshotId: fixture.sourceInventoryRevision,
      identityContractVersion: fixture.identityContractVersion,
      parserContractVersion: fixture.parserContractVersion,
      sourceInventoryHash: fixture.sourceInventoryHash,
      topologyHash: fixture.topologyHash,
      policyHash: fixture.policyHash,
      producerRevision: fixture.producerRevision,
    });

    expect(write.columns.workspace_revision).toBe(fixture.workspaceRevision);
    expect(write.columns.source_inventory_revision).toBe(fixture.sourceInventoryRevision);
    expect(write.columns.graph_revision).toMatch(/^[a-f0-9]{64}$/);
    expect('source_revision' in write.columns).toBe(false);
  });
});
