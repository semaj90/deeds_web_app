import type { FusedHit, LaneExecutionResult, RankedLaneHit } from './rrf-contract.js';

export function reciprocalRankFusion(
  lanes: LaneExecutionResult[],
  weights: Partial<Record<RankedLaneHit['lane'], number>> = {},
  k = 60,
  limit = 50
): FusedHit[] {
  const byPacket = new Map<string, FusedHit>();

  for (const lane of lanes) {
    if (lane.status !== 'ok') continue;
    const laneWeight = weights[lane.lane] ?? 1;

    for (const hit of lane.hits) {
      const score = laneWeight / (k + hit.rank);
      const current = byPacket.get(hit.packetKey);

      if (current) {
        current.fusionScore += score;
        current.sources.push(hit);
      } else {
        byPacket.set(hit.packetKey, {
          packetKey: hit.packetKey,
          fusionScore: score,
          sources: [hit],
        });
      }
    }
  }

  return [...byPacket.values()]
    .sort((a, b) => b.fusionScore - a.fusionScore || a.packetKey.localeCompare(b.packetKey))
    .slice(0, limit);
}
