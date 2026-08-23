import type { RetrievalCandidate } from '../contracts/retrieval-candidate';

export function fuseCandidatesByRrf(lanes: Record<string, RetrievalCandidate[]>, k = 60): RetrievalCandidate[] {
  const byPacket = new Map<string, { candidate: RetrievalCandidate; score: number }>();

  for (const candidates of Object.values(lanes)) {
    for (const candidate of candidates) {
      const current = byPacket.get(candidate.packet_key) ?? { candidate, score: 0 };
      current.score += 1 / (k + candidate.rank);
      byPacket.set(candidate.packet_key, current);
    }
  }

  return [...byPacket.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ candidate }, index) => ({ ...candidate, rank: index + 1, score: candidate.score ?? null }));
}

