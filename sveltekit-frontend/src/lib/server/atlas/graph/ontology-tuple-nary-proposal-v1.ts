import type { OntologyLinkedTupleV1 } from '../contracts/ontology-linked-tuple-v1.js';
import {
  createNaryFactProposalV1,
  type NaryFactProposalV1,
} from './nary-fact-proposal-v1.js';
import {
  resolveParticipantObservationsV1,
  type CanonicalParticipantOwnerV1,
  type ParticipantResolutionBatchV1,
} from './participant-resolver-v1.js';

export interface OntologyTupleNaryProposalContextV1 {
  workspaceRevision: string;
  graphRevision: string;
  producerRevision: string;
}

export interface OntologyTupleNaryProposalResultV1 extends ParticipantResolutionBatchV1 {
  proposal: NaryFactProposalV1 | null;
  reasonCode?: string;
}

/** Converts only a current, verified, genuinely n-ary ontology tuple into a proposal. */
export function proposeOntologyLinkedTupleNaryFactV1(
  tuple: OntologyLinkedTupleV1,
  context: OntologyTupleNaryProposalContextV1,
  owners: readonly CanonicalParticipantOwnerV1[],
): OntologyTupleNaryProposalResultV1 {
  if (tuple.evidenceState !== 'ACTIVE_VERIFIED') {
    return { status: 'REJECTED', participants: [], resolutions: [], unresolvedFields: [], evidenceRefs: tuple.evidenceRefs, proposal: null, reasonCode: 'ONTOLOGY_TUPLE_NOT_ACTIVE_VERIFIED' };
  }
  if (!tuple.packetKey || !tuple.provenance.sourceRevision || !tuple.provenance.graphRevision) {
    return { status: 'REJECTED', participants: [], resolutions: [], unresolvedFields: [], evidenceRefs: tuple.evidenceRefs, proposal: null, reasonCode: 'ONTOLOGY_TUPLE_LINEAGE_INCOMPLETE' };
  }
  if (tuple.provenance.graphRevision !== context.graphRevision) {
    return { status: 'REJECTED', participants: [], resolutions: [], unresolvedFields: [], evidenceRefs: tuple.evidenceRefs, proposal: null, reasonCode: 'ONTOLOGY_TUPLE_GRAPH_REVISION_MISMATCH' };
  }

  const resolutions = resolveParticipantObservationsV1(tuple.participants.map((participant) => ({
    field: participant.entityKind,
    role: participant.role,
    entityType: participant.entityKind.toUpperCase(),
    canonicalId: participant.entityId,
    evidenceRefs: tuple.evidenceRefs,
    literalValue: participant.label ?? null,
  })), owners);
  if (resolutions.status !== 'RESOLVED' || resolutions.participants.length < 3) {
    return { ...resolutions, proposal: null, reasonCode: resolutions.participants.length < 3 ? 'ONTOLOGY_TUPLE_ARITY_BELOW_THREE' : 'ONTOLOGY_TUPLE_PARTICIPANTS_NOT_PROVEN' };
  }

  return {
    ...resolutions,
    proposal: createNaryFactProposalV1({
      sourceRef: tuple.sourceRef,
      sourceRevision: tuple.provenance.sourceRevision,
      workspaceRevision: context.workspaceRevision,
      packetKey: tuple.packetKey,
      graphRevision: context.graphRevision,
      producerRevision: context.producerRevision,
      predicate: `ONTOLOGY_${tuple.labelKind.toUpperCase()}`,
      participants: resolutions.participants,
      evidenceRefs: tuple.evidenceRefs,
      admission: 'PROPOSED',
    }),
  };
}
