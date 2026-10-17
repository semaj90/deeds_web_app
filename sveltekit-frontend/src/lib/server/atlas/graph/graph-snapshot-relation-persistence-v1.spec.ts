import { describe, expect, it } from 'vitest';
import {
  persistGraphSnapshotRelationsV1,
  type GraphSnapshotRelationPersistenceClientV1,
} from './graph-snapshot-relation-persistence-v1.js';
import type { GraphSnapshotMaterialization } from './graph-snapshot-materializer.js';

const snapshotId = '11111111-1111-4111-8111-111111111111';
const materialized = {
  graphSnapshot: { snapshotId },
  graphSnapshotRelationEvents: [{
    snapshotId,
    relationId: 'nary:tuple-1',
    relationType: 'CALLS',
    sourceRef: 'src/a.ts',
    evidenceSpan: '{"startByte":0,"endByte":8}',
    confidence: 0.9,
    topologyHash: 'a'.repeat(64),
  }],
  graphSnapshotRelationParticipants: [
    { snapshotId, relationId: 'nary:tuple-1', nodeKey: 'packet:a', role: 'caller', ordinal: 0 },
    { snapshotId, relationId: 'nary:tuple-1', nodeKey: 'packet:b', role: 'callee', ordinal: 1 },
    { snapshotId, relationId: 'nary:tuple-1', nodeKey: 'packet:c', role: 'context', ordinal: 2 },
  ],
} as Pick<GraphSnapshotMaterialization, 'graphSnapshot' | 'graphSnapshotRelationEvents' | 'graphSnapshotRelationParticipants'>;

function readbackClient(participantCount = 3): GraphSnapshotRelationPersistenceClientV1 & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async query(text) {
      calls.push(text.trim().split(/\s+/).slice(0, 3).join(' '));
      if (text.includes('FROM atlas_graph_relation_events_v2')) {
        return { rows: materialized.graphSnapshotRelationEvents.map((event) => ({
          snapshot_id: event.snapshotId,
          relation_id: event.relationId,
          relation_type: event.relationType,
          source_ref: event.sourceRef,
          evidence_span: event.evidenceSpan,
          confidence: event.confidence,
          topology_hash: event.topologyHash,
        })) };
      }
      if (text.includes('FROM atlas_graph_relation_participants_v2')) {
        return { rows: materialized.graphSnapshotRelationParticipants.slice(0, participantCount).map((participant) => ({
          snapshot_id: participant.snapshotId,
          relation_id: participant.relationId,
          node_key: participant.nodeKey,
          role: participant.role,
          ordinal: participant.ordinal,
        })) };
      }
      return { rows: [] };
    },
  };
}

describe('GraphSnapshot relation persistence', () => {
  it('persists events before participants and proves exact ordered readback', async () => {
    const client = readbackClient();
    const receipt = await persistGraphSnapshotRelationsV1(client, materialized);

    expect(receipt).toMatchObject({ status: 'MATCH', relationEventCount: 1, relationParticipantCount: 3 });
    expect(client.calls[0]).toContain('INSERT INTO atlas_graph_relation_events_v2');
    expect(client.calls[1]).toContain('INSERT INTO atlas_graph_relation_participants_v2');
    expect(client.calls.slice(2)).toHaveLength(2);
  });

  it('fails closed when readback drops a participant', async () => {
    await expect(persistGraphSnapshotRelationsV1(readbackClient(2), materialized))
      .rejects.toThrow('GRAPH_SNAPSHOT_RELATION_READBACK_MISMATCH');
  });

  it('rejects orphan participants before issuing SQL', async () => {
    const client = readbackClient();
    const invalid = {
      ...materialized,
      graphSnapshotRelationParticipants: [
        { snapshotId, relationId: 'nary:missing', nodeKey: 'packet:a', role: 'caller', ordinal: 0 },
      ],
    } as Pick<GraphSnapshotMaterialization, 'graphSnapshot' | 'graphSnapshotRelationEvents' | 'graphSnapshotRelationParticipants'>;

    await expect(persistGraphSnapshotRelationsV1(client, invalid))
      .rejects.toThrow('GRAPH_SNAPSHOT_RELATION_ORPHAN_PARTICIPANT');
    expect(client.calls).toEqual([]);
  });

  it('readbacks empty relation sets against the owning snapshot', async () => {
    const client: GraphSnapshotRelationPersistenceClientV1 & { calls: string[] } = {
      calls: [],
      async query(text) {
        this.calls.push(text.trim().split(/\s+/).slice(0, 3).join(' '));
        return { rows: [] };
      },
    };
    const empty = {
      graphSnapshot: { snapshotId },
      graphSnapshotRelationEvents: [],
      graphSnapshotRelationParticipants: [],
    } as Pick<GraphSnapshotMaterialization, 'graphSnapshot' | 'graphSnapshotRelationEvents' | 'graphSnapshotRelationParticipants'>;

    const receipt = await persistGraphSnapshotRelationsV1(client, empty);

    expect(receipt).toMatchObject({ status: 'MATCH', relationEventCount: 0, relationParticipantCount: 0 });
    expect(client.calls).toHaveLength(2);
  });

  it('rejects rows bound to a different snapshot before issuing SQL', async () => {
    const client = readbackClient();
    const invalid = {
      ...materialized,
      graphSnapshotRelationEvents: materialized.graphSnapshotRelationEvents.map((event) => ({
        ...event,
        snapshotId: '22222222-2222-4222-8222-222222222222',
      })),
    } as Pick<GraphSnapshotMaterialization, 'graphSnapshot' | 'graphSnapshotRelationEvents' | 'graphSnapshotRelationParticipants'>;

    await expect(persistGraphSnapshotRelationsV1(client, invalid))
      .rejects.toThrow('GRAPH_SNAPSHOT_RELATION_SNAPSHOT_ID_MISMATCH');
    expect(client.calls).toEqual([]);
  });
});
