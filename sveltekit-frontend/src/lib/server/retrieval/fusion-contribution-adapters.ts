/**
 * RF7-03 — read-only projection adapters from each real caller's pre-fusion input shape into
 * `FusionContributionV1`. Adapter-only: neither `search-runtime.ts` nor `rrf-fuse.ts` executes
 * through these adapters or this module in production. Used only by RF7-CONTRACT-PARITY-01's
 * differential fixtures.
 *
 * Verified against real code before writing these (not guessed):
 * - `SearchRuntime.fuseSearchRuntimeCandidates` buckets candidates by `getFusionLogicalLane()`,
 *   sorts each lane's candidates by `score` descending (ties broken by `compareIdentityKeys`), and
 *   assigns `rank = index + 1` within the lane. It has NO per-lane weighting concept — every lane
 *   contributes uniformly (weight 1). `executorId` there is
 *   `candidate.retrievalExecutor?.trim() || candidate.scoreSource`.
 * - `rrf-fuse.ts::reciprocalRankFusion` DOES support per-lane weighting (a `weight` field on each
 *   lane object, or a `Record<laneName, weight>` map), and defaults `k = 60` (the literature-
 *   standard RRF constant — NOT Qdrant's own `k = 2` default; per this repo's RF7 invariant, this
 *   `k = 60` must be preserved verbatim through any future extraction, never silently switched to
 *   match Qdrant's).
 *
 * `canonicalId` here is a SIMPLIFIED identity extraction
 * (`symbolVersionId ?? packetKey ?? canonicalChunkId ?? id`), not a byte-for-byte reproduction of
 * `search-runtime.ts`'s private `getRevisionQualifiedFusionIdentityKey`/`getFusionBackendIdentityKey`
 * canonical/degraded key scheme. This is intentional and documented, not an oversight: those
 * functions are private (not exported) and encode identity-status-dependent branching that's
 * orthogonal to what RF7-CONTRACT-PARITY-01 needs to observe (lane/vote/rank/provenance
 * consistency), not a reason to duplicate or export internal identity-resolution logic here.
 */

import type { FusionContributionV1 } from './fusion-contribution-v1.js';
import { normalizeRetrievalLane } from './retrieval-lane-aliases.js';
import type { Candidate } from './search-runtime.js';

/**
 * Replicates `search-runtime.ts::getFusionLogicalLane()`'s full switch statement (verified against
 * the real function, not guessed) for the non-dense/non-bm42 fallthrough cases. `normalizeRetrievalLane()`
 * only owns dense/lexical alias data — it does not know about `exact_symbol`/`ast_tree`/`schema`/
 * `rg_keyword`, which are `search-runtime.ts`-specific mappings, not shared alias data.
 */
function fallbackScoreSourceToLane(scoreSource: Candidate['scoreSource']): string {
  switch (scoreSource) {
    case 'exact_symbol':
      return 'exact';
    case 'ast_tree':
      return 'ast';
    case 'schema':
      return 'schema';
    case 'rg_keyword':
      return 'rg';
    default:
      return 'lexical';
  }
}

function simplifiedCanonicalId(candidate: {
  symbolVersionId?: string | null;
  packetKey?: string | null;
  canonicalChunkId?: string | null;
  id?: string;
}): string {
  return (
    candidate.symbolVersionId?.trim() ||
    candidate.packetKey?.trim() ||
    candidate.canonicalChunkId?.trim() ||
    candidate.id?.trim() ||
    ''
  );
}

/**
 * Projects `SearchRuntime.Candidate[]` into `FusionContributionV1[]`, replicating only the
 * pre-fusion per-lane bucketing + intra-lane ranking step (score-descending, rank = index + 1).
 * Uniform weight (1) per contribution — `SearchRuntime` has no native per-lane weighting.
 */
export function projectSearchRuntimeCandidatesToContributions(
  candidates: readonly Candidate[]
): FusionContributionV1[] {
  const laneBuckets = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const lane =
      candidate.embeddingLane === 'bm42'
        ? 'bm42'
        : candidate.embeddingLane === 'dense_768'
          ? 'dense'
          : (normalizeRetrievalLane(candidate.scoreSource) ?? fallbackScoreSourceToLane(candidate.scoreSource));
    const bucket = laneBuckets.get(lane) ?? [];
    bucket.push(candidate);
    laneBuckets.set(lane, bucket);
  }

  const contributions: FusionContributionV1[] = [];
  for (const [lane, bucket] of laneBuckets) {
    const sorted = [...bucket].sort((a, b) => b.score - a.score);
    sorted.forEach((candidate, index) => {
      contributions.push({
        canonicalId: simplifiedCanonicalId(candidate),
        logicalLane: lane,
        rank: index + 1,
        weight: 1,
        executorId: candidate.retrievalExecutor?.trim() || candidate.scoreSource,
        provenanceRefs: [candidate.scoreSource],
      });
    });
  }
  return contributions;
}

export interface RrfLaneInputForAdapter {
  lane?: string;
  weight?: number;
  hits?: ReadonlyArray<{
    packetKey: string;
    rank: number;
    id?: string;
    symbolVersionId?: string;
    canonicalChunkId?: string;
  }>;
}

/**
 * Projects `rrf-fuse.ts`'s `lanes` input array into `FusionContributionV1[]`. Preserves each
 * lane's caller-supplied rank and weight verbatim (rrf-fuse.ts does NOT re-derive rank from score —
 * callers supply pre-ranked hits per lane).
 */
export function projectRrfLanesToContributions(
  lanes: readonly RrfLaneInputForAdapter[]
): FusionContributionV1[] {
  const contributions: FusionContributionV1[] = [];
  for (const laneInput of lanes) {
    const rawLane = laneInput.lane ?? 'unknown';
    const logicalLane = normalizeRetrievalLane(rawLane) ?? rawLane;
    const weight = laneInput.weight ?? 1;
    for (const hit of laneInput.hits ?? []) {
      contributions.push({
        canonicalId: simplifiedCanonicalId({
          symbolVersionId: hit.symbolVersionId,
          packetKey: hit.packetKey,
          canonicalChunkId: hit.canonicalChunkId,
          id: hit.id,
        }),
        logicalLane,
        rank: hit.rank,
        weight,
        executorId: rawLane,
        provenanceRefs: [rawLane],
      });
    }
  }
  return contributions;
}
