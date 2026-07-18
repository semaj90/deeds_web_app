import type { RetrievalCandidate } from '../contracts/retrieval-candidate';

export function renderEvidence(candidates: RetrievalCandidate[]): string {
  return candidates
    .map((candidate) => `${candidate.lane}:${candidate.packet_key}:${candidate.source_ref}`)
    .join('\n');
}

