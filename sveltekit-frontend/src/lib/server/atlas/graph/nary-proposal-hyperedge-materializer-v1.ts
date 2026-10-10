import { createHyperedgeV1, type HyperedgeV1 } from '../../graph/hyperedge-contract.js';
import {
  buildHyperEdgeEvidenceV1,
  type HyperEdgeEvidenceV1,
  type HyperEdgeEvidenceBindingV1,
} from '../contracts/hyperedge-evidence-v1.js';
import type { ResearchEvidenceV1 } from '../contracts/research-evidence-v1.js';
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

export function buildAdmittedNaryHyperEdgeEvidenceV1(
  proposal: NaryFactProposalV1,
  input: {
    evidence: readonly ResearchEvidenceV1[];
    bindings: readonly HyperEdgeEvidenceBindingV1[];
    producerRevision: string;
  },
): HyperEdgeEvidenceV1 {
  const hyperedge = materializeAdmittedNaryFactProposalV1(proposal);
  const hasOriginEvidence = input.evidence.some((item) => item.sourceKind === 'CODE'
    && item.sourceRef === proposal.sourceRef
    && item.sourceRevision === proposal.sourceRevision);
  if (!hasOriginEvidence) throw new Error('NARY_PROPOSAL_SOURCE_EVIDENCE_MISSING');

  return buildHyperEdgeEvidenceV1({
    hyperedge,
    evidence: [...input.evidence],
    bindings: [...input.bindings],
    originBinding: {
      proposalChecksum: proposal.proposalChecksum,
      packetKey: proposal.packetKey,
      sourceRef: proposal.sourceRef,
      sourceRevision: proposal.sourceRevision,
      workspaceRevision: proposal.workspaceRevision,
      ontologyRevision: proposal.ontologyRevision ?? null,
      graphRevision: proposal.graphRevision,
      proposalProducerRevision: proposal.producerRevision,
    },
    producerRevision: input.producerRevision,
  });
}
