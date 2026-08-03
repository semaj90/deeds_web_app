import type { FusedHit, RankedLaneHit, RrfLaneName } from './rrf-contract.js';

const KNOWN_LANE_NAMES: readonly RrfLaneName[] = [
  'bm42',
  'rg',
  'dense_384',
  'dense_768',
  'turbovec',
  'topology',
  'authority',
  'dispatcher',
];

function toRrfLaneName(value: string): RrfLaneName {
  return (KNOWN_LANE_NAMES as readonly string[]).includes(value)
    ? (value as RrfLaneName)
    : 'dispatcher';
}

export function reciprocalRankFusion(
  lanes: Array<{
    lane?: string;
    label?: string;
    status?: 'ok' | 'empty' | 'unavailable' | 'failed' | string;
    weight?: number;
    hits?: Array<{
      id?: string;
      packetKey?: string;
      score?: number;
      rank?: number;
      rawScore?: number;
      payload?: Record<string, unknown>;
      sourceRef?: string;
      metadata?: Record<string, unknown>;
    }>;
  }> = [],
  weightsOrOptions: Record<string, number> | { topK?: number; includeProvenance?: boolean } = {},
  k = 60,
  limit = 50
): FusedHit[] {
  const byPacket = new Map<string, FusedHit>();
  const isOptionsForm = typeof weightsOrOptions === 'object' && !Array.isArray(weightsOrOptions) && 'topK' in weightsOrOptions;
  const limitValue = isOptionsForm ? (weightsOrOptions.topK ?? limit) : limit;
  const includeProvenance = isOptionsForm ? (weightsOrOptions.includeProvenance ?? true) : true;
  const weights = isOptionsForm ? {} : (weightsOrOptions as Record<string, number>);

  for (const lane of lanes) {
    if (lane.status && lane.status !== 'ok') continue;
    const laneName = String(lane.lane ?? lane.label ?? 'dispatcher');
    const laneWeight = weights[laneName] ?? 1;

    for (const hit of lane.hits ?? []) {
      const packetKey = String(hit.packetKey ?? hit.id ?? '');
      if (!packetKey) continue;
      const rank = Number(hit.rank ?? 0);
      const score = laneWeight / (k + rank);
      const current = byPacket.get(packetKey);

      const rankedHit: RankedLaneHit = {
        ...hit,
        packetKey,
        lane: toRrfLaneName(laneName),
        rank,
        rawScore: Number(hit.rawScore ?? hit.score ?? 0),
      };

      if (current) {
        current.fusionScore += score;
        current.sources.push(rankedHit);
        current.rrfScore = current.fusionScore;
        if (includeProvenance) {
          current.provenance ??= {};
          current.provenance[laneName] = { rank, contribution: score };
        }
      } else {
        byPacket.set(packetKey, {
          packetKey,
          id: packetKey,
          fusionScore: score,
          sources: [rankedHit],
          rrfScore: score,
          ...(includeProvenance ? { provenance: { [laneName]: { rank, contribution: score } } } : {}),
        });
      }
    }
  }

  return [...byPacket.values()]
    .sort((a, b) => b.fusionScore - a.fusionScore || a.packetKey.localeCompare(b.packetKey))
    .slice(0, limitValue);
}

export const rrfFuse = reciprocalRankFusion;
