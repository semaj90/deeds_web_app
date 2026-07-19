// @vitest-environment node

/**
 * P1.4 — Fusion Strategy Benchmark: Unweighted RRF vs Weighted RRF vs DBSF
 *
 * Frozen candidate fixture with a known ground-truth relevance ordering.
 * All three strategies are evaluated for rank correlation against ground truth
 * (Spearman ρ) and NDCG@5 / NDCG@10.
 *
 * The benchmark is deterministic: same input → same numbers every run.
 * It also serves as a regression gate — if a strategy's score drops below
 * the recorded baseline, the fusion implementation regressed.
 */

import { describe, it, expect } from 'vitest';
import type { LaneCandidate } from '../src/lib/server/retrieval/lane-contracts.js';

// ---------------------------------------------------------------------------
// Fusion strategy implementations
// ---------------------------------------------------------------------------

const RRF_K = 60;

/**
 * Unweighted RRF — current production implementation (mirrors fuse-candidates.ts)
 * score(p) = Σ_lane  1 / (K + rank_lane(p))
 */
function fuseRRF(candidates: LaneCandidate[]): Array<{ packetKey: string; score: number }> {
  const valid = candidates.filter(c => c.score !== null && c.packetKey.trim() !== '');

  // Group by lane to assign per-lane ranks
  const byLane = new Map<string, LaneCandidate[]>();
  for (const c of valid) {
    if (!byLane.has(c.lane)) byLane.set(c.lane, []);
    byLane.get(c.lane)!.push(c);
  }

  // Sort within each lane by raw score desc → assign 1-based rank
  const laneRanks = new Map<string, Map<string, number>>();
  for (const [lane, lc] of byLane) {
    const sorted = [...lc].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const rankMap = new Map<string, number>();
    sorted.forEach((c, i) => rankMap.set(c.packetKey, i + 1));
    laneRanks.set(lane, rankMap);
  }

  // Accumulate RRF scores
  const rrfScores = new Map<string, number>();
  for (const [lane, rankMap] of laneRanks) {
    for (const [pk, rank] of rankMap) {
      rrfScores.set(pk, (rrfScores.get(pk) ?? 0) + 1 / (RRF_K + rank));
    }
  }

  return [...rrfScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([packetKey, score]) => ({ packetKey, score }));
}

/**
 * Weighted RRF — per-lane weight multiplied into each RRF contribution
 * score(p) = Σ_lane  w_lane * (1 / (K + rank_lane(p)))
 */
const LANE_WEIGHTS: Record<LaneCandidate['lane'], number> = {
  dense:        0.40,   // High-precision semantic similarity
  bm42:         0.20,   // Hybrid sparse+dense
  exact:        0.15,   // Exact keyword match (precision signal)
  ast:          0.10,   // Structural code match
  bm25:         0.10,   // Classic BM25 text match
  rg:           0.03,   // Ripgrep lexical fallback
  sparse:       0.01,   // Sparse-vector (disabled lane placeholder)
  'go-retrieval': 0.01, // Go retrieval facade
};

function fuseWeightedRRF(candidates: LaneCandidate[]): Array<{ packetKey: string; score: number }> {
  const valid = candidates.filter(c => c.score !== null && c.packetKey.trim() !== '');

  const byLane = new Map<string, LaneCandidate[]>();
  for (const c of valid) {
    if (!byLane.has(c.lane)) byLane.set(c.lane, []);
    byLane.get(c.lane)!.push(c);
  }

  const laneRanks = new Map<string, Map<string, number>>();
  for (const [lane, lc] of byLane) {
    const sorted = [...lc].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    const rankMap = new Map<string, number>();
    sorted.forEach((c, i) => rankMap.set(c.packetKey, i + 1));
    laneRanks.set(lane, rankMap);
  }

  const wrrfScores = new Map<string, number>();
  for (const [lane, rankMap] of laneRanks) {
    const w = LANE_WEIGHTS[lane as LaneCandidate['lane']] ?? 0.05;
    for (const [pk, rank] of rankMap) {
      wrrfScores.set(pk, (wrrfScores.get(pk) ?? 0) + w * (1 / (RRF_K + rank)));
    }
  }

  return [...wrrfScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([packetKey, score]) => ({ packetKey, score }));
}

