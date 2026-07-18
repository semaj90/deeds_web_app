import type { RetrievalCandidate } from '../contracts/retrieval-candidate';

export async function hydrateCandidates<T extends RetrievalCandidate>(candidates: T[]): Promise<T[]> {
  return candidates;
}

