import { and, eq, sql } from 'drizzle-orm';
import {
  graphAuthorityRunsV2,
  graphAuthorityScoresV2,
  graphNodesV2,
  graphRelationEventsV2,
  graphRelationParticipantsV2,
  graphResolutionIssuesV2,
  graphSnapshotsV2,
  graphSnapshotV2StatusValues,
  type GraphAuthorityBand,
  type GraphAuthorityEngine,
  type GraphAuthorityRunStatus,
  type GraphResolutionIssueV2Status,
  type GraphSnapshotV2Status,
  type NewGraphAuthorityRunV2Row,
  type NewGraphAuthorityScoreV2Row,
  type NewGraphNodeV2Row,
  type NewGraphRelationEventV2Row,
  type NewGraphRelationParticipantV2Row,
  type NewGraphResolutionIssueV2Row,
  type NewGraphSnapshotV2Row,
} from './schema/graph-authority-v2.js';

export type { GraphAuthorityBand, GraphAuthorityEngine, GraphAuthorityRunStatus, GraphResolutionIssueV2Status, GraphSnapshotV2Status };
export { graphSnapshotV2StatusValues } from './schema/graph-authority-v2.js';

export function createGraphAuthorityV2Repository(database: any) {
  async function createGraphSnapshotV2(input: NewGraphSnapshotV2Row): Promise<void> {
    await database.insert(graphSnapshotsV2).values(input);
  }

  async function upsertGraphResolutionIssueV2(input: NewGraphResolutionIssueV2Row): Promise<void> {
    await database
      .insert(graphResolutionIssuesV2)
      .values(input)
      .onConflictDoUpdate({
        target: [graphResolutionIssuesV2.snapshotId, graphResolutionIssuesV2.issueFingerprint],
        set: {
          packetKey: input.packetKey ?? null,
          nodeKey: input.nodeKey ?? null,
          treeNodeId: input.treeNodeId ?? null,
          sourceRef: input.sourceRef ?? null,
          issueType: input.issueType,
          issueStatus: input.issueStatus,
          exclusionStage: input.exclusionStage,
          candidateMatches: input.candidateMatches,
          evidence: input.evidence,
          occurrenceCount: sql`${graphResolutionIssuesV2.occurrenceCount} + 1`,
          lastSeenAt: sql`now()`,
          resolvedAt: input.resolvedAt ?? null,
          topologyHash: input.topologyHash,
        },
      });
  }

  async function validateGraphSnapshotV2(
    snapshotId: string,
    counts: { nodes: number; edges: number; relations: number; exclusions: number; unresolved: number },
  ): Promise<void> {
    const updated = await database
      .update(graphSnapshotsV2)
      .set({
        status: 'VALIDATED',
        nodeCount: counts.nodes,
        edgeCount: counts.edges,
        relationEventCount: counts.relations,
        excludedCount: counts.exclusions,
        unresolvedCount: counts.unresolved,
        finalizedAt: sql`now()`,
      })
      .where(and(eq(graphSnapshotsV2.snapshotId, snapshotId), eq(graphSnapshotsV2.status, 'BUILDING')))
      .returning({ snapshotId: graphSnapshotsV2.snapshotId });

    if (updated.length !== 1) {
      throw new Error('Only a BUILDING graph snapshot can be validated.');
    }
  }

  async function persistGraphAuthorityRunV2(input: NewGraphAuthorityRunV2Row): Promise<void> {
    const [snapshot] = await database
      .select({ status: graphSnapshotsV2.status, topologyHash: graphSnapshotsV2.topologyHash })
      .from(graphSnapshotsV2)
      .where(eq(graphSnapshotsV2.snapshotId, input.snapshotId));

    if (!snapshot) {
      throw new Error('Authority run references an unknown graph snapshot.');
    }

    if (snapshot.status !== 'VALIDATED') {
      throw new Error('Authority runs require a VALIDATED graph snapshot.');
    }

    if (snapshot.topologyHash !== input.topologyHash) {
      throw new Error('Authority run topology hash does not match its graph snapshot.');
    }

    if (!input.didConverge) {
      throw new Error('Authority runs must converge before they can persist as PASSED.');
    }

    await database.insert(graphAuthorityRunsV2).values(input);
  }

  async function persistGraphAuthorityScoresV2(rows: NewGraphAuthorityScoreV2Row[]): Promise<void> {
    if (rows.length === 0) return;
    await database.insert(graphAuthorityScoresV2).values(rows);
  }

  /**
   * Writes one ontology-tuple relation event into the graph-authority-v2
   * schema: upserts the relation_event node + its FK-eligible participant
   * nodes, then the relation event row, then the participant rows.
   * Input is the exact output shape of
   * `projectOntologyTupleToGraphRelationV1()` (`packages/parent-atlas`) -
   * this function performs no projection logic of its own, only writes
   * what it's given. Answers this session's own "where does it get
   * indexed, and who actually writes it" question end to end.
   *
   * NOT_PROVEN against a live database in this pass — built as real,
   * type-checked code (not a stub) but deliberately not executed here.
   * Writing to a live/shared Postgres instance under session context
   * pressure, without being able to carefully verify the target
   * environment first, is exactly the kind of consequential action this
   * repo's own instructions say to slow down for, not rush through.
   * Callers should treat this as CREATED, promote to DRY_RUN_PROVEN by
   * running it against a real dev database and inspecting the rows
   * written, before ever calling it from a live pipeline.
   */
  async function writeOntologyTupleRelationGraphV2(input: {
    relationNode: NewGraphNodeV2Row;
    participantNodes: NewGraphNodeV2Row[];
    relationEvent: NewGraphRelationEventV2Row;
    participants: NewGraphRelationParticipantV2Row[];
  }): Promise<void> {
    const allNodes = [input.relationNode, ...input.participantNodes];
    for (const node of allNodes) {
      await database
        .insert(graphNodesV2)
        .values(node)
        .onConflictDoUpdate({
          target: [graphNodesV2.snapshotId, graphNodesV2.nodeKey],
          set: { nodeType: node.nodeType, packetKey: node.packetKey ?? null, treeNodeId: node.treeNodeId ?? null, sourceRef: node.sourceRef ?? null, properties: node.properties },
        });
    }

    await database
      .insert(graphRelationEventsV2)
      .values(input.relationEvent)
      .onConflictDoUpdate({
        target: [graphRelationEventsV2.snapshotId, graphRelationEventsV2.relationId],
        set: {
          relationType: input.relationEvent.relationType,
          sourceRef: input.relationEvent.sourceRef,
          evidenceSpan: input.relationEvent.evidenceSpan,
          confidence: input.relationEvent.confidence,
          topologyHash: input.relationEvent.topologyHash,
        },
      });

    if (input.participants.length === 0) return;
    for (const participant of input.participants) {
      await database
        .insert(graphRelationParticipantsV2)
        .values(participant)
        .onConflictDoUpdate({
          target: [graphRelationParticipantsV2.snapshotId, graphRelationParticipantsV2.relationId, graphRelationParticipantsV2.nodeKey, graphRelationParticipantsV2.role],
          set: { ordinal: participant.ordinal },
        });
    }
  }

  return {
    createGraphSnapshotV2,
    upsertGraphResolutionIssueV2,
    validateGraphSnapshotV2,
    persistGraphAuthorityRunV2,
    persistGraphAuthorityScoresV2,
    writeOntologyTupleRelationGraphV2,
  };
}