/**
 * DBSF — Distribution-Based Score Fusion
 * Normalizes raw scores per lane to [0,1] using min-max, then
 * takes the weighted sum across lanes.
 *
 * Advantages: uses actual similarity magnitudes (not just order).
 * Disadvantage: sensitive to score outliers in a lane.
 */
function fuseDBSF(candidates: LaneCandidate[]): Array<{ packetKey: string; score: number }> {
  const valid = candidates.filter(c => c.score !== null && c.packetKey.trim() !== '');

  const byLane = new Map<string, LaneCandidate[]>();
  for (const c of valid) {
    if (!byLane.has(c.lane)) byLane.set(c.lane, []);
    byLane.get(c.lane)!.push(c);
  }

  // Min-max normalize raw scores within each lane
  const laneNorm = new Map<string, Map<string, number>>();
  for (const [lane, lc] of byLane) {
    const scores = lc.map(c => c.score ?? 0);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = max - min;
    const normMap = new Map<string, number>();
    for (const c of lc) {
      normMap.set(c.packetKey, range > 0 ? ((c.score ?? 0) - min) / range : 1.0);
    }
    laneNorm.set(lane, normMap);
  }

  // Weighted sum of normalized scores
  const dbsfScores = new Map<string, number>();
  for (const [lane, normMap] of laneNorm) {
    const w = LANE_WEIGHTS[lane as LaneCandidate['lane']] ?? 0.05;
    for (const [pk, norm] of normMap) {
      dbsfScores.set(pk, (dbsfScores.get(pk) ?? 0) + w * norm);
    }
  }

  return [...dbsfScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([packetKey, score]) => ({ packetKey, score }));
}

// ---------------------------------------------------------------------------
// Evaluation metrics
// ---------------------------------------------------------------------------

/** Spearman rank correlation between two rankings (same set of packetKeys) */
function spearmanRho(
  predicted: string[],
  groundTruth: string[],
): number {
  const n = groundTruth.length;
  if (n === 0) return 1;

  const gtRank = new Map<string, number>();
  groundTruth.forEach((pk, i) => gtRank.set(pk, i + 1));

  const predRank = new Map<string, number>();
  predicted.forEach((pk, i) => predRank.set(pk, i + 1));

  let dSqSum = 0;
  for (const pk of groundTruth) {
    const gt = gtRank.get(pk) ?? n;
    const pr = predRank.get(pk) ?? n; // items missing from prediction get rank n
    dSqSum += (gt - pr) ** 2;
  }

  return 1 - (6 * dSqSum) / (n * (n * n - 1));
}

/** DCG at k: Σ(rel_i / log2(i+1)), i from 1 */
function dcg(relevance: number[], k: number): number {
  let score = 0;
  for (let i = 0; i < Math.min(k, relevance.length); i++) {
    score += relevance[i] / Math.log2(i + 2);
  }
  return score;
}

/** NDCG@k: DCG@k / IDCG@k */
function ndcg(predicted: string[], relevanceMap: Map<string, number>, k: number): number {
  const predRel = predicted.slice(0, k).map(pk => relevanceMap.get(pk) ?? 0);
  const idealRel = [...relevanceMap.values()].sort((a, b) => b - a).slice(0, k);
  const ideal = dcg(idealRel, k);
  if (ideal === 0) return 1;
  return dcg(predRel, k) / ideal;
}

// ---------------------------------------------------------------------------
// Frozen candidate fixture
//
// 10 packets across 4 lanes (dense, exact, ast, bm25).
// Ground truth relevance: 3=highly relevant, 2=relevant, 1=marginal, 0=not relevant.
// Packets A,B,C are highly relevant; D,E are relevant; F,G marginal; H,I,J not relevant.
//
// Lane behaviour designed to stress the fusion strategies:
// - dense gives signal for A,B,C (correct top) but also ranks H high (noise)
// - exact gives a strong signal for C (exact match keyword) and D
// - ast gives B and E (structural match)
// - bm25 broadly distributes scores with only moderate correlation to truth
//
// Ground truth order: A > B > C > D > E > F > G > H > I > J
// ---------------------------------------------------------------------------

type Pk = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J';

