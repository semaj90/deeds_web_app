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
 * This file is the PURE PROJECTION step: `OntologyLinkedTupleV1` ->
 * `{ relationNode, participantNodes, relationEvent, participants }` row
 * shapes matching that real schema, with a REAL `topologyHash` (sha256
 * over the actual write-eligible content, not a placeholder — see
 * `projectOntologyTupleToGraphRelationV1`'s own computation). It does
 * NOT perform the live Postgres write or create a snapshot — that
 * orchestration lives in `ontology-tuple-graph-writer-v1.ts` (a sibling
 * file, built but explicitly NOT_PROVEN against a live database this
 * session — see that file's own docstring for why).
 *
 * Real, hard constraint found (not a design choice — a schema FK):
 * `atlas_graph_relation_participants_v2.nodeFk` REQUIRES a
 * participant's `nodeKey` to already exist as a `atlas_graph_nodes_v2`
 * row in the same snapshot. `GraphNodeTypeSchema` (repository|package|
 * directory|file|symbol|chunk|packet|feature|concept|relation_event)
 * does not cover most of `OntologyLinkedTupleParticipantKindSchema`'s
 * values (`tool_call`, `citation`, `screenshot`, `topology_node`, ... —
 * see `ontology-linked-tuple-v1.ts`). Only `ast_symbol`->`symbol`,
 * `packet`->`packet`, `concept`/`topic`->`concept` have an honest
 * mapping. **Participants whose `entityKind` doesn't map are EXCLUDED
 * from the write-eligible `participants`/`participantNodes` sets
 * entirely** (writing a row that violates the FK isn't an option;
 * inventing a new `GraphNodeType` value unilaterally isn't either — a
 * schema-owner decision, same category as every other cross-cutting
 * choice held this session). They're fully reported in
 * `unmappedNodeKinds`, never silently dropped.
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
  // FK constraint discovered directly (not assumed): atlas_graph_relation_
  // participants_v2.nodeFk REQUIRES the participant's nodeKey to already
  // exist as a atlas_graph_nodes_v2 row for the same snapshot. Since
  // GraphNodeTypeSchema has no honest type for every OntologyLinkedTuple
  // participant kind (tool_call/citation/etc.), participants that can't
  // be honestly mapped are EXCLUDED from the write-eligible `participants`
  // set entirely — writing a GraphRelationParticipant row that violates
  // the FK isn't an option, and inventing a new GraphNodeType value
  // unilaterally isn't either (that's the schema owner's call, same
  // category as every other cross-cutting decision held this session).
  // They're still reported in full, not silently dropped.
  const participants: ProjectedGraphRelationParticipantV1[] = [];
  parsed.participants.forEach((participant, ordinal) => {
    const nodeType = relationParticipantKindToNodeType[participant.entityKind];
    if (!nodeType) {
      unmappedNodeKinds.push({ entityId: participant.entityId, entityKind: participant.entityKind });
      return;
    }
    participantNodes.push({
      snapshotId: parsed.snapshotId,
      nodeKey: participant.entityId,
      nodeType,
      packetKey: nodeType === 'packet' ? participant.entityId : null,
      treeNodeId: null,
      sourceRef: null,
      properties: { entityKind: participant.entityKind },
    });
    participants.push({
      snapshotId: parsed.snapshotId,
      relationId: parsed.tupleId,
      nodeKey: participant.entityId,
      role: participant.role,
      ordinal,
    });
  });

  // Real topologyHash — the whole write-set's actual content (relation
  // node + eligible participant nodes + participant rows), computed now
  // that the full write-eligible set is known. No longer a placeholder:
  // this IS the real deterministic hash of what this function would
  // actually write, matching `topologyHash()`'s own role in
  // graph-snapshot.ts for the canonical packet/tree-node graph.
  const topologyHash = createHash('sha256')
    .update(stableJson({ relationNode, participantNodes, participants: participants.map((p) => ({ nodeKey: p.nodeKey, role: p.role, ordinal: p.ordinal })) }), 'utf8')
    .digest('hex');

  const relationEvent: ProjectedGraphRelationEventV1 = {
    snapshotId: parsed.snapshotId,
    relationId: parsed.tupleId,
    relationType: parsed.label,
    sourceRef: parsed.sourceRef,
    evidenceSpan: parsed.evidenceSpan ? `${parsed.evidenceSpan.sourceRef}:${parsed.evidenceSpan.start}-${parsed.evidenceSpan.end}` : 'none',
    confidence: parsed.confidence,
    topologyHash,
  };

  return { relationNode, participantNodes, relationEvent, participants, unmappedNodeKinds };
}
