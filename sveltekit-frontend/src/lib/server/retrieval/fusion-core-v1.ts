/**
 * FusionCoreV1 — RF7-05, the shared canonical RRF aggregation core.
 *
 * Per `openspec/changes/parent-atlas-retrieval-fusion-reachability/tasks.md`'s
 * `RF7-02/03/04 results` entry (2026-09-06): RF7-04's differential parity fixtures
 * (`__tests__/rf7-contract-parity-01.test.ts`) confirmed two real semantic divergences between
 * `SearchRuntime.fuseSearchRuntimeCandidates` and `rrf-fuse.ts::reciprocalRankFusion` that a shared
 * core must design for explicitly rather than silently default away:
 *
 *   1. Weighting: SearchRuntime has no per-lane weighting concept (every lane contributes
 *      uniformly); rrf-fuse.ts supports an explicit per-lane weight. `FusionContributionV1.weight`
 *      already carries this — SearchRuntime's adapter emits `weight: 1` for every contribution,
 *      rrf-fuse.ts's adapter passes the caller-supplied weight through. This core does not invent
 *      a default weight itself; it always uses whatever `weight` each `FusionContributionV1`
 *      carries, so "no native weighting" stays representable as "uniform weight 1", not collapsed
 *      into an untyped default.
 *   2. Tie-breaking: SearchRuntime breaks tied scores via a private, unexported
 *      `compareIdentityKeys()`; rrf-fuse.ts breaks ties via `(fusionScore desc, packetKey asc,
 *      canonicalChunkId asc)`. Neither is "the" canonical tie-break — this core accepts an
 *      OPTIONAL comparator and falls back to score-desc/canonicalId-asc (matching rrf-fuse.ts's
 *      shape, since that is the more fully-specified of the two) only when none is supplied. A
 *      caller that needs to reproduce its own exact historical tie-break (e.g. SearchRuntime, if it
 *      is ever migrated to call this core) MUST pass its own comparator rather than rely on this
 *      default.
 *
 * NOT wired into `search-runtime.ts` or `rrf-fuse.ts` production code paths yet (RF7-06/RF7-07,
 * not started) — those migrations require a bounded live replay proof (RF7-09, not started) before
 * they can be authorized, per this same tasks.md file's own governance. This module exists now so
 * that migration work has a real, tested target to delegate to; it does not itself change any
 * production behavior.
 */

import type { FusionContributionV1 } from './fusion-contribution-v1.js';

export const FUSION_CORE_RRF_K = 60;

export interface FusedCandidateV1 {
  canonicalId: string;
  fusionScore: number;
  /** One entry per logical lane that contributed a vote for this canonicalId. */
  laneVotes: Array<{
    logicalLane: string;
    rank: number;
    weight: number;
    contribution: number;
    executorId: string;
  }>;
  provenanceRefs: string[];
}

export type FusedCandidateComparator = (a: FusedCandidateV1, b: FusedCandidateV1) => number;

const defaultComparator: FusedCandidateComparator = (a, b) =>
  b.fusionScore - a.fusionScore || a.canonicalId.localeCompare(b.canonicalId);

/**
 * Aggregates neutral `FusionContributionV1` rows into fused candidates using literature-standard
 * RRF: `contribution = weight / (k + rank)`, one vote per (canonicalId, logicalLane) pair (the
 * strongest contribution within a lane wins; weaker same-lane contributions for the same
 * canonicalId are dropped, never summed — this is the "one-vote-per-lane" invariant both existing
 * callers already independently enforce), summed across all lanes a canonicalId appears in.
 *
 * `k` defaults to `FUSION_CORE_RRF_K` (60, the literature-standard constant both existing callers
 * use) and is exposed only so tests can probe behavior at other values — production callers must
 * never override it silently; per this repo's RF7 invariant, `k=60` is load-bearing and must be
 * preserved verbatim through any future migration.
 *
 * Contributions with an empty `canonicalId` are dropped (they carry no identity to fuse on) —
 * this mirrors both callers' own upstream validation, but is enforced here too since this
 * function may eventually be called with contributions that skipped that upstream step.
 */
export function fuseContributionsV1(
  contributions: readonly FusionContributionV1[],
  options: { k?: number; comparator?: FusedCandidateComparator } = {}
): FusedCandidateV1[] {
  const k = options.k ?? FUSION_CORE_RRF_K;
  const comparator = options.comparator ?? defaultComparator;

  // Step 1: one vote per (canonicalId, logicalLane) — strongest contribution wins.
  const bestPerLane = new Map<string, FusionContributionV1>();
  for (const contribution of contributions) {
    const canonicalId = contribution.canonicalId.trim();
    if (!canonicalId) continue;
    const laneKey = `${canonicalId}::${contribution.logicalLane}`;
    const candidateContribution = contribution.weight / (k + Math.max(1, contribution.rank));
    const existing = bestPerLane.get(laneKey);
    if (!existing) {
      bestPerLane.set(laneKey, contribution);
      continue;
    }
    const existingContribution = existing.weight / (k + Math.max(1, existing.rank));
    if (candidateContribution > existingContribution) {
      bestPerLane.set(laneKey, contribution);
    }
  }

  // Step 2: sum each canonicalId's per-lane winning contributions across lanes.
  const byCanonicalId = new Map<string, FusedCandidateV1>();
  for (const contribution of bestPerLane.values()) {
    const canonicalId = contribution.canonicalId.trim();
    const contributionScore = contribution.weight / (k + Math.max(1, contribution.rank));
    const existing = byCanonicalId.get(canonicalId);
    const laneVote = {
      logicalLane: contribution.logicalLane,
      rank: contribution.rank,
      weight: contribution.weight,
      contribution: contributionScore,
      executorId: contribution.executorId,
    };
    if (existing) {
      existing.fusionScore += contributionScore;
      existing.laneVotes.push(laneVote);
      for (const ref of contribution.provenanceRefs) {
        if (!existing.provenanceRefs.includes(ref)) existing.provenanceRefs.push(ref);
      }
    } else {
      byCanonicalId.set(canonicalId, {
        canonicalId,
        fusionScore: contributionScore,
        laneVotes: [laneVote],
        provenanceRefs: [...contribution.provenanceRefs],
      });
    }
  }

  return [...byCanonicalId.values()].sort(comparator);
}
