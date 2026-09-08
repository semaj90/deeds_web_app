import { createHyperedgeV1, type HyperedgeV1 } from '../../graph/hyperedge-contract.js';
import { verifyNaryFactProposalChecksumV1, type NaryFactProposalV1 } from './nary-fact-proposal-v1.js';

/**
 * Converts only an admitted proposal to the existing HyperedgeV1 contract.
 * Entity metadata remains proposal-side; the canonical hyperedge carries the
 * role-labelled IDs and revision/evidence envelope required by persistence.
 */
export function materializeAdmittedNaryFactProposalV1(
  proposal: NaryFactProposalV1,
): HyperedgeV1 {
  if (proposal.admission !== 'ADMITTED') throw new Error(`NARY_PROPOSAL_NOT_ADMITTED:${proposal.admission}`);
  if (!verifyNaryFactProposalChecksumV1(proposal)) throw new Error('NARY_PROPOSAL_CHECKSUM_INVALID');

  return createHyperedgeV1({
    predicate: proposal.predicate,
    participants: proposal.participants.map((participant) => ({
      canonicalId: participant.canonicalId,
      role: participant.role,
      ...(participant.ordinal !== undefined ? { ordinal: participant.ordinal } : {}),
    })),
    evidenceRefs: proposal.evidenceRefs,
    workspaceRevision: proposal.workspaceRevision,
    graphRevision: proposal.graphRevision,
    sourceRevision: proposal.sourceRevision,
    producerRevision: proposal.producerRevision,
  });
}
