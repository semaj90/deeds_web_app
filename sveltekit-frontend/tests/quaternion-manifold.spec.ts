// @vitest-environment node
/**
 * Unit tests for src/lib/server/search/quaternion-manifold.ts
 *
 * Validates the S³ quaternion geometry layer used by the retrieval spine:
 *   manifold4 → toUnitQuaternion → quaternionSimilarity → neighbourhood/rerank
 */
import { describe, expect, it } from 'vitest';
import type { Manifold4Point } from '../src/lib/server/retrieval/manifold4-search.js';
import {
  toUnitQuaternion,
  quaternionSimilarity,
  quaternionNeighbourhood,
  quaternionRerank,
  decomposeError,
  quaternionError,
  quaternionConjugate,
  standardiseManifold4,
  manifold4ToQuaternion,
  manifold4Similarity,
  DEFAULT_MANIFOLD4_RANGES,
  type Manifold4Ranges,
  standardizeManifold4,
  applyQuaternionAxisMultiplier,
  toStandardizedBiasedQuaternion,
  hmmAxisMultiplierTuple,
  DEFAULT_MANIFOLD4_STANDARDIZATION,
} from '../src/lib/server/search/quaternion-manifold.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** manifold4 = [som_x, som_y, semantic_z, grpo_w] */
function m4(som_x: number, som_y: number, semantic_z: number, grpo_w: number): Manifold4Point {
  return [som_x, som_y, semantic_z, grpo_w];
}

function l2Norm(v: number[]): number {
  return Math.sqrt(v.reduce((s, x) => s + x * x, 0));
}

// ── toUnitQuaternion ─────────────────────────────────────────────────────────

describe('toUnitQuaternion', () => {
  it('produces a unit-length quaternion from any manifold4 point', () => {
    const q = toUnitQuaternion(m4(3, 4, 0, 0));
    expect(l2Norm(q)).toBeCloseTo(1, 10);
  });

  it('produces a unit quaternion for arbitrary non-zero input', () => {
    const q = toUnitQuaternion(m4(1, 2, 3, 4));
    expect(l2Norm(q)).toBeCloseTo(1, 10);
  });

  it('maps manifold4 axes to quaternion w=grpo_w, x=som_x, y=som_y, z=semantic_z', () => {
    // [som_x=0, som_y=0, semantic_z=0, grpo_w=5] → q=[w=1,x=0,y=0,z=0]
    const q = toUnitQuaternion(m4(0, 0, 0, 5));
    expect(q[0]).toBeCloseTo(1, 10); // w = grpo_w / norm
    expect(q[1]).toBeCloseTo(0, 10); // x = som_x / norm
    expect(q[2]).toBeCloseTo(0, 10); // y = som_y / norm
    expect(q[3]).toBeCloseTo(0, 10); // z = semantic_z / norm
  });

  it('handles a zero vector gracefully by using norm=1 fallback', () => {
    const q = toUnitQuaternion(m4(0, 0, 0, 0));
    expect(l2Norm(q)).toBeCloseTo(0, 10); // all zeros remain zeros
  });
});

// ── quaternionSimilarity ─────────────────────────────────────────────────────