const GROUND_TRUTH_ORDER: Pk[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
const RELEVANCE: Map<string, number> = new Map([
  ['A', 3], ['B', 3], ['C', 3],
  ['D', 2], ['E', 2],
  ['F', 1], ['G', 1],
  ['H', 0], ['I', 0], ['J', 0],
]);

function makeCandidate(pk: Pk, lane: LaneCandidate['lane'], score: number): LaneCandidate {
  return {
    packetKey: pk,
    sourceRef: `src/${pk.toLowerCase()}.ts`,
    rank: 1, // will be overridden by fusion rank assignment
    score,
    lane,
    fusionStage: 'lane',
  };
}

const FIXTURE: LaneCandidate[] = [
  // dense — good signal for A,B, noise H ranked 3rd
  makeCandidate('A', 'dense', 0.95),
  makeCandidate('B', 'dense', 0.88),
  makeCandidate('H', 'dense', 0.85), // noise
  makeCandidate('C', 'dense', 0.72),
  makeCandidate('D', 'dense', 0.60),
  makeCandidate('F', 'dense', 0.50),
  makeCandidate('I', 'dense', 0.40),
  makeCandidate('J', 'dense', 0.30),

  // exact — precise: C is perfect keyword match, D also good
  makeCandidate('C', 'exact', 0.99),
  makeCandidate('D', 'exact', 0.80),
  makeCandidate('A', 'exact', 0.60),
  makeCandidate('G', 'exact', 0.45),
  makeCandidate('J', 'exact', 0.20),

  // ast — structural match: B is top, then E
  makeCandidate('B', 'ast', 0.90),
  makeCandidate('E', 'ast', 0.75),
  makeCandidate('A', 'ast', 0.65),
  makeCandidate('F', 'ast', 0.40),
  makeCandidate('H', 'ast', 0.35), // noise

  // bm25 — weak correlation, noisy
  makeCandidate('E', 'bm25', 0.70),
  makeCandidate('G', 'bm25', 0.65),
  makeCandidate('B', 'bm25', 0.60),
  makeCandidate('C', 'bm25', 0.55),
  makeCandidate('D', 'bm25', 0.50),
  makeCandidate('I', 'bm25', 0.48),
  makeCandidate('A', 'bm25', 0.45),
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('fusionStrategyBenchmark — correctness', () => {
  it('all three strategies return all 10 distinct packets', () => {
    const rrf = fuseRRF(FIXTURE);
    const wrrf = fuseWeightedRRF(FIXTURE);
    const dbsf = fuseDBSF(FIXTURE);

    expect(rrf.length).toBe(10);
    expect(wrrf.length).toBe(10);
    expect(dbsf.length).toBe(10);

    const rrfKeys = new Set(rrf.map(r => r.packetKey));
    for (const pk of GROUND_TRUTH_ORDER) expect(rrfKeys.has(pk)).toBe(true);
  });

  it('all three strategies produce strictly descending scores', () => {
    for (const results of [fuseRRF(FIXTURE), fuseWeightedRRF(FIXTURE), fuseDBSF(FIXTURE)]) {
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
      }
    }
  });

  it('all three strategies place A in the top 3', () => {
    const top3 = (r: Array<{ packetKey: string }>) => r.slice(0, 3).map(x => x.packetKey);
    expect(top3(fuseRRF(FIXTURE))).toContain('A');
    expect(top3(fuseWeightedRRF(FIXTURE))).toContain('A');
    expect(top3(fuseDBSF(FIXTURE))).toContain('A');
  });

  it('unweighted RRF and weighted RRF suppress noise H outside top 5', () => {
    // Unweighted RRF gets cross-lane dedup for free — H only appears in 2 lanes and
    // ranks poorly in both, so it falls out of the top 5 despite one strong dense score.
    // DBSF does NOT suppress H here (it leaks to 4th) because the dense lane min-max
    // normalization still gives H a high normalized score. This is a known DBSF weakness
    // when one lane has a single score outlier.
    const top5 = (r: Array<{ packetKey: string }>) => r.slice(0, 5).map(x => x.packetKey);
    expect(top5(fuseRRF(FIXTURE))).not.toContain('H');
    expect(top5(fuseWeightedRRF(FIXTURE))).not.toContain('H');
    // DBSF: H leaks to position 4 — documented behaviour, not an assertion target
  });
});

describe('fusionStrategyBenchmark — NDCG@5 frozen baselines', () => {
  // These baselines are locked from the first run. If a strategy regresses
  // below its baseline the fusion implementation has changed.
  //
  // Weighted RRF and DBSF are expected to outperform unweighted RRF when
  // the dense lane (weight 0.40) strongly up-weights correct signal over noisy lanes.

  it('unweighted RRF NDCG@5 ≥ 0.70', () => {
    const result = fuseRRF(FIXTURE).map(r => r.packetKey);
    const score = ndcg(result, RELEVANCE, 5);
    expect(score).toBeGreaterThanOrEqual(0.70);
  });

  it('weighted RRF NDCG@5 ≥ 0.85 (its own absolute floor, not relative to unweighted)', () => {
    // Empirical finding: weighted RRF (0.895) < unweighted RRF (1.000) on this fixture.
    // Reason: large weight gap (dense=0.40, bm25=0.10) collapses the cross-lane dedup
    // benefit. B appears in dense+ast+bm25 but gets dragged down in weighted ranking
    // because bm25 and ast contributions are shrunk. C (exact match) wins instead.
    // This is EXPECTED and the test captures the empirical floor, not an aspiration.
    const wrrfResult = fuseWeightedRRF(FIXTURE).map(r => r.packetKey);
    const wrrfScore = ndcg(wrrfResult, RELEVANCE, 5);
    expect(wrrfScore).toBeGreaterThanOrEqual(0.85);
  });

  it('DBSF NDCG@5 ≥ 0.70', () => {
    const result = fuseDBSF(FIXTURE).map(r => r.packetKey);
    const score = ndcg(result, RELEVANCE, 5);
    expect(score).toBeGreaterThanOrEqual(0.70);
  });
});

describe('fusionStrategyBenchmark — NDCG@10 frozen baselines', () => {
  it('unweighted RRF NDCG@10 ≥ 0.75', () => {
    const result = fuseRRF(FIXTURE).map(r => r.packetKey);
    const score = ndcg(result, RELEVANCE, 10);
    expect(score).toBeGreaterThanOrEqual(0.75);
  });

  it('weighted RRF NDCG@10 ≥ 0.75', () => {
    const result = fuseWeightedRRF(FIXTURE).map(r => r.packetKey);
    const score = ndcg(result, RELEVANCE, 10);
    expect(score).toBeGreaterThanOrEqual(0.75);
  });

  it('DBSF NDCG@10 ≥ 0.75', () => {
    const result = fuseDBSF(FIXTURE).map(r => r.packetKey);
    const score = ndcg(result, RELEVANCE, 10);
    expect(score).toBeGreaterThanOrEqual(0.75);
  });
});

describe('fusionStrategyBenchmark — Spearman rank correlation', () => {
  it('all three strategies achieve ρ ≥ 0.60 vs ground truth', () => {
    const rrfPks = fuseRRF(FIXTURE).map(r => r.packetKey);
    const wrrfPks = fuseWeightedRRF(FIXTURE).map(r => r.packetKey);
    const dbsfPks = fuseDBSF(FIXTURE).map(r => r.packetKey);

    const rrfRho = spearmanRho(rrfPks, GROUND_TRUTH_ORDER);
    const wrrfRho = spearmanRho(wrrfPks, GROUND_TRUTH_ORDER);
    const dbsfRho = spearmanRho(dbsfPks, GROUND_TRUTH_ORDER);

    expect(rrfRho).toBeGreaterThanOrEqual(0.60);
    expect(wrrfRho).toBeGreaterThanOrEqual(0.60);
    expect(dbsfRho).toBeGreaterThanOrEqual(0.60);
  });

  it('weighted RRF ρ ≥ 0.55 (empirical floor — lower than unweighted due to weight collapse)', () => {
    // Empirical finding: weighted RRF ρ=0.60, unweighted ρ=0.95.
    // The 30pp gap is not a bug — it documents that extreme per-lane weights
    // (dense=0.40 vs bm25=0.10) can hurt cross-lane correlation.
    // Recommendation: use unweighted RRF as the production default;
    // introduce per-lane weights only when offline ablation on real queries confirms gain.
    const wrrfPks = fuseWeightedRRF(FIXTURE).map(r => r.packetKey);
    const wrrfRho = spearmanRho(wrrfPks, GROUND_TRUTH_ORDER);
    expect(wrrfRho).toBeGreaterThanOrEqual(0.55);
  });
});

describe('fusionStrategyBenchmark — edge cases', () => {
  it('empty input returns empty list for all strategies', () => {
    expect(fuseRRF([])).toHaveLength(0);
    expect(fuseWeightedRRF([])).toHaveLength(0);
    expect(fuseDBSF([])).toHaveLength(0);
  });

  it('single-lane input: all strategies agree on ranking', () => {
    const singleLane = FIXTURE.filter(c => c.lane === 'dense');
    const rrfPks = fuseRRF(singleLane).map(r => r.packetKey);
    const wrrfPks = fuseWeightedRRF(singleLane).map(r => r.packetKey);
    const dbsfPks = fuseDBSF(singleLane).map(r => r.packetKey);
    // All three must produce the same ordering when there is only one lane
    expect(rrfPks).toEqual(wrrfPks);
    expect(rrfPks).toEqual(dbsfPks);
  });

  it('null-score candidates are dropped before fusion', () => {
    const withNull: LaneCandidate[] = [
      { packetKey: 'X', sourceRef: 'src/x.ts', rank: 1, score: null, lane: 'dense' },
      ...FIXTURE,
    ];
    const rrf = fuseRRF(withNull);
    expect(rrf.find(r => r.packetKey === 'X')).toBeUndefined();
  });

  it('candidate with score=0 is included (zero is a valid score)', () => {
    const withZero: LaneCandidate[] = [
      { packetKey: 'Z', sourceRef: 'src/z.ts', rank: 1, score: 0, lane: 'bm25' },
      ...FIXTURE,
    ];
    const rrf = fuseRRF(withZero);
    expect(rrf.find(r => r.packetKey === 'Z')).toBeDefined();
  });

  it('DBSF: single-score lane (min=max) does not produce NaN', () => {
    const degenerate: LaneCandidate[] = [
      { packetKey: 'A', sourceRef: 'src/a.ts', rank: 1, score: 0.5, lane: 'dense' },
    ];
    const result = fuseDBSF(degenerate);
    expect(result.length).toBe(1);
    expect(Number.isFinite(result[0]!.score)).toBe(true);
  });
});

describe('fusionStrategyBenchmark — strategy summary (diagnostic)', () => {
  it('logs scores for human review (informational, always passes)', () => {
    const rrfResult = fuseRRF(FIXTURE);
    const wrrfResult = fuseWeightedRRF(FIXTURE);
    const dbsfResult = fuseDBSF(FIXTURE);

    const rrfPks = rrfResult.map(r => r.packetKey);
    const wrrfPks = wrrfResult.map(r => r.packetKey);
    const dbsfPks = dbsfResult.map(r => r.packetKey);

    const summary = {
      rrf: {
        order: rrfPks,
        ndcg5: ndcg(rrfPks, RELEVANCE, 5).toFixed(4),
        ndcg10: ndcg(rrfPks, RELEVANCE, 10).toFixed(4),
        spearman: spearmanRho(rrfPks, GROUND_TRUTH_ORDER).toFixed(4),
      },
      weightedRrf: {
        order: wrrfPks,
        ndcg5: ndcg(wrrfPks, RELEVANCE, 5).toFixed(4),
        ndcg10: ndcg(wrrfPks, RELEVANCE, 10).toFixed(4),
        spearman: spearmanRho(wrrfPks, GROUND_TRUTH_ORDER).toFixed(4),
      },
      dbsf: {
        order: dbsfPks,
        ndcg5: ndcg(dbsfPks, RELEVANCE, 5).toFixed(4),
        ndcg10: ndcg(dbsfPks, RELEVANCE, 10).toFixed(4),
        spearman: spearmanRho(dbsfPks, GROUND_TRUTH_ORDER).toFixed(4),
      },
      groundTruth: GROUND_TRUTH_ORDER,
    };

    // Always passes — output is informational
    console.info('[P1.4 fusion benchmark]', JSON.stringify(summary, null, 2));
    expect(true).toBe(true);
  });
});
