import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * Answers "where does an OntologyLinkedTupleV1-derived graph actually get
 * indexed" (operator question, 2026-08-31): the real, existing Postgres
 * destination is `atlas_graph_snapshots_v2`/`atlas_graph_nodes_v2`/
 * `atlas_graph_edges_v2` (sveltekit-frontend/src/lib/server/db/schema/
 * graph-authority-v2.ts), materialized via `graph-snapshot-
 * materializer.ts`. That schema already ships a `relation_event`
 * `GraphNodeType` + `GraphRelationEventSchema`/`GraphRelationParticipantSchema`
 * (sveltekit-frontend/src/lib/server/atlas/graph/graph-snapshot.ts) — an
 * n-ary-relation representation nearly identical in spirit to this
 * session's own `ProjectionOrdinalMapV1`/`NarySemanticRelation` work,
 * confirmed to already exist rather than assumed absent.
 *
 * This file is the PURE PROJECTION step only: `OntologyLinkedTupleV1` ->
 * `{ relationEvent, participants }` row shapes matching that real schema.
 * It does NOT perform the live Postgres write, does NOT create a
 * snapshot, does NOT compute a real `topologyHash` against a real graph
 * (a placeholder deterministic hash is used, clearly labeled — a real
 * one needs the whole snapshot's edge set, which is out of this file's
 * scope). That orchestration (snapshot lifecycle, hash policy, actual
 * `db.insert()` calls) is deliberately NOT attempted here — a bigger,
 * more consequential piece than this pass's remaining scope safely
 * allows; this file makes the next step's shape concrete and tested
 * rather than leaving it to be guessed at cold.
 *
 * Known, honest gap: `GraphNodeTypeSchema` (repository|package|directory|
 * file|symbol|chunk|packet|feature|concept|relation_event) does not cover
 * most of `OntologyLinkedTupleParticipantKindSchema`'s values (tool_call,
 * citation, screenshot, topology_node, ... — see ontology-linked-tuple-v1.ts).
 * Only `ast_symbol`->`symbol`, `packet`->`packet`, `concept`/`topic`->`concept`
 * have an honest mapping. Participants whose entityKind doesn't map are
 * still recorded as `GraphRelationParticipant` rows (the relation-event
 * participation edge doesn't require a typed `GraphNode` to exist for
 * them), but they are NOT also projected as a `GraphNode` — flagged in
 * the result's `unmappedNodeKinds`, not silently forced into a wrong type.
 */

const relationParticipantKindToNodeType: Record<string, string> = {
  ast_symbol: 'symbol',
  packet: 'packet',
  concept: 'concept',
  topic: 'concept',
};

export const ontologyTupleGraphProjectionInputSchema = z.object({
  snapshotId: z.string().uuid(),
  tupleId: z.string().min(1),
  label: z.string().min(1),
  sourceRef: z.string().min(1),
  confidence: z.number().min(0).max(1),
  evidenceSpan: z.object({ sourceRef: z.string().min(1), start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }).nullable(),
  participants: z.array(z.object({
    entityId: z.string().min(1),
    entityKind: z.string().min(1),
    role: z.string().min(1),
  })).min(1),
});

export type OntologyTupleGraphProjectionInputV1 = z.infer<typeof ontologyTupleGraphProjectionInputSchema>;

export interface ProjectedGraphNodeV1 {
  snapshotId: string;
  nodeKey: string;
  nodeType: string;
  packetKey: string | null;
  treeNodeId: string | null;
  sourceRef: string | null;
  properties: Record<string, unknown>;
}

export interface ProjectedGraphRelationEventV1 {
  snapshotId: string;
  relationId: string;
  relationType: string;
  sourceRef: string;
  evidenceSpan: string;
  confidence: number;
  topologyHash: string;
}

export interface ProjectedGraphRelationParticipantV1 {
  snapshotId: string;
  relationId: string;
  nodeKey: string;
  role: string;
  ordinal: number;
}

export interface OntologyTupleGraphProjectionResultV1 {
  relationNode: ProjectedGraphNodeV1;
  participantNodes: ProjectedGraphNodeV1[];
  relationEvent: ProjectedGraphRelationEventV1;
  participants: ProjectedGraphRelationParticipantV1[];
  unmappedNodeKinds: { entityId: string; entityKind: string }[];
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.keys(item as Record<string, unknown>).sort().reduce<Record<string, unknown>>((out, key) => {
        out[key] = (item as Record<string, unknown>)[key];
        return out;
      }, {});
    }
    return item;
  });
}

/** PLACEHOLDER hash — a real topologyHash needs the whole snapshot's
 * edge set, computed by the orchestration this file deliberately does
 * not implement. Labeled so nobody mistakes this for a real one. */
function placeholderTopologyHash(input: OntologyTupleGraphProjectionInputV1): string {
  return createHash('sha256').update(`PLACEHOLDER_NOT_REAL_TOPOLOGY_HASH:${stableJson(input)}`, 'utf8').digest('hex');
}

export function projectOntologyTupleToGraphRelationV1(
  input: OntologyTupleGraphProjectionInputV1,
): OntologyTupleGraphProjectionResultV1 {
  const parsed = ontologyTupleGraphProjectionInputSchema.parse(input);

  const relationNodeKey = `relation_event:${parsed.tupleId}`;
  const relationNode: ProjectedGraphNodeV1 = {
    snapshotId: parsed.snapshotId,
    nodeKey: relationNodeKey,
    nodeType: 'relation_event',
    packetKey: null,
    treeNodeId: null,
    sourceRef: parsed.sourceRef,
    properties: { tupleId: parsed.tupleId, label: parsed.label },
  };

  const participantNodes: ProjectedGraphNodeV1[] = [];
  const unmappedNodeKinds: { entityId: string; entityKind: string }[] = [];
  const participants: ProjectedGraphRelationParticipantV1[] = parsed.participants.map((participant, ordinal) => {
    const nodeType = relationParticipantKindToNodeType[participant.entityKind];
    if (nodeType) {
      participantNodes.push({
        snapshotId: parsed.snapshotId,
        nodeKey: participant.entityId,
        nodeType,
        packetKey: nodeType === 'packet' ? participant.entityId : null,
        treeNodeId: null,
        sourceRef: null,
        properties: { entityKind: participant.entityKind },
      });
    } else {
      unmappedNodeKinds.push({ entityId: participant.entityId, entityKind: participant.entityKind });
    }
    return {
      snapshotId: parsed.snapshotId,
      relationId: parsed.tupleId,
      nodeKey: participant.entityId,
      role: participant.role,
      ordinal,
    };
  });

  const relationEvent: ProjectedGraphRelationEventV1 = {
    snapshotId: parsed.snapshotId,
    relationId: parsed.tupleId,
    relationType: parsed.label,
    sourceRef: parsed.sourceRef,
    evidenceSpan: parsed.evidenceSpan ? `${parsed.evidenceSpan.sourceRef}:${parsed.evidenceSpan.start}-${parsed.evidenceSpan.end}` : 'none',
    confidence: parsed.confidence,
    topologyHash: placeholderTopologyHash(parsed),
  };

  return { relationNode, participantNodes, relationEvent, participants, unmappedNodeKinds };
}
