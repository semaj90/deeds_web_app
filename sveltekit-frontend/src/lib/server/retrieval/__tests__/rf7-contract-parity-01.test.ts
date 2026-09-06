// @vitest-environment node
/**
 * RF7-CONTRACT-PARITY-01 (2026-09-06) — OBSERVATION ONLY.
 *
 * Per the RF7-02/03/04 plan in `openspec/changes/parent-atlas-retrieval-fusion-reachability/
 * tasks.md`'s `RF7-LANE-ALIAS-CONVERGENCE-01` entry: before extracting a shared fusion kernel,
 * prove (or disprove) that `SearchRuntime.fuseSearchRuntimeCandidates` and
 * `rrf-fuse.ts::reciprocalRankFusion` reduce to the same semantics for equivalent scenarios, using
 * the neutral `FusionContributionV1` projection as the comparison lens.
 *
 * This file does NOT modify either implementation and does NOT assert that the two callers must
 * produce identical output — many scenarios below are expected to show real divergence (see file-
 * level note in `fusion-contribution-adapters.ts`: `SearchRuntime` has no per-lane weighting,
 * `rrf-fuse.ts` does; that alone guarantees some scenarios diverge). Each test records what was
 * observed. Divergence found here is exactly the "RF7 incompatibility, discovered before touching
 * production behavior" the plan calls for — not a test failure to be papered over.
 */

import { describe, expect, it } from 'vitest';
import { fuseSearchRuntimeCandidates, type Candidate } from '../search-runtime.js';
import { reciprocalRankFusion } from '../rrf-fuse.js';
import {
  projectSearchRuntimeCandidatesToContributions,
  projectRrfLanesToContributions,
} from '../fusion-contribution-adapters.js';

function makeCandidate(overrides: Partial<Candidate> & Pick<Candidate, 'id' | 'packetKey' | 'sourceRef'>): Candidate {
  return {
    summary: '',
    content: '',
    score: 0.5,
    scoreSource: 'qdrant_768',
    ...overrides,
  } as Candidate;
}

