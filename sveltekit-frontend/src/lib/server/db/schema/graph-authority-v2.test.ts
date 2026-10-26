import { describe, expect, it } from 'vitest';
import { getTableName } from 'drizzle-orm';
import {
  graphAuthorityRunsV2,
  graphAuthorityScoresV2,
  graphEdgesV2,
  graphNodesV2,
  graphRelationEventsV2,
  graphRelationParticipantsV2,
  graphResolutionIssuesV2,
  graphSnapshotsV2,
} from './graph-authority-v2';

describe('graph authority v2 schema', () => {
  it('exports the expected table names', () => {
    expect(getTableName(graphSnapshotsV2)).toBe('atlas_graph_snapshots_v2');
    expect(getTableName(graphNodesV2)).toBe('atlas_graph_nodes_v2');
    expect(getTableName(graphEdgesV2)).toBe('atlas_graph_edges_v2');
    expect(getTableName(graphRelationEventsV2)).toBe('atlas_graph_relation_events_v2');
    expect(getTableName(graphRelationParticipantsV2)).toBe('atlas_graph_relation_participants_v2');
    expect(getTableName(graphResolutionIssuesV2)).toBe('atlas_graph_resolution_issues_v2');
    expect(getTableName(graphAuthorityRunsV2)).toBe('atlas_graph_authority_runs_v2');
    expect(getTableName(graphAuthorityScoresV2)).toBe('atlas_graph_authority_scores_v2');
  });

  it('keeps the canonical graph columns visible to the app schema', () => {
    expect(graphSnapshotsV2.snapshotId.name).toBe('snapshot_id');
    expect(graphSnapshotsV2.workspaceRevision.name).toBe('workspace_revision');
    expect(graphSnapshotsV2.sourceInventoryRevision.name).toBe('source_inventory_revision');
    expect(graphSnapshotsV2.graphRevision.name).toBe('graph_revision');
    expect(graphSnapshotsV2.revisionChecksum.name).toBe('revision_checksum');
    expect(graphNodesV2.packetKey.name).toBe('packet_key');
    expect(graphNodesV2.treeNodeId.name).toBe('tree_node_id');
    expect(graphNodesV2.sourceRevision.name).toBe('source_revision');
    expect(graphEdgesV2.provenance.name).toBe('provenance');
    expect(graphResolutionIssuesV2.issueFingerprint.name).toBe('issue_fingerprint');
    expect(graphAuthorityRunsV2.algorithmVersion.name).toBe('algorithm_version');
    expect(graphAuthorityScoresV2.normalizationAppliedBy.name).toBe('normalization_applied_by');
  });
});
