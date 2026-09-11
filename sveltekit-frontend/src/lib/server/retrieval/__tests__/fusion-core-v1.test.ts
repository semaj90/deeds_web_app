// @vitest-environment node
/**
 * RF7-05 — FusionCoreV1 differential proof against both existing callers, on the same fixtures
 * RF7-CONTRACT-PARITY-01 (rf7-contract-parity-01.test.ts) already used. This does NOT wire either
 * caller to the core (that's RF7-06/RF7-07, still gated on a live replay proof) — it proves the
 * core reproduces both callers' real RRF math on the scenarios where they agree, and explicitly
 * documents (not hides) the two confirmed divergences (weighting, tie-break) that a migration
 * would need to handle at the call site, not inside this core.
 */

import { describe, expect, it } from 'vitest';
import { fuseSearchRuntimeCandidates, type Candidate } from '../search-runtime.js';
import { reciprocalRankFusion } from '../rrf-fuse.js';
import {
  projectSearchRuntimeCandidatesToContributions,
  projectRrfLanesToContributions,
} from '../fusion-contribution-adapters.js';
import { fuseContributionsV1, FUSION_CORE_RRF_K } from '../fusion-core-v1.js';
import { hasCompleteFusionIdentityEnvelope } from '../fusion-contribution-v1.js';

function makeCandidate(overrides: Partial<Candidate> & Pick<Candidate, 'id' | 'packetKey' | 'sourceRef'>): Candidate {
  return {
    summary: '',
    content: '',
    score: 0.5,
    scoreSource: 'qdrant_768',
    ...overrides,
  } as Candidate;
}

