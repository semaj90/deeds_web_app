import type { FusedHit, RankedLaneHit, RrfIdentityStatus, RrfLaneName } from './rrf-contract.js';

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

function identityStatusForHit(hit: {
  identityStatus?: RrfIdentityStatus;
}): RrfIdentityStatus {
  return hit.identityStatus ?? 'canonical';
}

/**
 * Compatibility identity key for the legacy rrf-fuse owner while RF7 converges
 * callers on SearchRuntime's richer Candidate envelope.
 *
 * Important: canonicalChunkId is consumed only when explicitly supplied. This
 * helper never manufactures one from packetKey, sourceRef, hashes, or local IDs.
 */
function fusionIdentityKey(hit: {
  id?: string;
  packetKey?: string;
  symbolVersionId?: string;
  canonicalChunkId?: string;
  identityStatus?: RrfIdentityStatus;
}, laneName: string): string {
  const status = identityStatusForHit(hit);
  const localId = String(hit.id ?? '').trim();

  if (status !== 'canonical') {
    // Projection/source/degraded identities are not allowed to merge across
    // backend-local hits merely because they share a source-level packet key.
    return `noncanonical:${laneName}:${localId || String(hit.packetKey ?? '').trim()}`;
  }

  const symbolVersionId = String(hit.symbolVersionId ?? '').trim();
  if (symbolVersionId) return `symbol:${symbolVersionId}`;

  const packetKey = String(hit.packetKey ?? hit.id ?? '').trim();
  if (!packetKey) return '';
  const canonicalChunkId = String(hit.canonicalChunkId ?? '').trim();
  return canonicalChunkId
    ? `packet:${packetKey}::chunk:${canonicalChunkId}`
    : `packet:${packetKey}`;
}

interface InputHit {
  id?: string;
  packetKey?: string;
  score?: number;
  rank?: number;
  rawScore?: number;
  payload?: Record<string, unknown>;
  sourceRef?: string;
  metadata?: Record<string, unknown>;
  symbolVersionId?: string;
  canonicalChunkId?: string;
  identityStatus?: RrfIdentityStatus;
}

/**
 * Legacy compatibility RRF owner.
 *
 * RF6-RRF-FUSE-HARDEN-01 narrows its behavior toward the canonical SearchRuntime
 * invariants without pretending this older envelope is already equivalent to
 * SearchRuntime Candidate:
 *   - one logical lane contributes at most one RRF vote per resolved identity;
 *   - distinct explicitly supplied canonical chunks remain distinct;
 *   - noncanonical identities remain lane/local-id scoped and observable.
 *
 * Full RF7 delegation remains separate because this function still supports
 * legacy weights and topology/authority/dispatcher lane vocabularies.
 */
export function reciprocalRankFusion(
  lanes: Array<{
    lane?: string;
    label?: string;
    status?: 'ok' | 'empty' | 'unavailable' | 'failed' | string;
    weight?: number;
    hits?: InputHit[];
  }> = [],
  weightsOrOptions: Record<string, number> | { topK?: number; includeProvenance?: boolean } = {},
  k = 60,
  limit = 50
): FusedHit[] {
  const byIdentity = new Map<string, FusedHit>();
  const isOptionsForm = typeof weightsOrOptions === 'object' && !Array.isArray(weightsOrOptions) && 'topK' in weightsOrOptions;
  const limitValue = isOptionsForm ? (weightsOrOptions.topK ?? limit) : limit;
  const includeProvenance = isOptionsForm ? (weightsOrOptions.includeProvenance ?? true) : true;
  const weights = isOptionsForm ? {} : (weightsOrOptions as Record<string, number>);

  for (const lane of lanes) {
    if (lane.status && lane.status !== 'ok') continue;
    const laneName = String(lane.lane ?? lane.label ?? 'dispatcher');
    const laneWeight = weights[laneName] ?? lane.weight ?? 1;

    // Best-rank-wins within one logical lane. Multiple physical projections of
    // the same identity remain provenance/support, never extra RRF votes.
    const bestByIdentity = new Map<string, { hit: InputHit; rank: number; support: InputHit[] }>();
    for (const hit of lane.hits ?? []) {
      const identityKey = fusionIdentityKey(hit, laneName);
      if (!identityKey) continue;
      const rank = Math.max(1, Number(hit.rank ?? 0) || 1);
      const existing = bestByIdentity.get(identityKey);
      if (!existing) {
        bestByIdentity.set(identityKey, { hit, rank, support: [hit] });
        continue;
      }
      existing.support.push(hit);
      if (rank < existing.rank) {
        existing.hit = hit;
        existing.rank = rank;
      }
    }

    for (const [identityKey, laneGroup] of bestByIdentity) {
      const hit = laneGroup.hit;
      const packetKey = String(hit.packetKey ?? hit.id ?? '').trim();
      if (!packetKey) continue;
      const rank = laneGroup.rank;
      const score = laneWeight / (k + rank);
      const identityStatus = identityStatusForHit(hit);

      const rankedSupport: RankedLaneHit[] = laneGroup.support.map((supportHit) => ({
        ...supportHit,
        packetKey: String(supportHit.packetKey ?? supportHit.id ?? packetKey),
        lane: toRrfLaneName(laneName),
        rank: Math.max(1, Number(supportHit.rank ?? 0) || 1),
        rawScore: Number(supportHit.rawScore ?? supportHit.score ?? 0),
        identityStatus: identityStatusForHit(supportHit),
      }));

      const current = byIdentity.get(identityKey);
      if (current) {
        current.fusionScore += score;
        current.sources.push(...rankedSupport);
        current.rrfScore = current.fusionScore;
        if (includeProvenance) {
          current.provenance ??= {};
          current.provenance[laneName] = { rank, contribution: score };
        }
      } else {
        byIdentity.set(identityKey, {
          packetKey,
          id: packetKey,
          fusionScore: score,
          sources: rankedSupport,
          rrfScore: score,
          symbolVersionId: hit.symbolVersionId,
          canonicalChunkId: hit.canonicalChunkId,
          identityStatus,
          ...(includeProvenance ? { provenance: { [laneName]: { rank, contribution: score } } } : {}),
        });
      }
    }
  }

  return [...byIdentity.values()]
    .sort((a, b) =>
      b.fusionScore - a.fusionScore ||
      a.packetKey.localeCompare(b.packetKey) ||
      String(a.canonicalChunkId ?? '').localeCompare(String(b.canonicalChunkId ?? ''))
    )
    .slice(0, limitValue);
}

export const rrfFuse = reciprocalRankFusion;
