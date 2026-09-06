import type { FusedHit, RankedLaneHit, RrfIdentityStatus, RrfLaneName } from './rrf-contract.js';
import { normalizeRetrievalLane } from './retrieval-lane-aliases.js';

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

/**
 * RF7 compatibility grouping: executor names are not logical retrieval lanes.
 * Dense Qdrant/legacy-dense/TurboVec aliases all represent one semantic vote.
 */
function toLogicalLaneName(value: string): string {
  const normalized = value.trim().toLowerCase();
  return normalizeRetrievalLane(normalized) ?? (normalized || 'dispatcher');
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
}, logicalLaneName: string): string {
  const status = identityStatusForHit(hit);
  const localId = String(hit.id ?? '').trim();

  if (status !== 'canonical') {
    // Projection/source/degraded identities are not allowed to merge across
    // backend-local hits merely because they share a source-level packet key.
    return `noncanonical:${logicalLaneName}:${localId || String(hit.packetKey ?? '').trim()}`;
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

interface LogicalLaneGroup {
  logicalLaneName: string;
  identityKey: string;
  representative: InputHit;
  representativeLaneName: string;
  representativeRank: number;
  representativeContribution: number;
  support: Array<{ hit: InputHit; laneName: string; rank: number }>;
}

/**
 * Legacy compatibility RRF owner.
 *
 * RF6-RRF-FUSE-HARDEN-01 narrows its behavior toward the canonical SearchRuntime
 * invariants without pretending this older envelope is already equivalent to
 * SearchRuntime Candidate:
 *   - one LOGICAL lane contributes at most one RRF vote per resolved identity;
 *   - dense_384/dense_768/TurboVec/Qdrant/cuVS/CAGRA aliases collapse to one
 *     semantic logical lane, preserving executor hits only as provenance;
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

  // First collapse executor-specific lanes into logical-lane groups. The best
  // weighted contribution wins; all alternate executor hits remain support.
  const logicalGroups = new Map<string, LogicalLaneGroup>();
  for (const lane of lanes) {
    if (lane.status && lane.status !== 'ok') continue;
    const laneName = String(lane.lane ?? lane.label ?? 'dispatcher');
    const logicalLaneName = toLogicalLaneName(laneName);
    const laneWeight = weights[laneName] ?? lane.weight ?? 1;

    for (const hit of lane.hits ?? []) {
      const identityKey = fusionIdentityKey(hit, logicalLaneName);
      if (!identityKey) continue;
      const rank = Math.max(1, Number(hit.rank ?? 0) || 1);
      const contribution = laneWeight / (k + rank);
      const groupKey = `${logicalLaneName}::${identityKey}`;
      const existing = logicalGroups.get(groupKey);
      if (!existing) {
        logicalGroups.set(groupKey, {
          logicalLaneName,
          identityKey,
          representative: hit,
          representativeLaneName: laneName,
          representativeRank: rank,
          representativeContribution: contribution,
          support: [{ hit, laneName, rank }],
        });
        continue;
      }

      existing.support.push({ hit, laneName, rank });
      if (
        contribution > existing.representativeContribution ||
        (Math.abs(contribution - existing.representativeContribution) <= 1e-12 && rank < existing.representativeRank)
      ) {
        existing.representative = hit;
        existing.representativeLaneName = laneName;
        existing.representativeRank = rank;
        existing.representativeContribution = contribution;
      }
    }
  }

  // Then sum exactly one contribution from each logical lane for a canonical
  // identity. Noncanonical identity keys intentionally include logical lane +
  // backend-local id, so they cannot cross-lane merge by accident.
  for (const group of logicalGroups.values()) {
    const hit = group.representative;
    const packetKey = String(hit.packetKey ?? hit.id ?? '').trim();
    if (!packetKey) continue;
    const identityStatus = identityStatusForHit(hit);
    const aggregateKey = group.identityKey;

    const rankedSupport: RankedLaneHit[] = group.support.map(({ hit: supportHit, laneName, rank }) => ({
      ...supportHit,
      packetKey: String(supportHit.packetKey ?? supportHit.id ?? packetKey),
      lane: toRrfLaneName(laneName),
      rank,
      rawScore: Number(supportHit.rawScore ?? supportHit.score ?? 0),
      identityStatus: identityStatusForHit(supportHit),
    }));

    const current = byIdentity.get(aggregateKey);
    if (current) {
      current.fusionScore += group.representativeContribution;
      current.sources.push(...rankedSupport);
      current.rrfScore = current.fusionScore;
      if (includeProvenance) {
        current.provenance ??= {};
        current.provenance[group.logicalLaneName] = {
          rank: group.representativeRank,
          contribution: group.representativeContribution,
        };
      }
    } else {
      byIdentity.set(aggregateKey, {
        packetKey,
        id: packetKey,
        fusionScore: group.representativeContribution,
        sources: rankedSupport,
        rrfScore: group.representativeContribution,
        symbolVersionId: hit.symbolVersionId,
        canonicalChunkId: hit.canonicalChunkId,
        identityStatus,
        ...(includeProvenance ? {
          provenance: {
            [group.logicalLaneName]: {
              rank: group.representativeRank,
              contribution: group.representativeContribution,
            },
          },
        } : {}),
      });
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