describe('RF7-CONTRACT-PARITY-01 — differential observation (not an extraction, not a merge)', () => {
  it('Scenario 1: same canonical ID from two dense executors', () => {
    const candidates: Candidate[] = [
      makeCandidate({ id: 'a', packetKey: 'p1', sourceRef: 'src/a.ts', scoreSource: 'qdrant', score: 0.9 } as never),
      makeCandidate({ id: 'b', packetKey: 'p1', sourceRef: 'src/a.ts', scoreSource: 'qdrant_768', score: 0.7 }),
    ];
    const contributions = projectSearchRuntimeCandidatesToContributions(candidates);
    const canonicalIds = new Set(contributions.map(c => c.canonicalId));
    // Observation: both executors normalize to the same 'dense' logical lane per RF7-LANE-ALIAS-
    // CONVERGENCE-01, and both carry the same packetKey identity.
    expect(new Set(contributions.map(c => c.logicalLane))).toEqual(new Set(['dense']));
    expect(canonicalIds).toEqual(new Set(['p1']));
    expect(contributions).toHaveLength(2);
  });

  it('Scenario 2: same canonical ID twice within one lexical lane', () => {
    const candidates: Candidate[] = [
      makeCandidate({ id: 'a', packetKey: 'p1', sourceRef: 'src/a.ts', scoreSource: 'postgres_trigram', score: 0.6 }),
      makeCandidate({ id: 'b', packetKey: 'p1', sourceRef: 'src/a.ts', scoreSource: 'postgres_trigram', score: 0.4 }),
    ];
    const contributions = projectSearchRuntimeCandidatesToContributions(candidates);
    // Observation: the adapter does NOT dedup within a lane (that's the aggregation step's job,
    // not the projection's) — both entries are retained as separate contributions with distinct ranks.
    expect(contributions).toHaveLength(2);
    expect(contributions.map(c => c.rank).sort()).toEqual([1, 2]);
  });

  it('Scenario 3: dense + lexical hit for the same candidate', () => {
    const candidates: Candidate[] = [
      makeCandidate({ id: 'a', packetKey: 'p1', sourceRef: 'src/a.ts', scoreSource: 'qdrant_768', score: 0.8 }),
      makeCandidate({ id: 'b', packetKey: 'p1', sourceRef: 'src/a.ts', scoreSource: 'postgres_trigram', score: 0.5 }),
    ];
    const contributions = projectSearchRuntimeCandidatesToContributions(candidates);
    const lanes = new Set(contributions.map(c => c.logicalLane));
    expect(lanes).toEqual(new Set(['dense', 'lexical']));
    // Observation: same canonicalId contributes to two distinct logical lanes — this is the
    // "genuinely distinct signals" case RRF is designed to fuse, per the review's own citation of
    // Qdrant's RRF guidance.
    expect(contributions.every(c => c.canonicalId === 'p1')).toBe(true);
  });

  it('Scenario 4: candidate appearing in only one lane', () => {
    const candidates: Candidate[] = [
      makeCandidate({ id: 'a', packetKey: 'p1', sourceRef: 'src/a.ts', scoreSource: 'ast_tree', score: 1 }),
    ];
    const contributions = projectSearchRuntimeCandidatesToContributions(candidates);
    expect(contributions).toHaveLength(1);
    expect(contributions[0].logicalLane).toBe('ast');
  });

  it('Scenario 5: missing canonical identity', () => {
    const candidates: Candidate[] = [
      makeCandidate({ id: '', packetKey: '', sourceRef: '', scoreSource: 'qdrant_768', score: 0.5 }),
    ];
    const contributions = projectSearchRuntimeCandidatesToContributions(candidates);
    // Observation: the simplified adapter identity falls through to '' when every identity field
    // is empty. The REAL fuseSearchRuntimeCandidates() filters these out entirely before bucketing
    // (see its `valid = candidates.filter(c => c.packetKey && ... && c.sourceRef && ...)` guard) —
    // this is a real, documented divergence between the simplified adapter and the real
    // implementation, not a bug in either: the adapter intentionally does not replicate that
    // upstream validation step, since RF7-CONTRACT-PARITY-01 is testing lane/rank/vote semantics,
    // not input validation.
    expect(contributions[0]?.canonicalId).toBe('');
    const realOutput = fuseSearchRuntimeCandidates(candidates);
    expect(realOutput).toHaveLength(0); // real implementation drops it; adapter does not
  });

  it('Scenario 6: weighted lanes (rrf-fuse.ts only — SearchRuntime has no weighting concept)', () => {
    const contributions = projectRrfLanesToContributions([
      { lane: 'bm42', weight: 2, hits: [{ packetKey: 'p1', rank: 1 }] },
      { lane: 'dense_768', weight: 0.5, hits: [{ packetKey: 'p1', rank: 1 }] },
    ]);
    expect(contributions.find(c => c.executorId === 'bm42')?.weight).toBe(2);
    expect(contributions.find(c => c.executorId === 'dense_768')?.weight).toBe(0.5);
    // Observation: this is the confirmed real divergence — SearchRuntime's adapter always emits
    // weight: 1 (uniform), since fuseSearchRuntimeCandidates has no per-lane weight parameter at
    // all. A shared aggregation core (if ever built) must treat "no native weighting" as a real
    // semantic difference, not default SearchRuntime's lanes to some arbitrary non-1 weight.
    const searchRuntimeContributions = projectSearchRuntimeCandidatesToContributions([
      makeCandidate({ id: 'a', packetKey: 'p1', sourceRef: 'src/a.ts', scoreSource: 'qdrant_768', score: 0.9 }),
    ]);
    expect(searchRuntimeContributions[0].weight).toBe(1);
  });

  it('Scenario 7: tied ranks', () => {
    const candidates: Candidate[] = [
      makeCandidate({ id: 'a', packetKey: 'p1', sourceRef: 'src/a.ts', scoreSource: 'qdrant_768', score: 0.5 }),
      makeCandidate({ id: 'b', packetKey: 'p2', sourceRef: 'src/b.ts', scoreSource: 'qdrant_768', score: 0.5 }),
    ];
    const contributions = projectSearchRuntimeCandidatesToContributions(candidates);
    // Observation: the adapter breaks ties by input array order (Array.sort is stable in modern
    // JS engines); the REAL fuseSearchRuntimeCandidates() breaks ties via `compareIdentityKeys()`,
    // a specific tie-break the adapter does not replicate. Ranks are still assigned 1 and 2 either
    // way — the adapter's tie-break policy differs from the real implementation's, a known,
    // documented simplification, not a bug.
    expect(contributions.map(c => c.rank).sort()).toEqual([1, 2]);
  });

  it('Scenario 8: executor provenance is retained through projection', () => {
    const candidates: Candidate[] = [
      makeCandidate({
        id: 'a',
        packetKey: 'p1',
        sourceRef: 'src/a.ts',
        scoreSource: 'qdrant_768',
        score: 0.9,
        retrievalExecutor: 'turbovec-shadow',
      } as never),
    ];
    const contributions = projectSearchRuntimeCandidatesToContributions(candidates);
    expect(contributions[0].executorId).toBe('turbovec-shadow');
    expect(contributions[0].provenanceRefs).toContain('qdrant_768');
  });

  it('cross-check: real reciprocalRankFusion() output vote count matches the projected contribution count for a simple single-lane case', () => {
    const fused = reciprocalRankFusion(
      [{ lane: 'dense_768', hits: [{ packetKey: 'p1', rank: 1 }, { packetKey: 'p2', rank: 2 }] }],
      {},
      60,
      50
    );
    const contributions = projectRrfLanesToContributions([
      { lane: 'dense_768', hits: [{ packetKey: 'p1', rank: 1 }, { packetKey: 'p2', rank: 2 }] },
    ]);
    // Observation: real fused-hit count matches contribution count for this single-lane,
    // no-duplicate-identity case — a baseline sanity check before more complex scenarios.
    expect(fused).toHaveLength(2);
    expect(contributions).toHaveLength(2);
  });
});
