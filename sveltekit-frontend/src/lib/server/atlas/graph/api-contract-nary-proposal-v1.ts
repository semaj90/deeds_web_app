import type { ApiContractObservationV1 } from '../language/api-contract-observation-v1.js';
import {
  createNaryFactProposalV1,
  type NaryFactProposalV1,
} from './nary-fact-proposal-v1.js';
import {
  resolveParticipantObservationsV1,
  type CanonicalParticipantOwnerV1,
  type ParticipantObservationV1,
  type ParticipantResolutionBatchV1,
} from './participant-resolver-v1.js';

export interface ApiContractNaryProposalInputV1 {
  packetKey: string;
  graphRevision: string;
  producerRevision: string;
  owners: readonly CanonicalParticipantOwnerV1[];
  bindings: readonly ParticipantObservationV1[];
}

export interface ApiContractNaryProposalResultV1 extends ParticipantResolutionBatchV1 {
  proposal: NaryFactProposalV1 | null;
}

/**
 * Bridges a grounded API observation to the proposal boundary. Every route,
 * handler, schema, and auth participant must be supplied as an observation
 * binding and resolve through an existing canonical owner. This adapter never
 * derives IDs from method/path/schema literals and never writes a hyperedge.
 */
export function proposeApiContractNaryFactV1(
  observation: ApiContractObservationV1,
  input: ApiContractNaryProposalInputV1,
): ApiContractNaryProposalResultV1 {
  const resolutions = resolveParticipantObservationsV1(input.bindings, input.owners);
  const participantCount = resolutions.participants.length;
  if (resolutions.status !== 'RESOLVED' || participantCount < 3) {
    return { ...resolutions, proposal: null };
  }

  const proposal = createNaryFactProposalV1({
    sourceRef: observation.sourceRef,
    sourceRevision: observation.sourceRevision,
    workspaceRevision: observation.workspaceRevision,
    packetKey: input.packetKey,
    graphRevision: input.graphRevision,
    producerRevision: input.producerRevision,
    predicate: 'API_CONTRACT_OBSERVED',
    participants: resolutions.participants,
    evidenceRefs: [...new Set([...observation.evidenceRefs, ...resolutions.evidenceRefs])],
    admission: 'PROPOSED',
  });
  return { ...resolutions, proposal };
}
