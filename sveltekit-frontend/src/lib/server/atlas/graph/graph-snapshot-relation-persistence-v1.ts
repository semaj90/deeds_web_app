import { createHash } from 'node:crypto';
import type { GraphSnapshotMaterialization } from './graph-snapshot-materializer.js';

export interface GraphSnapshotRelationPersistenceClientV1 {
  query: (text: string, values?: readonly unknown[]) => Promise<{
    rows: Array<Record<string, unknown>>;
  }>;
}

export type GraphSnapshotRelationReadbackV1 = {
  status: 'MATCH';
  relationEventCount: number;
  relationParticipantCount: number;
  checksum: string;
};

function digestRelations(events: readonly Record<string, unknown>[], participants: readonly Record<string, unknown>[]): string {
  const normalizedEvents = events.map((event) => [
    String(event.snapshotId ?? event.snapshot_id),
    String(event.relationId ?? event.relation_id),
    String(event.relationType ?? event.relation_type),
    String(event.sourceRef ?? event.source_ref),
    String(event.evidenceSpan ?? event.evidence_span),
    Number(event.confidence),
    String(event.topologyHash ?? event.topology_hash),
  ]).sort((left, right) => String(left[1]).localeCompare(String(right[1])));
  const normalizedParticipants = participants.map((participant) => [
    String(participant.snapshotId ?? participant.snapshot_id),
    String(participant.relationId ?? participant.relation_id),
    String(participant.nodeKey ?? participant.node_key),
    String(participant.role),
    Number(participant.ordinal),
  ]).sort((left, right) => String(left[1]).localeCompare(String(right[1]))
    || Number(left[4]) - Number(right[4])
    || String(left[3]).localeCompare(String(right[3]))
    || String(left[2]).localeCompare(String(right[2])));
  return createHash('sha256')
    .update(JSON.stringify({ events: normalizedEvents, participants: normalizedParticipants }), 'utf8')
    .digest('hex');
}

export async function persistGraphSnapshotRelationsV1(
  client: GraphSnapshotRelationPersistenceClientV1,
  run: Pick<GraphSnapshotMaterialization, 'graphSnapshot' | 'graphSnapshotRelationEvents' | 'graphSnapshotRelationParticipants'>,
): Promise<GraphSnapshotRelationReadbackV1> {
  const events = run.graphSnapshotRelationEvents;
  const participants = run.graphSnapshotRelationParticipants;
  const snapshotId = run.graphSnapshot.snapshotId;
  if (events.some((event) => event.snapshotId !== snapshotId)
    || participants.some((participant) => participant.snapshotId !== snapshotId)) {
    throw new Error('GRAPH_SNAPSHOT_RELATION_SNAPSHOT_ID_MISMATCH');
  }
  if (events.length > 0 && participants.length === 0) {
    throw new Error('GRAPH_SNAPSHOT_RELATION_PARTICIPANTS_MISSING');
  }
  if (participants.some((participant) => !events.some((event) => event.snapshotId === participant.snapshotId
    && event.relationId === participant.relationId))) {
    throw new Error('GRAPH_SNAPSHOT_RELATION_ORPHAN_PARTICIPANT');
  }

  const batchSize = 750;
  for (let offset = 0; offset < events.length; offset += batchSize) {
    const batch = events.slice(offset, offset + batchSize);
    const values: unknown[] = [];
    const placeholders = batch.map((event, index) => {
      const parameterOffset = index * 7;
      values.push(event.snapshotId, event.relationId, event.relationType, event.sourceRef,
        event.evidenceSpan, event.confidence, event.topologyHash);
      return `(${Array.from({ length: 7 }, (_, column) => `$${parameterOffset + column + 1}`).join(',')})`;
    }).join(',');
    await client.query(`INSERT INTO atlas_graph_relation_events_v2
      (snapshot_id,relation_id,relation_type,source_ref,evidence_span,confidence,topology_hash)
      VALUES ${placeholders}`, values);
  }
  for (let offset = 0; offset < participants.length; offset += batchSize) {
    const batch = participants.slice(offset, offset + batchSize);
    const values: unknown[] = [];
    const placeholders = batch.map((participant, index) => {
      const parameterOffset = index * 5;
      values.push(participant.snapshotId, participant.relationId, participant.nodeKey, participant.role, participant.ordinal);
      return `(${Array.from({ length: 5 }, (_, column) => `$${parameterOffset + column + 1}`).join(',')})`;
    }).join(',');
    await client.query(`INSERT INTO atlas_graph_relation_participants_v2
      (snapshot_id,relation_id,node_key,role,ordinal)
      VALUES ${placeholders}`, values);
  }

  const [eventReadback, participantReadback] = await Promise.all([
    client.query(`
      SELECT snapshot_id, relation_id, relation_type, source_ref, evidence_span, confidence, topology_hash
      FROM atlas_graph_relation_events_v2
      WHERE snapshot_id = $1
      ORDER BY relation_id
    `, [snapshotId]),
    client.query(`
      SELECT snapshot_id, relation_id, node_key, role, ordinal
      FROM atlas_graph_relation_participants_v2
      WHERE snapshot_id = $1
      ORDER BY relation_id, ordinal, role, node_key
    `, [snapshotId]),
  ]);
  const expectedChecksum = digestRelations(events, participants);
  const observedChecksum = digestRelations(eventReadback.rows, participantReadback.rows);
  if (eventReadback.rows.length !== events.length || participantReadback.rows.length !== participants.length
    || observedChecksum !== expectedChecksum) {
    throw new Error(`GRAPH_SNAPSHOT_RELATION_READBACK_MISMATCH:events=${eventReadback.rows.length}/${events.length}:participants=${participantReadback.rows.length}/${participants.length}`);
  }
  return {
    status: 'MATCH',
    relationEventCount: eventReadback.rows.length,
    relationParticipantCount: participantReadback.rows.length,
    checksum: expectedChecksum,
  };
}
