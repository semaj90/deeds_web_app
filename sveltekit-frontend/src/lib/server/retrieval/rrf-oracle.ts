/**
 * RRF oracle — reference-only implementation of Reciprocal Rank Fusion.
 *
 * NOT a production fusion owner. Per `openspec/changes/
 * parent-atlas-agentic-repair-bundle-integration` Phase 4 / T4 and
 * `parent-atlas-retrieval-fusion-reachability` (RF6): this repo already has 13 competing RRF
 * implementations, and `SearchRuntime.fuseCandidates` is the canonical production spine per
 * RF3/RF4. This module exists solely as an independent, minimal, easy-to-audit reference to test
 * whichever implementation RF6 eventually declares canonical against — run both on the same
 * frozen lane rankings and confirm they agree mathematically. Do not wire this into any live
 * retrieval path, and do not extend it with production concerns (dedup policy, tie-breaking
 * rules, lane weighting) — if it grows those, it stops being a trustworthy independent oracle.
 */

export interface RrfOracleCandidate {
  packet_key: string;
  rank: number;
  score?: number | null;
}

export function fuseCandidatesByRrf<T extends RrfOracleCandidate>(
  lanes: Record<string, T[]>,
  k = 60,
): T[] {
  const byPacket = new Map<string, { candidate: T; score: number }>();

  for (const candidates of Object.values(lanes)) {
    for (const candidate of candidates) {
      const current = byPacket.get(candidate.packet_key) ?? { candidate, score: 0 };
      current.score += 1 / (k + candidate.rank);
      byPacket.set(candidate.packet_key, current);
    }
  }

  return [...byPacket.values()]
    .sort((a, b) => b.score - a.score)
    .map(({ candidate, score }, index) => ({ ...candidate, rank: index + 1, score }));
}