describe('quaternionSimilarity', () => {
  it('quaternionSimilarity(q, q) === 1', () => {
    const q = toUnitQuaternion(m4(1, 2, 3, 4));
    expect(quaternionSimilarity(q, q)).toBeCloseTo(1, 10);
  });

  it('quaternionSimilarity(q, -q) === 1 — double-cover of S³', () => {
    const q = toUnitQuaternion(m4(1, 2, 3, 4));
    const negQ: typeof q = [-q[0], -q[1], -q[2], -q[3]];
    // |dot(q, -q)| = |-1| = 1  (same rotation, antipodal representation)
    expect(quaternionSimilarity(q, negQ)).toBeCloseTo(1, 10);
  });

  it('orthogonal quaternions produce score 0', () => {
    const q1 = toUnitQuaternion(m4(1, 0, 0, 0));
    const q2 = toUnitQuaternion(m4(0, 1, 0, 0));
    expect(quaternionSimilarity(q1, q2)).toBeCloseTo(0, 10);
  });

  it('score is symmetric: sim(a,b) === sim(b,a)', () => {
    const a = toUnitQuaternion(m4(1, 2, 0, 3));
    const b = toUnitQuaternion(m4(3, 0, 1, 2));
    expect(quaternionSimilarity(a, b)).toBeCloseTo(quaternionSimilarity(b, a), 10);
  });

  it('score is always in [0, 1]', () => {
    const pairs: [Manifold4Point, Manifold4Point][] = [
      [m4(1, 0, 0, 0), m4(0, 0, 0, 1)],
      [m4(2, 3, 1, 4), m4(-1, 2, -3, 0)],
      [m4(0.5, 0.5, 0.5, 0.5), m4(1, -1, 1, -1)],
    ];
    for (const [a, b] of pairs) {
      const score = quaternionSimilarity(toUnitQuaternion(a), toUnitQuaternion(b));
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });
});

// ── quaternionNeighbourhood ──────────────────────────────────────────────────

describe('quaternionNeighbourhood', () => {
  it('excludes candidates with missing manifold4', () => {
    const query = m4(1, 0, 0, 0);
    const candidates = [
      { id: 'a', manifold4: null },
      { id: 'b', manifold4: undefined },
      { id: 'c', manifold4: m4(1, 0, 0, 0) },
    ];
    const result = quaternionNeighbourhood(query, candidates);
    expect(result).toHaveLength(1);
    expect((result[0] as { id: string }).id).toBe('c');
  });

  it('attaches quaternionScore exactly once per result', () => {
    const query = m4(1, 0, 0, 0);
    const candidates = [{ id: 'a', manifold4: m4(1, 0, 0, 0) }];
    const result = quaternionNeighbourhood(query, candidates);
    expect(result).toHaveLength(1);
    expect(typeof result[0].quaternionScore).toBe('number');
    const keys = Object.keys(result[0]);
    expect(keys.filter((k) => k === 'quaternionScore')).toHaveLength(1);
  });

  it('filters below threshold', () => {
    const query = m4(1, 0, 0, 0);
    const candidates = [
      { id: 'ortho', manifold4: m4(0, 1, 0, 0) },  // orthogonal → score=0
      { id: 'same',  manifold4: m4(1, 0, 0, 0) },  // identical → score=1
    ];
    const result = quaternionNeighbourhood(query, candidates, 0.85);
    expect(result.map((r: { id: string }) => r.id)).toEqual(['same']);
  });

  it('cosThreshold=0 admits all candidates with manifold4', () => {
    const query = m4(1, 0, 0, 0);
    const candidates = [
      { manifold4: m4(0, 1, 0, 0) },
      { manifold4: m4(0, 0, 1, 0) },
      { manifold4: m4(0, 0, 0, 1) },
    ];
    const result = quaternionNeighbourhood(query, candidates, 0);
    expect(result).toHaveLength(3);
  });
});

// ── quaternionRerank ─────────────────────────────────────────────────────────

describe('quaternionRerank', () => {
  it('ranks the nearest manifold4 candidate first', () => {
    const query = m4(1, 0, 0, 0);
    const candidates = [
      { id: 'far',   manifold4: m4(0, 0, 1, 0) },  // orthogonal → score=0
      { id: 'close', manifold4: m4(1, 0, 0, 0) },  // identical → score=1
    ];
    const result = quaternionRerank(query, candidates);
    expect((result[0].item as { id: string }).id).toBe('close');
    expect((result[1].item as { id: string }).id).toBe('far');
  });

  it('candidates without manifold4 receive neutral score 0.5', () => {
    const query = m4(1, 2, 3, 4);
    const candidates = [{ id: 'no-m4', manifold4: null }];
    const result = quaternionRerank(query, candidates);
    expect(result[0].quaternionScore).toBe(0.5);
  });

  it('all scores are in [0, 1]', () => {
    const query = m4(1, 2, 3, 4);
    const candidates = [
      { manifold4: m4(4, 3, 2, 1) },
      { manifold4: m4(-1, -2, -3, -4) },
      { manifold4: null },
    ];
    const result = quaternionRerank(query, candidates);
    for (const r of result) {
      expect(r.quaternionScore).toBeGreaterThanOrEqual(0);
      expect(r.quaternionScore).toBeLessThanOrEqual(1);
    }
  });

  it('preserves all candidates in output (no filtering)', () => {
    const query = m4(1, 0, 0, 0);
    const candidates = Array.from({ length: 10 }, (_, i) => ({
      id: `item-${i}`,
      manifold4: m4(i, 0, 0, 0),
    }));
    const result = quaternionRerank(query, candidates);
    expect(result).toHaveLength(10);
  });
});

// ── decomposeError ───────────────────────────────────────────────────────────

describe('decomposeError', () => {
  it('returns a dominant axis from quaternionError', () => {
    const pred   = toUnitQuaternion(m4(5, 0, 0, 0));
    const actual = toUnitQuaternion(m4(0, 0, 0, 5));
    const qErr   = quaternionError(pred, actual);
    const axes   = decomposeError(qErr);

    expect(axes).toHaveProperty('topology');
    expect(axes).toHaveProperty('semantic');
    expect(axes).toHaveProperty('reward');
    expect(['topology', 'semantic', 'reward']).toContain(axes.dominant);
  });

  it('identity error (pred === actual) yields near-zero axes', () => {
    const q    = toUnitQuaternion(m4(1, 2, 3, 4));
    const qErr = quaternionError(q, q);
    const axes = decomposeError(qErr);
    // q × q⁻¹ = [1,0,0,0], so topology≈0, semantic≈0, reward=|1-1|=0
    expect(axes.topology).toBeCloseTo(0, 5);
    expect(axes.semantic).toBeCloseTo(0, 5);
    expect(axes.reward).toBeCloseTo(0, 5);
  });

  it('dominant is topology when SOM axes dominate', () => {
    // actual = identity (pure grpo_w); pred = equal som_x + grpo_w.
    // q_err = pred × identity⁻¹ = pred ≈ [0.707, 0.707, 0, 0]
    // topology = √(x²+y²) ≈ 0.707, semantic = 0, reward = |1-0.707| ≈ 0.293 → topology wins.
    const actual = toUnitQuaternion(m4(0, 0, 0, 1));  // q = [1, 0, 0, 0]
    const pred   = toUnitQuaternion(m4(1, 0, 0, 1));  // q ≈ [0.707, 0.707, 0, 0]
    const axes   = decomposeError(quaternionError(pred, actual));
    expect(axes.topology).toBeGreaterThan(axes.semantic);
    expect(axes.topology).toBeGreaterThan(axes.reward);
    expect(axes.dominant).toBe('topology');
  });

  it('dominant is semantic when semantic axis dominates', () => {
    // actual = identity; pred = equal semantic_z + grpo_w.
    // q_err ≈ [0.707, 0, 0, 0.707] → topology=0, semantic≈0.707, reward≈0.293 → semantic wins.
    const actual = toUnitQuaternion(m4(0, 0, 0, 1));  // q = [1, 0, 0, 0]
    const pred   = toUnitQuaternion(m4(0, 0, 1, 1));  // q ≈ [0.707, 0, 0, 0.707]
    const axes   = decomposeError(quaternionError(pred, actual));
    expect(axes.semantic).toBeGreaterThan(axes.topology);
    expect(axes.semantic).toBeGreaterThan(axes.reward);
    expect(axes.dominant).toBe('semantic');
  });

  it('dominant is reward when reward phase dominates', () => {
    // pred = antipodal identity → q_err = [-1, 0, 0, 0] → reward = |1 - (-1)| = 2, topology=0, semantic=0.
    const actual = toUnitQuaternion(m4(0, 0, 0, 1));   // q = [1, 0, 0, 0]
    const pred   = toUnitQuaternion(m4(0, 0, 0, -1));  // q = [-1, 0, 0, 0] (antipodal)
    const axes   = decomposeError(quaternionError(pred, actual));
    expect(axes.reward).toBeGreaterThan(axes.topology);
    expect(axes.reward).toBeGreaterThan(axes.semantic);
    expect(axes.dominant).toBe('reward');
  });

  it('axes values are non-negative', () => {
    const pred   = toUnitQuaternion(m4(1, 2, 3, 4));
    const actual = toUnitQuaternion(m4(4, 3, 2, 1));
    const axes   = decomposeError(quaternionError(pred, actual));
    expect(axes.topology).toBeGreaterThanOrEqual(0);
    expect(axes.semantic).toBeGreaterThanOrEqual(0);
    expect(axes.reward).toBeGreaterThanOrEqual(0);
  });

  it('quaternionConjugate negates vector components only', () => {
    const q    = toUnitQuaternion(m4(1, 2, 3, 4));
    const conj = quaternionConjugate(q);
    expect(conj[0]).toBeCloseTo(q[0], 10);   // w unchanged
    expect(conj[1]).toBeCloseTo(-q[1], 10);  // x negated
    expect(conj[2]).toBeCloseTo(-q[2], 10);  // y negated
    expect(conj[3]).toBeCloseTo(-q[3], 10);  // z negated
  });
});

// ── standardiseManifold4 ──────────────────────────────────────────────────────

describe('standardiseManifold4 — axis-scale correction', () => {
  it('already-small values pass through unchanged', () => {
    // All axes within [-1,1] after dividing by their max
    const raw = m4(0.5, 0.3, 0.8, 0.9);
    const std = standardiseManifold4(raw);
    expect(std[0]).toBeCloseTo(0.5 / DEFAULT_MANIFOLD4_RANGES.somMax, 10);
    expect(std[1]).toBeCloseTo(0.3 / DEFAULT_MANIFOLD4_RANGES.somMax, 10);
    expect(std[2]).toBeCloseTo(0.8, 10);
    expect(std[3]).toBeCloseTo(0.9, 10);
  });

  it('large SOM coordinates are clamped to [-1, 1]', () => {
    // Pass explicit somMax=40 to test the clamping mechanism independently of the default
    const ranges: Manifold4Ranges = { somMax: 40, semanticMax: 1, rewardMax: 1 };
    const raw = m4(421, 88, 0.5, 0.8);
    const std = standardiseManifold4(raw, ranges);
    expect(std[0]).toBe(1);   // 421/40=10.5 → clamped to 1
    expect(std[1]).toBe(1);   // 88/40=2.2  → clamped to 1
    expect(std[2]).toBeCloseTo(0.5, 10);
    expect(std[3]).toBeCloseTo(0.8, 10);
  });

  it('all standardised values lie within [-1, 1]', () => {
    const cases: Manifold4Point[] = [
      m4(421, 88, 12.7, 0.83),   // realistic large SOM example
      m4(0, 0, -1, 0),
      m4(40, 40, 1, 1),
      m4(-10, 50, 2.5, 1.5),     // out-of-range on all axes
    ];
    for (const raw of cases) {
      const std = standardiseManifold4(raw);
      for (const v of std) {
        expect(v).toBeGreaterThanOrEqual(-1);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('custom ranges scale correctly', () => {
    const ranges: Manifold4Ranges = { somMax: 100, semanticMax: 2, rewardMax: 2 };
    const raw = m4(50, 100, 1.6, 1.0);
    const std = standardiseManifold4(raw, ranges);
    expect(std[0]).toBeCloseTo(0.5, 10);    // 50/100
    expect(std[1]).toBeCloseTo(1.0, 10);    // 100/100
    expect(std[2]).toBeCloseTo(0.8, 10);    // 1.6/2
    expect(std[3]).toBeCloseTo(0.5, 10);    // 1.0/2
  });

  it('KEY: reward axis is not crushed after standardising large SOM coords', () => {
    // Before standardisation: som_x=421 dominates the norm, grpo_w=0.83 → w/norm ≈ 0.001
    // After standardisation:  som_x→1, grpo_w→0.83 — reward axis is O(1), contributes meaningfully
    const rawLarge = m4(421, 88, 0.5, 0.83);
    const std      = standardiseManifold4(rawLarge);
    const q        = toUnitQuaternion(std);

    // w component (grpo_w) should contribute > 10% of the quaternion direction
    expect(Math.abs(q[0])).toBeGreaterThan(0.10);
  });

  it('without standardisation, large SOM crushes reward axis below 0.5%', () => {
    // Demonstrates why standardisation is needed — DO NOT use raw values
    const rawLarge = m4(421, 88, 0.5, 0.83);
    const qRaw     = toUnitQuaternion(rawLarge);
    // w = 0.83 / norm where norm ≈ sqrt(421²+88²+0.5²+0.83²) ≈ 430
    expect(Math.abs(qRaw[0])).toBeLessThan(0.005);
  });
});

// ── manifold4ToQuaternion (full pipeline) ────────────────────────────────────

describe('manifold4ToQuaternion — standardise → HMM weight → unit quaternion', () => {
  it('returns a unit quaternion for arbitrary large raw values', () => {
    const q = manifold4ToQuaternion(m4(421, 88, 0.5, 0.83), 'LEGAL_AUTHORITY', 0.9);
    expect(l2Norm([...q])).toBeCloseTo(1, 5);
  });

  it('HMM section changes the quaternion direction', () => {
    const raw = m4(10, 10, 0.5, 0.7);
    const qFacts = manifold4ToQuaternion(raw, 'FACTS',    1.0);
    const qClaim = manifold4ToQuaternion(raw, 'CLAIMS',   1.0);
    // FACTS biases topology (som_x/y), CLAIMS biases reward (grpo_w) — directions differ
    const sim = quaternionSimilarity(qFacts, qClaim);
    expect(sim).toBeLessThan(1.0);   // not identical
  });

  it('confidence=0 produces unbiased unit quaternion (same as standardised only)', () => {
    const raw  = m4(20, 15, 0.6, 0.7);
    const std  = standardiseManifold4(raw);
    // At confidence=0, hmmAxisMultiplier gives all-ones → biasedUnitQuaternion = toUnitQuaternion(std)
    const q0   = manifold4ToQuaternion(raw, 'LEGAL_AUTHORITY', 0.0);
    const qStd = toUnitQuaternion(std);
    expect(q0[0]).toBeCloseTo(qStd[0], 5);
    expect(q0[1]).toBeCloseTo(qStd[1], 5);
    expect(q0[2]).toBeCloseTo(qStd[2], 5);
    expect(q0[3]).toBeCloseTo(qStd[3], 5);
  });
});

// ── manifold4Similarity ───────────────────────────────────────────────────────

describe('manifold4Similarity — full pipeline similarity score', () => {
  it('identical raw values → similarity = 1', () => {
    const raw  = m4(421, 88, 0.5, 0.83);
    const sim  = manifold4Similarity(raw, raw, 'FACTS', 0.8);
    expect(sim).toBeCloseTo(1.0, 5);
  });

  it('identical standardised values yield similarity = 1 regardless of scale', () => {
    // Both large-scale (421, 421) and small-scale (0.1, 0.1) for same axes
    const a = m4(400, 80, 0.9, 0.7);
    const b = m4(400, 80, 0.9, 0.7);
    expect(manifold4Similarity(a, b, 'CLAIMS', 1.0)).toBeCloseTo(1.0, 5);
  });

  it('high-reward point ranks above low-reward point in CLAIMS section', () => {
    // CLAIMS biases reward (grpo_w scale 1.6) — high-reward chunk should score higher vs query
    const query      = m4(20, 20, 0.5, 0.9);   // high reward query
    const highReward = m4(20, 20, 0.5, 0.85);  // similar reward
    const lowReward  = m4(20, 20, 0.5, 0.10);  // low reward

    const simHigh = manifold4Similarity(query, highReward, 'CLAIMS', 1.0);
    const simLow  = manifold4Similarity(query, lowReward,  'CLAIMS', 1.0);
    expect(simHigh).toBeGreaterThan(simLow);
  });

  it('topologically adjacent point ranks above distant point in FACTS section', () => {
    // FACTS biases topology — same SOM neighbourhood should score higher
    const query   = m4(20, 20, 0.5, 0.5);
    const near    = m4(22, 21, 0.5, 0.5);   // nearby SOM
    const far     = m4(38, 38, 0.5, 0.5);   // far SOM

    const simNear = manifold4Similarity(query, near, 'FACTS', 1.0);
    const simFar  = manifold4Similarity(query, far,  'FACTS', 1.0);
    expect(simNear).toBeGreaterThan(simFar);
  });

  it('score is in [0, 1]', () => {
    const cases: [Manifold4Point, Manifold4Point][] = [
      [m4(1, 2, 0.5, 0.8), m4(10, 5, -0.3, 0.2)],
      [m4(400, 1, 0.9, 0.1), m4(2, 39, -0.5, 0.99)],
    ];
    for (const [a, b] of cases) {
      const sim = manifold4Similarity(a, b, 'UNKNOWN', 0.5);
      expect(sim).toBeGreaterThanOrEqual(0);
      expect(sim).toBeLessThanOrEqual(1);
    }
  });
});

// ── hmmAxisMultiplier ─────────────────────────────────────────────────────────

import { hmmAxisMultiplier, biasedUnitQuaternion } from '../src/lib/server/search/quaternion-manifold.js';

describe('hmmAxisMultiplier', () => {
  it('returns neutral [1,1,1,1] at confidence = 0 regardless of section', () => {
    for (const section of ['LEGAL_AUTHORITY', 'FACTS', 'CLAIMS', 'PRAYER_HOLDING', 'UNKNOWN'] as const) {
      const m = hmmAxisMultiplier(section, 0);
      expect(m.w).toBeCloseTo(1, 10);
      expect(m.x).toBeCloseTo(1, 10);
      expect(m.y).toBeCloseTo(1, 10);
      expect(m.z).toBeCloseTo(1, 10);
    }
  });

  it('LEGAL_AUTHORITY at confidence=1 boosts semantic (z) above topology (x,y)', () => {
    const m = hmmAxisMultiplier('LEGAL_AUTHORITY', 1);
    expect(m.z).toBeGreaterThan(m.x); // semantic > topology
    expect(m.z).toBeGreaterThan(1);   // semantic is boosted above neutral
  });

  it('FACTS at confidence=1 boosts topology (x,y) above semantic (z)', () => {
    const m = hmmAxisMultiplier('FACTS', 1);
    expect(m.x).toBeGreaterThan(m.z); // topology > semantic
    expect(m.x).toBeGreaterThan(1);   // topology is boosted above neutral
  });

  it('CLAIMS at confidence=1 boosts reward (w) highest', () => {
    const m = hmmAxisMultiplier('CLAIMS', 1);
    expect(m.w).toBeGreaterThan(m.z);
    expect(m.w).toBeGreaterThan(m.x);
  });

  it('scale interpolates linearly between 1 and max at mid confidence', () => {
    const full = hmmAxisMultiplier('LEGAL_AUTHORITY', 1);
    const half = hmmAxisMultiplier('LEGAL_AUTHORITY', 0.5);
    // half.z should be midway between 1 and full.z
    const expected = 1 + (full.z - 1) * 0.5;
    expect(half.z).toBeCloseTo(expected, 10);
  });

  it('clamps confidence above 1', () => {
    const capped = hmmAxisMultiplier('FACTS', 2);
    const full   = hmmAxisMultiplier('FACTS', 1);
    expect(capped.x).toBeCloseTo(full.x, 10);
  });

  it('clamps confidence below 0', () => {
    const clamped  = hmmAxisMultiplier('LEGAL_AUTHORITY', -0.5);
    expect(clamped.z).toBeCloseTo(1, 10);
  });
});

// ── biasedUnitQuaternion ──────────────────────────────────────────────────────

describe('biasedUnitQuaternion', () => {
  it('produces a unit-length quaternion for all section biases', () => {
    const m4 = [1, 2, 3, 4] as const;
    for (const section of ['LEGAL_AUTHORITY', 'FACTS', 'CLAIMS', 'UNKNOWN'] as const) {
      const mult = hmmAxisMultiplier(section, 1);
      const q    = biasedUnitQuaternion(m4 as unknown as import('../src/lib/server/retrieval/manifold4-search.js').Manifold4Point, mult);
      const norm = Math.sqrt(q[0]**2 + q[1]**2 + q[2]**2 + q[3]**2);
      expect(norm).toBeCloseTo(1, 8);
    }
  });

  it('at neutral multiplier, matches toUnitQuaternion output', () => {
    const m4   = [3, 1, 2, 4] as const;
    const neutral = hmmAxisMultiplier('UNKNOWN', 1);
    const biased  = biasedUnitQuaternion(m4 as unknown as import('../src/lib/server/retrieval/manifold4-search.js').Manifold4Point, neutral);
    const plain   = toUnitQuaternion(m4 as unknown as import('../src/lib/server/retrieval/manifold4-search.js').Manifold4Point);
    for (let i = 0; i < 4; i++) expect(biased[i]).toBeCloseTo(plain[i], 8);
  });

  it('LEGAL_AUTHORITY bias shifts the quaternion direction toward semantic axis', () => {
    // m4 = [som_x=1, som_y=1, semantic_z=1, grpo_w=1]
    const m4 = [1, 1, 1, 1] as const;
    const neutral = hmmAxisMultiplier('UNKNOWN', 1);
    const biasedQ = biasedUnitQuaternion(m4 as unknown as import('../src/lib/server/retrieval/manifold4-search.js').Manifold4Point, hmmAxisMultiplier('LEGAL_AUTHORITY', 1));
    const plainQ  = biasedUnitQuaternion(m4 as unknown as import('../src/lib/server/retrieval/manifold4-search.js').Manifold4Point, neutral);
    // semantic_z maps to quaternion z-component — biased should have larger |z|
    expect(Math.abs(biasedQ[3])).toBeGreaterThan(Math.abs(plainQ[3]));
  });
});

// ── standardizeManifold4 (American spelling — separate x/y maxima) ────────────

describe('standardizeManifold4', () => {
  it('standardizes large SOM coordinates before quaternion normalization', () => {
    // raw [400, 20, 0.5, 1] with somXMax=400, somYMax=40 → [1, 0.5, 0.5, 1]
    const result = standardizeManifold4(
      m4(400, 20, 0.5, 1),
      { somXMax: 400, somYMax: 40, semanticZMax: 1, grpoWMax: 1 },
    );
    expect(result[0]).toBeCloseTo(1,   10);  // som_x   / 400 = 1
    expect(result[1]).toBeCloseTo(0.5, 10);  // som_y   / 40  = 0.5
    expect(result[2]).toBeCloseTo(0.5, 10);  // sem_z   / 1   = 0.5
    expect(result[3]).toBeCloseTo(1,   10);  // grpo_w  / 1   = 1
  });

  it('preserves reward contribution after standardization', () => {
    // Without standardization a raw SOM coord of 421 crushes grpo_w in the quaternion.
    // q = toUnitQuaternion([421, 88, 0.5, 0.83]):  q[0] ≈ norm ≈ grpo_w / ‖v‖ << 0.01
    // After standardization (default 40×40 grid) grpo_w stays O(1) → q[0] >> 0.5
    const raw = m4(421, 88, 0.5, 0.83);
    const qRaw = toUnitQuaternion(raw);

    const std = standardizeManifold4(raw);
    const qStd = toUnitQuaternion(std);

    // Raw quaternion: reward component (w=q[0]) is nearly zero
    expect(Math.abs(qRaw[0])).toBeLessThan(0.01);
    // Standardized quaternion: reward component is substantial (SOM axes clamp to 1,
    // so grpo_w = 0.83 contributes ~0.48 of the unit quaternion — vs ~0.002 raw)
    expect(Math.abs(qStd[0])).toBeGreaterThan(0.4);
  });

  it('clamps values exceeding maxima to 1', () => {
    const result = standardizeManifold4(m4(100, 100, 2, 3), { somXMax: 40, somYMax: 40, semanticZMax: 1, grpoWMax: 1 });
    for (const v of result) expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });

  it('treats non-finite maxima as 1 (safe fallback)', () => {
    const result = standardizeManifold4(m4(5, 5, 0.5, 0.5), { somXMax: 0, somYMax: NaN });
    // both fallback to denominator=1; value itself gets clamped
    expect(Number.isFinite(result[0])).toBe(true);
    expect(Number.isFinite(result[1])).toBe(true);
  });

  it('uses DEFAULT_MANIFOLD4_STANDARDIZATION when config is omitted', () => {
    // DEFAULT has somXMax=40, somYMax=40 — divides by 40
    const result = standardizeManifold4(m4(40, 20, 0.5, 0.8));
    expect(result[0]).toBeCloseTo(1,   10);  // 40/40
    expect(result[1]).toBeCloseTo(0.5, 10);  // 20/40
    expect(result[2]).toBeCloseTo(0.5, 10);  // 0.5/1
    expect(result[3]).toBeCloseTo(0.8, 10);  // 0.8/1
  });
});

// ── applyQuaternionAxisMultiplier ─────────────────────────────────────────────

describe('applyQuaternionAxisMultiplier', () => {
  it('applies multiplier tuple [wS,xS,yS,zS] component-wise to manifold4', () => {
    // manifold4 = [som_x, som_y, semantic_z, grpo_w]
    // multiplier = [wScale, xScale, yScale, zScale]
    // → [som_x*xS, som_y*yS, semantic_z*zS, grpo_w*wS]
    const result = applyQuaternionAxisMultiplier(
      m4(1, 2, 3, 4),
      [2, 3, 4, 5],  // [wS=2, xS=3, yS=4, zS=5]
    );
    expect(result[0]).toBeCloseTo(1 * 3, 10); // som_x   * xScale
    expect(result[1]).toBeCloseTo(2 * 4, 10); // som_y   * yScale
    expect(result[2]).toBeCloseTo(3 * 5, 10); // sem_z   * zScale
    expect(result[3]).toBeCloseTo(4 * 2, 10); // grpo_w  * wScale
  });

  it('neutral multiplier [1,1,1,1] leaves manifold4 unchanged', () => {
    const pt = m4(7, 3, 0.6, 0.9);
    const result = applyQuaternionAxisMultiplier(pt, [1, 1, 1, 1]);
    for (let i = 0; i < 4; i++) expect(result[i]).toBeCloseTo(pt[i], 10);
  });
});

// ── toStandardizedBiasedQuaternion ────────────────────────────────────────────

describe('toStandardizedBiasedQuaternion', () => {
  it('output is a unit quaternion for arbitrary raw inputs', () => {
    const multiplier = hmmAxisMultiplierTuple('LEGAL_AUTHORITY', 0.9);
    const q = toStandardizedBiasedQuaternion(m4(421, 88, 0.5, 0.83), multiplier, { somXMax: 40, somYMax: 40 });
    expect(l2Norm(q)).toBeCloseTo(1, 8);
  });

  it('reward-boosted multiplier shifts quaternion w-component higher than neutral', () => {
    // CLAIMS section boosts reward (w-scale > 1), so q[0] (=grpo_w) should be larger
    const raw = m4(20, 20, 0.5, 0.8);
    const neutral  = toStandardizedBiasedQuaternion(raw, [1, 1, 1, 1]);
    const rewarded = toStandardizedBiasedQuaternion(raw, [2, 1, 1, 1]);  // wScale=2
    expect(Math.abs(rewarded[0])).toBeGreaterThan(Math.abs(neutral[0]));
  });

  it('applies HMM axis multiplier after standardization end-to-end', () => {
    // CLAIMS at confidence=1 boosts reward axis — result must differ from neutral
    const raw   = m4(400, 80, 0.5, 0.8);
    const multi = hmmAxisMultiplierTuple('CLAIMS', 1);
    const biasedQ  = toStandardizedBiasedQuaternion(raw, multi,   { somXMax: 40, somYMax: 40 });
    const neutralQ = toStandardizedBiasedQuaternion(raw, [1,1,1,1], { somXMax: 40, somYMax: 40 });
    // Should differ (HMM multiplier is non-trivial at confidence=1)
    const identical = biasedQ.every((v, i) => Math.abs(v - neutralQ[i]) < 1e-9);
    expect(identical).toBe(false);
    // And CLAIMS boosts reward (q[0] = grpo_w channel)
    expect(Math.abs(biasedQ[0])).toBeGreaterThan(Math.abs(neutralQ[0]));
  });

  it('omitting multiplier and config gives same result as standardize→toUnitQuaternion', () => {
    const raw = m4(20, 10, 0.4, 0.7);
    const pipeline = toStandardizedBiasedQuaternion(raw);
    const manual   = toUnitQuaternion(standardizeManifold4(raw));
    for (let i = 0; i < 4; i++) expect(pipeline[i]).toBeCloseTo(manual[i], 8);
  });
});
