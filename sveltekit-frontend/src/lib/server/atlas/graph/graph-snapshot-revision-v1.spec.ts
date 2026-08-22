import { describe, expect, it } from 'vitest';
import {
  buildGraphSnapshotRevisionV1,
  buildGraphSnapshotRevisionWriteV1,
  verifyGraphSnapshotRevisionV1,
} from './graph-snapshot-revision-v1';

const fixture = {
  snapshotId: '11111111-1111-4111-8111-111111111111',
  workspaceRevision: `sha256:${'a'.repeat(64)}`,
  sourceInventoryRevision: `sha256:${'1'.repeat(64)}`,
  identityContractVersion: 'identity-contract-v1',
  parserContractVersion: 'tree-sitter-typescript-v1',
  sourceInventoryHash: '1'.repeat(64),
  topologyHash: '2'.repeat(64),
  policyHash: '3'.repeat(64),
  producerRevision: 'graph-snapshot-materializer-v2',
} as const;

describe('GraphSnapshotRevisionV1', () => {
  it('derives the same logical graphRevision across different snapshot occurrence IDs', () => {
    const first = buildGraphSnapshotRevisionV1(fixture);
    const second = buildGraphSnapshotRevisionV1({ ...fixture, snapshotId: '22222222-2222-4222-8222-222222222222' });
    expect(first.graphRevision).toBe(second.graphRevision);
    expect(first.revisionChecksum).not.toBe(second.revisionChecksum);
    expect(verifyGraphSnapshotRevisionV1(first)).toEqual(first);
  });

  it('changes graphRevision when manifest workspace or topology changes', () => {
    const baseline = buildGraphSnapshotRevisionV1(fixture);
    const changedWorkspace = buildGraphSnapshotRevisionV1({ ...fixture, workspaceRevision: `sha256:${'b'.repeat(64)}` });
    const changedTopology = buildGraphSnapshotRevisionV1({ ...fixture, topologyHash: '4'.repeat(64) });
    expect(changedWorkspace.graphRevision).not.toBe(baseline.graphRevision);
    expect(changedTopology.graphRevision).not.toBe(baseline.graphRevision);
  });

  it('rejects Git/prose workspace revisions and source-inventory drift', () => {
    expect(() => buildGraphSnapshotRevisionV1({ ...fixture, workspaceRevision: 'git:deadbeef' })).toThrow();
    expect(() => buildGraphSnapshotRevisionV1({ ...fixture, sourceInventoryRevision: `sha256:${'9'.repeat(64)}` }))
      .toThrow(/GRAPH_SOURCE_INVENTORY_REVISION_MISMATCH/);
  });

  it('fails closed on graphRevision or receipt checksum tampering', () => {
    const revision = buildGraphSnapshotRevisionV1(fixture);
    expect(() => verifyGraphSnapshotRevisionV1({ ...revision, graphRevision: 'f'.repeat(64) })).toThrow(/GRAPH_REVISION_MISMATCH/);
    expect(() => verifyGraphSnapshotRevisionV1({ ...revision, revisionChecksum: 'e'.repeat(64) }))
      .toThrow(/GRAPH_SNAPSHOT_REVISION_CHECKSUM_MISMATCH/);
  });

  it('derives sourceInventoryRevision from sourceInventoryHash without inventing node sourceRevision', () => {
    const write = buildGraphSnapshotRevisionWriteV1({
      snapshotId: fixture.snapshotId,
      workspaceRevision: fixture.workspaceRevision,
      identityContractVersion: fixture.identityContractVersion,
      parserContractVersion: fixture.parserContractVersion,
      sourceInventoryHash: fixture.sourceInventoryHash,
      topologyHash: fixture.topologyHash,
      policyHash: fixture.policyHash,
      producerRevision: fixture.producerRevision,
    });
    expect(write.columns.workspace_revision).toBe(fixture.workspaceRevision);
    expect(write.columns.source_inventory_revision).toBe(`sha256:${fixture.sourceInventoryHash}`);
    expect(write.columns.graph_revision).toMatch(/^[a-f0-9]{64}$/);
    expect('source_revision' in write.columns).toBe(false);
  });
});
