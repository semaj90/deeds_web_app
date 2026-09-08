import {
  createNaryFactProposalV1,
  NaryFactProposalV1Schema,
  verifyNaryFactProposalChecksumV1,
  type NaryFactProposalV1,
} from './nary-fact-proposal-v1.js';
import {
  resolveParticipantObservationsV1,
  type CanonicalParticipantOwnerV1,
} from './participant-resolver-v1.js';

export interface NaryFactAdmissionInputV1 {
  proposal: NaryFactProposalV1;
  owners: readonly CanonicalParticipantOwnerV1[];
  expectedWorkspaceRevision: string;
  expectedGraphRevision: string;
  currentness: GraphifyCurrentnessProofV1;
}

export interface GraphifyCurrentnessProofV1 {
  status: 'GRAPHIFY_RUN_OWNER_COMPLETE';
  workspaceRevision: string;
  graphRevision: string;
  authoritativeGraphRun: true;
}

/**
 * Pure proposal admission gate. It returns an ADMITTED proposal only after
 * revision, checksum, evidence, and every participant owner are proven.
 * Persistence remains a separate authorized writer/readback operation.
 */
export function admitNaryFactProposalV1(input: NaryFactAdmissionInputV1): NaryFactProposalV1 {
  const proposal = NaryFactProposalV1Schema.parse(input.proposal);
  if (input.currentness.status !== 'GRAPHIFY_RUN_OWNER_COMPLETE' || !input.currentness.authoritativeGraphRun) {
    throw new Error('NARY_PROPOSAL_GRAPHIFY_CURRENTNESS_UNPROVEN');
  }
  if (input.currentness.workspaceRevision !== input.expectedWorkspaceRevision
    || input.currentness.graphRevision !== input.expectedGraphRevision) {
    throw new Error('NARY_PROPOSAL_GRAPHIFY_CURRENTNESS_MISMATCH');
  }
  if (!verifyNaryFactProposalChecksumV1(proposal)) throw new Error('NARY_PROPOSAL_CHECKSUM_INVALID');
  if (proposal.admission !== 'PROPOSED') throw new Error(`NARY_PROPOSAL_NOT_PROPOSED:${proposal.admission}`);
  if (proposal.workspaceRevision !== input.expectedWorkspaceRevision) {
    throw new Error('NARY_PROPOSAL_WORKSPACE_REVISION_MISMATCH');
  }
  if (proposal.graphRevision !== input.expectedGraphRevision) {
    throw new Error('NARY_PROPOSAL_GRAPH_REVISION_MISMATCH');
  }
  if (proposal.evidenceRefs.length === 0) throw new Error('NARY_PROPOSAL_EVIDENCE_REQUIRED');

  const resolutions = resolveParticipantObservationsV1(
    proposal.participants.map((participant) => ({
      field: participant.role,
      role: participant.role,
      entityType: participant.entityType,
      canonicalId: participant.canonicalId,
      entityRevision: participant.entityRevision ?? null,
      evidenceRefs: proposal.evidenceRefs,
    })),
    input.owners,
  );
  if (resolutions.status !== 'RESOLVED' || resolutions.participants.length !== proposal.participants.length) {
    throw new Error(`NARY_PROPOSAL_PARTICIPANTS_NOT_PROVEN:${resolutions.status}`);
  }

  return createNaryFactProposalV1({
    sourceRef: proposal.sourceRef,
    sourceRevision: proposal.sourceRevision,
    workspaceRevision: proposal.workspaceRevision,
    packetKey: proposal.packetKey,
    graphRevision: proposal.graphRevision,
    producerRevision: proposal.producerRevision,
    predicate: proposal.predicate,
    participants: proposal.participants,
    evidenceRefs: proposal.evidenceRefs,
    admission: 'ADMITTED',
  });
}