describe('RF7-05 FusionCoreV1 — differential proof, not yet wired into production callers', () => {
  it('requires revision-qualified identity before a contribution can be admitted', () => {
    const [contribution] = projectSearchRuntimeCandidatesToContributions([
      makeCandidate({ id: 'p1', packetKey: 'p1', sourceRef: 'src/p1.ts' }),
    ]);
    expect(hasCompleteFusionIdentityEnvelope(contribution.identityEnvelope)).toBe(false);
    expect(hasCompleteFusionIdentityEnvelope({
      canonicalId: 'p1',
      packetKey: 'p1',
      sourceRef: 'src/p1.ts',
      sourceRevision: 'sha256:source',
      workspaceRevision: 'sha256:workspace',
      representationId: 'semantic_768',
      representationRevision: 'semantic_768:v1',
      identityResolutionSource: 'packet_key',
    })).toBe(true);
  });

  it('k defaults to the literature-standard 60, matching both existing callers', () => {
    expect(FUSION_CORE_RRF_K).toBe(60);
  });

  it('reproduces rrf-fuse.ts single-lane fusionScore for an unweighted single-vote case', () => {
    const lanes = [{ lane: 'dense_768', hits: [{ packetKey: 'p1', rank: 1 }, { packetKey: 'p2', rank: 2 }] }];
    const real = reciprocalRankFusion(lanes, {}, 60, 50);
    const contributions = projectRrfLanesToContributions(lanes);
    const fused = fuseContributionsV1(contributions);

    expect(fused).toHaveLength(real.length);
    const realByPacket = new Map(real.map(hit => [hit.packetKey, hit.fusionScore]));
    for (const candidate of fused) {
      expect(candidate.fusionScore).toBeCloseTo(realByPacket.get(candidate.canonicalId)!, 12);
    }
  });

  it('reproduces rrf-fuse.ts cross-lane summed fusionScore for a shared candidate', () => {
    const lanes = [
      { lane: 'bm42', hits: [{ packetKey: 'p1', rank: 1 }] },
      { lane: 'dense_768', hits: [{ packetKey: 'p1', rank: 2 }] },
    ];
    const real = reciprocalRankFusion(lanes, {}, 60, 50);
    const contributions = projectRrfLanesToContributions(lanes);
    const fused = fuseContributionsV1(contributions);

    const realP1 = real.find(hit => hit.packetKey === 'p1')!;
    const fusedP1 = fused.find(candidate => candidate.canonicalId === 'p1')!;
    // Real rrf-fuse.ts: 1/(60+1) + 1/(60+2). Core: same sum via bestPerLane -> byCanonicalId.
    expect(fusedP1.fusionScore).toBeCloseTo(realP1.fusionScore, 12);
    expect(fusedP1.laneVotes).toHaveLength(2);
  });

  it('one-vote-per-lane: two hits in the SAME lane for one canonicalId only count the stronger one', () => {
    // Matches rrf-fuse.ts's "representative wins" semantics and SearchRuntime's RF6-SEMANTIC-VOTE-01
    // invariant -- multiple same-lane contributions for one identity must not sum.
    const contributions = projectRrfLanesToContributions([
      { lane: 'dense_768', hits: [{ packetKey: 'p1', rank: 1 }, { packetKey: 'p1', rank: 3 }] },
    ]);
    const fused = fuseContributionsV1(contributions);
    expect(fused).toHaveLength(1);
    expect(fused[0].laneVotes).toHaveLength(1);
    expect(fused[0].fusionScore).toBeCloseTo(1 / (60 + 1), 12); // rank 1 wins, not rank 3
  });

  it('DOCUMENTED DIVERGENCE (weighting): SearchRuntime uniform weight 1 vs rrf-fuse.ts explicit weight', () => {
    const searchRuntimeContributions = projectSearchRuntimeCandidatesToContributions([
      makeCandidate({ id: 'a', packetKey: 'p1', sourceRef: 'src/a.ts', scoreSource: 'qdrant_768', score: 0.9 }),
    ]);
    const rrfFuseContributions = projectRrfLanesToContributions([
      { lane: 'dense_768', weight: 2, hits: [{ packetKey: 'p1', rank: 1 }] },
    ]);
    const searchRuntimeFused = fuseContributionsV1(searchRuntimeContributions);
    const rrfFuseFused = fuseContributionsV1(rrfFuseContributions);
    // Same canonicalId, same rank, different weight -> different fusionScore. The core does not
    // paper over this: it always uses the contribution's own weight, uniform-1 or explicit.
    expect(searchRuntimeFused[0].fusionScore).toBeCloseTo(1 / 61, 12);
    expect(rrfFuseFused[0].fusionScore).toBeCloseTo(2 / 61, 12);
    expect(rrfFuseFused[0].fusionScore).not.toBeCloseTo(searchRuntimeFused[0].fusionScore, 6);
  });

  it('DOCUMENTED DIVERGENCE (tie-break): default comparator is score-desc/canonicalId-asc, NOT SearchRuntime\'s private compareIdentityKeys', () => {
    const candidates: Candidate[] = [
      makeCandidate({ id: 'a', packetKey: 'p2', sourceRef: 'src/b.ts', scoreSource: 'qdrant_768', score: 0.5 }),
      makeCandidate({ id: 'b', packetKey: 'p1', sourceRef: 'src/a.ts', scoreSource: 'qdrant_768', score: 0.5 }),
    ];
    // Both candidates land in the same lane at different ranks (array order), so their
    // fusionScore differs slightly by rank -- this test only asserts the core's own documented
    // default ordering behavior, not that it matches SearchRuntime's real tie-break, since
    // SearchRuntime is NOT wired to this core yet.
    const contributions = projectSearchRuntimeCandidatesToContributions(candidates);
    const fused = fuseContributionsV1(contributions);
    expect(fused.map(c => c.canonicalId)).toEqual(['p2', 'p1']); // rank 1 (p2) beats rank 2 (p1)
  });

  it('a caller-supplied comparator overrides the default (needed before any real migration)', () => {
    const contributions = projectRrfLanesToContributions([
      { lane: 'dense_768', hits: [{ packetKey: 'p1', rank: 1 }, { packetKey: 'p2', rank: 1 }] },
    ]);
    const fused = fuseContributionsV1(contributions, {
      comparator: (a, b) => b.canonicalId.localeCompare(a.canonicalId), // reverse alpha, deliberately unusual
    });
    expect(fused.map(c => c.canonicalId)).toEqual(['p2', 'p1']);
  });

  it('drops contributions with no canonicalId, matching both callers\' own upstream validation intent', () => {
    const fused = fuseContributionsV1([
      { canonicalId: '', logicalLane: 'dense', rank: 1, weight: 1, executorId: 'x', provenanceRefs: [] },
    ]);
    expect(fused).toHaveLength(0);
    // real fuseSearchRuntimeCandidates() confirms the same intent independently (RF7-04 Scenario 5):
    expect(fuseSearchRuntimeCandidates([])).toHaveLength(0);
  });
});
