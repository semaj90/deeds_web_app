import type { HyperedgeV1 } from '../../graph/hyperedge-contract.js';
import { projectNaryRelationForRanking, type NaryRelationV1 } from '../../graph/nary-ranking-projection.js';
import {
  buildIncidenceProjectionV1,
  type IncidenceProjectionEntityInput,
  type IncidenceProjectionV1,
} from '../graph/incidence-projection-v1.js';
import type { HyperRelationV1 } from '../graph/hyper-relation-v1.js';

function orderedParticipants(edge: HyperedgeV1) {
  return edge.participants
    .map((participant, index) => ({
      canonicalId: participant.canonicalId,
      role: participant.role,
      ordinal: participant.ordinal ?? index,
    }))
    .sort((a, b) => a.ordinal - b.ordinal || a.role.localeCompare(b.role) || a.canonicalId.localeCompare(b.canonicalId));
}

/** Compatibility view only. HyperedgeV1 remains the canonical n-ary truth. */
export function hyperedgeToLegacyHyperRelationV1(edge: HyperedgeV1): HyperRelationV1 {
  if (edge.evidenceRefs.length === 0) {
    throw new Error(`HYPEREDGE_GRAPH_PROJECTION_REQUIRES_EVIDENCE:${edge.hyperedgeId}`);
  }
  return {
    schema: 'atlas.hyper-relation.v1',
    relationId: edge.hyperedgeId,
    relationType: edge.predicate,
    participants: orderedParticipants(edge),
    evidenceRefs: [...edge.evidenceRefs],
    workspaceRevision: edge.workspaceRevision,
    sourceRevision: edge.sourceRevision,
    producerRevision: edge.producerRevision,
  };
}

export function projectHyperedgesToIncidenceV1(input: {
  workspaceRevision: string;
  projectionRevision: string;
  entities: readonly IncidenceProjectionEntityInput[];
  hyperedges: readonly HyperedgeV1[];
}): IncidenceProjectionV1 {
  for (const edge of input.hyperedges) {
    if (edge.workspaceRevision !== input.workspaceRevision) {
      throw new Error(`HYPEREDGE_WORKSPACE_REVISION_MISMATCH:${edge.hyperedgeId}`);
    }
  }
  return buildIncidenceProjectionV1({
    workspaceRevision: input.workspaceRevision,
    projectionRevision: input.projectionRevision,
    entities: input.entities,
    relations: input.hyperedges.map(hyperedgeToLegacyHyperRelationV1),
  });
}

export function hyperedgeToNaryRankingRelationV1(edge: HyperedgeV1): NaryRelationV1 {
  return {
    relationId: edge.hyperedgeId,
    predicate: edge.predicate,
    participants: orderedParticipants(edge).map((participant) => ({
      canonicalId: participant.canonicalId,
      role: participant.role,
      weight: 1,
    })),
  };
}

/** Relation-node projection: never clique-expand canonical n-ary evidence. */
export function projectHyperedgeForRankingV1(edge: HyperedgeV1) {
  return projectNaryRelationForRanking(hyperedgeToNaryRankingRelationV1(edge));
}
