/**
 * Quaternion operations on manifold4 = [som_x, som_y, semantic_z, grpo_w].
 *
 * The 4D manifold point is normalised to the unit 3-sphere as a quaternion:
 *   q = [w, x, y, z]  where  w=grpo_w, x=som_x, y=som_y, z=semantic_z
 *
 * Why quaternions?
 *   • Unit quaternions live on S³ — angular distance is the natural metric
 *   • |dot(q_a, q_b)| gives cos(θ/2) — a similarity score in [0, 1]
 *   • Quaternion product q_err = q_pred × q_actual⁻¹ decomposes error by axis:
 *       topology component √(x²+y²)  → wrong SOM neighbourhood
 *       semantic component |z|        → wrong semantic region
 *       reward deviation  |1−w|       → retrieved chunk has low GRPO reward
 *   • Bicubic → tricubic upgrade: add grpo_w as a depth parameter so
 *     neighbourhood queries can weight by reward quality, not just SOM proximity
 *
 * ── Axis-scale problem and the standardisation requirement ──────────────────
 *
 * Raw manifold4 coordinates live on very different scales:
 *   som_x, som_y  ∈ [0, SOM_GRID_SIZE]   e.g. [0, 40]
 *   semantic_z    ∈ [-1, 1]               (cosine similarity output)
 *   grpo_w        ∈ [0,  1]              (GRPO reward score)
 *
 * Without standardisation, large SOM coordinates (e.g. 421) dominate the L2
 * norm and compress the reward and semantic axes toward zero, making HMM axis
 * weights useless — the reward axis contribution becomes < 0.1%.
 *
 * Fix: standardiseManifold4() divides each axis by its expected maximum and
 * clamps to [-1, 1].  After standardisation all four axes are O(1) before the
 * HMM multiplier is applied, so every axis can actually steer the quaternion.
 *
 * Correct pipeline:
 *   raw manifold4
 *     → standardiseManifold4()   clamp axes to O(1)
 *     → hmmAxisMultiplier()      scale by HMM section prediction
 *     → biasedUnitQuaternion()   project to unit S³
 *     → quaternionSimilarity()   angular dot-product score
 *
 * ── Analogy to MLA / TurboQuant ─────────────────────────────────────────────
 *
 * MLA (multi-head latent attention):
 *   768-dim KV vector  →  down-project to 64-dim latent
 *   → attention operates on compact latent, not huge KV
 *
 * manifold4 retrieval is the same idea one level up:
 *   embedding + graph signals  →  4-dim manifold4
 *   → standardise + quaternion-normalise
 *   → angular similarity on S³ replaces cosine on R^768
 *
 * TurboQuant / PolarQuant:
 *   KV hidden state  →  random rotation (R)  →  scalar quantisation
 *   This is equivalent to: normalise to unit sphere, then quantise angles.
 *   manifold4 → unit quaternion IS this operation for retrieval geometry.
 *
 * Token-budget compression chain:
 *   raw chunks (many)
 *     → quaternion rerank      ← cheaper than full embedding comparison
 *     → graph rerank           ← fewer candidates
 *     → top-K to Gemma4        ← fewer prompt tokens
 *     → TurboQuant KV cache    ← fewer bits per token already in the model
 *
 * Relationship to TurboQuant:
 *   TurboQuant's PolarQuant step applies a random rotation matrix R before
 *   scalar quantisation — this is equivalent to normalising to a unit sphere
 *   and then quantising the angular coordinates.  Storing manifold4 as a unit
 *   quaternion is the retrieval-side analogue of that operation.
 */

import type { Manifold4Point } from '$lib/server/retrieval/manifold4-search.js';
import type { GlyphSection } from '$lib/server/types/glyph.js';

// ── Types ─────────────────────────────────────────────────────────────────────

/** Unit quaternion [w, x, y, z] — lives on the 3-sphere S³ */
export type UnitQuaternion = [number, number, number, number];

/**
 * Per-axis scale factors for manifold4 components, keyed by quaternion label.
 * Applied BEFORE L2-normalisation so biased axes dominate the direction on S³.
 *
 * Mapping:  w = grpo_w (reward),  x = som_x (topology),
 *           y = som_y (topology), z = semantic_z
 */
export interface HmmAxisMultiplier {
  w: number;  // grpo_w — reward quality axis
  x: number;  // som_x  — SOM topology axis
  y: number;  // som_y  — SOM topology axis
  z: number;  // semantic_z — embedding semantic axis
}

export interface QuaternionErrorAxes {
  /** √(x² + y²) — SOM topology rotation (som_x / som_y axes) */
  topology: number;
  /** |z| — semantic axis deviation */
  semantic: number;
  /** |1 − w| — reward axis deviation (identity = w=1, reward=maximum) */
  reward:   number;
  /** Which axis dominates the error */
  dominant: 'topology' | 'semantic' | 'reward';
}

export interface QuaternionRerankResult<T> {
  item:            T;
  quaternionScore: number;
  errorAxes?:      QuaternionErrorAxes;
}

// ── Core ops ──────────────────────────────────────────────────────────────────

/**
 * Normalise a manifold4 point to a unit quaternion.
 * manifold4 = [som_x, som_y, semantic_z, grpo_w] → q = [w, x, y, z] / |v|
 */
export function toUnitQuaternion(m4: Manifold4Point): UnitQuaternion {
  const [sx, sy, sz, gw] = m4;
  // Map: w=grpo_w (reward), x=som_x, y=som_y, z=semantic_z
  const w    = gw;
  const x    = sx;
  const y    = sy;
  const z    = sz;
  const norm = Math.sqrt(w * w + x * x + y * y + z * z) || 1;
  return [w / norm, x / norm, y / norm, z / norm];
}

/** Quaternion multiplication: Hamilton product a × b */
export function quaternionMultiply(a: UnitQuaternion, b: UnitQuaternion): UnitQuaternion {
  const [w1, x1, y1, z1] = a;
  const [w2, x2, y2, z2] = b;
  return [
    w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
    w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
    w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
    w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
  ];
}

/** Conjugate of a unit quaternion = its inverse on S³ */
export function quaternionConjugate(q: UnitQuaternion): UnitQuaternion {
  return [q[0], -q[1], -q[2], -q[3]];
}

/** Dot product of two quaternions (= cos of half-angle between rotations) */
export function quaternionDot(a: UnitQuaternion, b: UnitQuaternion): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

/**
 * Angular similarity ∈ [0, 1].
 * Uses |dot| because unit quaternions double-cover S³:
 * q and −q represent the same rotation, so |dot| collapses both hemispheres.
 */
export function quaternionSimilarity(a: UnitQuaternion, b: UnitQuaternion): number {
  return Math.abs(quaternionDot(a, b));
}

// ── Error decomposition ───────────────────────────────────────────────────────

/**
 * Compute the error quaternion q_err = q_pred × q_actual⁻¹.
 * Decompose into per-axis contributions to guide retrieval correction.
 */
export function quaternionError(
  pred:   UnitQuaternion,
  actual: UnitQuaternion,
): UnitQuaternion {
  return quaternionMultiply(pred, quaternionConjugate(actual));
}

export function decomposeError(qErr: UnitQuaternion): QuaternionErrorAxes {
  const [w, x, y, z] = qErr;
  const topology = Math.hypot(x, y);
  const semantic = Math.abs(z);
  const reward   = Math.abs(1 - w);   // w=1 is identity (zero error)

  const dominant: QuaternionErrorAxes['dominant'] =
    topology >= semantic && topology >= reward ? 'topology' :
    semantic >= reward                          ? 'semantic' : 'reward';

  return { topology, semantic, reward, dominant };
}

// ── Reranking ─────────────────────────────────────────────────────────────────

/**
 * Rerank `candidates` by quaternion angular similarity to `queryM4`.
 * Candidates without manifold4 receive a neutral score of 0.5.
 */
export function quaternionRerank<T extends { manifold4?: Manifold4Point | null }>(
  queryM4:    Manifold4Point,
  candidates: T[],
): Array<QuaternionRerankResult<T>> {
  const qQ = toUnitQuaternion(queryM4);
  return candidates
    .map((item) => ({
      item,
      quaternionScore: item.manifold4
        ? quaternionSimilarity(qQ, toUnitQuaternion(item.manifold4))
        : 0.5,
    }))
    .sort((a, b) => b.quaternionScore - a.quaternionScore);
}

// ── Bicubic neighbourhood on the unit sphere ──────────────────────────────────

/**
 * Return all candidates whose quaternion angular distance from `queryQ`
 * is within `cosThreshold` (in |dot| terms, 0.85 is a fairly broad angular
 * neighbourhood on S³ — cos⁻¹(0.85) ≈ 31.8° half-angle, ≈63.6° full rotation).
 *
 * This is the quaternion analogue of bicubic neighbourhood on the SOM grid:
 * the reward axis (grpo_w) acts as the depth parameter, allowing same-topology
 * chunks with different reward quality to be ranked independently.
 */
export function quaternionNeighbourhood<T extends { manifold4?: Manifold4Point | null }>(
  queryM4:       Manifold4Point,
  candidates:    T[],
  cosThreshold = 0.85,
): Array<T & { quaternionScore: number }> {
  const qQ = toUnitQuaternion(queryM4);
  // Compute similarity once per candidate — avoids double toUnitQuaternion call.
  return candidates
    .map((c) => {
      if (!c.manifold4) return null;
      const quaternionScore = quaternionSimilarity(qQ, toUnitQuaternion(c.manifold4));
      return quaternionScore >= cosThreshold ? { ...c, quaternionScore } : null;
    })
    .filter((c): c is T & { quaternionScore: number } => c !== null);
}

// ── Euler angles (for observability) ─────────────────────────────────────────

export interface EulerAngles {
  /** α — rotation around Z-axis (semantic tilt), radians */
  yaw:   number;
  /** β — rotation around X-axis (topology roll), radians */
  pitch: number;
  /** γ — rotation around Y-axis (reward phase), radians */
  roll:  number;
}

/** Decompose a unit quaternion into ZXY Euler angles (for logging / debugging). */
export function toEulerAngles(q: UnitQuaternion): EulerAngles {
  const [w, x, y, z] = q;
  const yaw   = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  const pitch = Math.asin(Math.max(-1, Math.min(1, 2 * (w * x - z * y))));
  const roll  = Math.atan2(2 * (w * y + z * x), 1 - 2 * (x * x + y * y));
  return { yaw, pitch, roll };
}

// ── HMM-state → axis predictor ────────────────────────────────────────────────

/**
 * Per-state axis bias table.
 * Each entry is [topology, semantic, reward] scale multipliers — topology
 * applies to both x (som_x) and y (som_y).
 *
 * Rationale:
 *   LEGAL_AUTHORITY → statute/case citations cluster tightly in semantic space
 *   FACTS           → narrative chunks are spatially coherent in the SOM grid
 *   CLAIMS          → high-quality reasoning lives in high-GRPO-reward chunks
 *   PRAYER_HOLDING  → final conclusions from high-reward model outputs
 *   JURISDICTION    → moderately spatial + semantic; jurisdiction collocates
 *   PARTIES         → weak signal; names don't strongly correlate with any axis
 *   UNKNOWN         → no bias; neutral retrieval
 */
export const HMM_AXIS_TABLE: Record<GlyphSection, { topology: number; semantic: number; reward: number }> = {
  LEGAL_AUTHORITY: { topology: 0.70, semantic: 1.80, reward: 1.20 },
  FACTS:           { topology: 1.60, semantic: 1.00, reward: 0.90 },
  CLAIMS:          { topology: 1.00, semantic: 1.20, reward: 1.60 },
  PRAYER_HOLDING:  { topology: 0.90, semantic: 1.10, reward: 1.70 },
  JURISDICTION:    { topology: 1.30, semantic: 1.20, reward: 0.90 },
  PARTIES:         { topology: 1.10, semantic: 1.00, reward: 0.90 },
  UNKNOWN:         { topology: 1.00, semantic: 1.00, reward: 1.00 },
};

/**
 * Compute per-axis scale multipliers from an HMM section prediction.
 *
 * Confidence gates the bias:  scale = 1 + (base − 1) × confidence
 *   confidence = 0 → all scales = 1 (neutral, no prediction signal)
 *   confidence = 1 → full table values
 *
 * The returned [w, x, y, z] map directly to manifold4 components before
 * L2-normalisation:  w = grpo_w,  x = som_x,  y = som_y,  z = semantic_z
 */
export function hmmAxisMultiplier(
  section:    GlyphSection,
  confidence: number,
): HmmAxisMultiplier {
  const c     = Math.max(0, Math.min(1, confidence));
  const bias  = HMM_AXIS_TABLE[section] ?? HMM_AXIS_TABLE.UNKNOWN;
  const lerp  = (base: number) => 1 + (base - 1) * c;
  return {
    w: lerp(bias.reward),    // grpo_w
    x: lerp(bias.topology),  // som_x
    y: lerp(bias.topology),  // som_y
    z: lerp(bias.semantic),  // semantic_z
  };
}

/**
 * Normalise a manifold4 point to a unit quaternion, with per-axis bias applied
 * before normalisation.  The bias scales the raw components so the predicted
 * "important" axes contribute more to the S³ direction — making the dot-product
 * similarity more sensitive to those axes.
 *
 * Equivalent to toUnitQuaternion when mult = { w:1, x:1, y:1, z:1 }.
 *
 * manifold4 = [som_x, som_y, semantic_z, grpo_w]
 *   → biased raw: w = grpo_w * mult.w, x = som_x * mult.x, y = som_y * mult.y, z = semantic_z * mult.z
 *   → L2-normalise → UnitQuaternion
 */
export function biasedUnitQuaternion(
  m4:   Manifold4Point,
  mult: HmmAxisMultiplier,
): UnitQuaternion {
  const [sx, sy, sz, gw] = m4;
  const w    = gw * mult.w;
  const x    = sx * mult.x;
  const y    = sy * mult.y;
  const z    = sz * mult.z;
  const norm = Math.sqrt(w * w + x * x + y * y + z * z) || 1;
  return [w / norm, x / norm, y / norm, z / norm];
}

// ── Axis standardisation ──────────────────────────────────────────────────────

/**
 * Per-axis expected maximum magnitudes used to normalise raw manifold4 values.
 *
 * SOM grid size should match the grid configured in the SOM pipeline
 * (default 40).  semantic_z is a cosine-similarity output ∈ [-1,1].
 * grpo_w is a GRPO reward score ∈ [0,1].
 */
export interface Manifold4Ranges {
  /** Maximum absolute value for som_x (SOM grid columns). Default: 40 */
  somMax:      number;
  /** Maximum absolute value for semantic_z. Default: 1 (cosine range) */
  semanticMax: number;
  /** Maximum absolute value for grpo_w. Default: 1 (reward range) */
  rewardMax:   number;
}

export const DEFAULT_MANIFOLD4_RANGES: Manifold4Ranges = {
  somMax:      40,
  semanticMax: 1,
  rewardMax:   1,
};

/**
 * Standardise a raw manifold4 point so every axis is in [-1, 1] before
 * applying HMM weights and normalising to the unit quaternion.
 *
 * Without this step, large SOM coordinates (e.g. 421) swamp the norm and
 * reduce the reward/semantic axes to < 0.1% of the quaternion direction,
 * making HMM axis multipliers effectively inert.
 *
 * Mapping:
 *   som_x_std    = clamp(som_x    / ranges.somMax,      -1, 1)
 *   som_y_std    = clamp(som_y    / ranges.somMax,      -1, 1)
 *   semantic_std = clamp(semantic_z / ranges.semanticMax, -1, 1)
 *   reward_std   = clamp(grpo_w   / ranges.rewardMax,   -1, 1)
 */
export function standardiseManifold4(
  m4:     Manifold4Point,
  ranges: Manifold4Ranges = DEFAULT_MANIFOLD4_RANGES,
): Manifold4Point {
  const clamp = (v: number, lo: number, hi: number) =>
    Math.max(lo, Math.min(hi, v));

  const [sx, sy, sz, gw] = m4;
  return [
    clamp(sx / ranges.somMax,       -1, 1),
    clamp(sy / ranges.somMax,       -1, 1),
    clamp(sz / ranges.semanticMax,  -1, 1),
    clamp(gw / ranges.rewardMax,    -1, 1),
  ];
}

// ── Full pipeline convenience ──────────────────────────────────────────────────

/**
 * End-to-end pipeline: raw manifold4 → unit quaternion on S³.
 *
 * Steps:
 *   1. standardiseManifold4  — bring all axes to O(1)
 *   2. hmmAxisMultiplier     — scale by section confidence
 *   3. biasedUnitQuaternion  — project to unit S³
 *
 * This is the correct call sequence.  Callers that previously called
 * toUnitQuaternion() or biasedUnitQuaternion() on raw manifold4 values
 * should migrate to this function.
 */
export function manifold4ToQuaternion(
  rawM4:      Manifold4Point,
  section:    GlyphSection,
  confidence: number,
  ranges?:    Manifold4Ranges,
): UnitQuaternion {
  const std  = standardiseManifold4(rawM4, ranges);
  const mult = hmmAxisMultiplier(section, confidence);
  return biasedUnitQuaternion(std, mult);
}

/**
 * Quaternion similarity between two raw manifold4 points, both standardised
 * and HMM-weighted before comparison.  Returns a score in [0, 1].
 *
 * Use this as a drop-in replacement for bare quaternionSimilarity() calls
 * when raw (un-standardised) manifold4 values are available.
 */
export function manifold4Similarity(
  rawA:       Manifold4Point,
  rawB:       Manifold4Point,
  section:    GlyphSection,
  confidence: number,
  ranges?:    Manifold4Ranges,
): number {
  const qA = manifold4ToQuaternion(rawA, section, confidence, ranges);
  const qB = manifold4ToQuaternion(rawB, section, confidence, ranges);
  return quaternionSimilarity(qA, qB);
}

// ── HMM axis multiplier (tuple API) ──────────────────────────────────────────

/**
 * Confidence-gated per-axis scale multipliers from an HMM section prediction.
 *
 * Returns a tuple `[wScale, xScale, yScale, zScale]` that maps directly to
 * manifold4 quaternion components:
 *   w = grpo_w (reward),  x = som_x (topology),
 *   y = som_y (topology), z = semantic_z
 *
 * Confidence gate:  scale = 1 + (base − 1) × confidence
 *   confidence = 0 → all scales = 1.0 (neutral)
 *   confidence = 1 → full HMM_AXIS_TABLE bias
 *
 * HMM_AXIS_TABLE conservative starting values:
 *   LEGAL_AUTHORITY: w=1.1, x=0.9, y=0.9, z=1.3  — semantic_z up, topology down
 *   FACTS:           w=0.9, x=1.2, y=1.2, z=1.0  — topology up, reward slight down
 *   CLAIMS:          w=1.2, x=1.0, y=1.0, z=1.1  — reward up, semantic mild up
 *   PRAYER_HOLDING:  w=1.2, x=1.0, y=1.0, z=1.1  — same as CLAIMS
 *   JURISDICTION:    w=1.0, x=1.15,y=1.15,z=1.2  — topology + semantic
 *   PARTIES:         w=1.0, x=1.0, y=1.0, z=1.0  — neutral
 *   UNKNOWN:         w=1.0, x=1.0, y=1.0, z=1.0  — neutral
 */
const HMM_AXIS_TUPLE_TABLE: Record<GlyphSection, [number, number, number, number]> = {
  // [wScale, xScale, yScale, zScale]  →  [grpo_w, som_x, som_y, semantic_z]
  LEGAL_AUTHORITY: [1.1, 0.9,  0.9,  1.3 ],
  FACTS:           [0.9, 1.2,  1.2,  1.0 ],
  CLAIMS:          [1.2, 1.0,  1.0,  1.1 ],
  PRAYER_HOLDING:  [1.2, 1.0,  1.0,  1.1 ],
  JURISDICTION:    [1.0, 1.15, 1.15, 1.2 ],
  PARTIES:         [1.0, 1.0,  1.0,  1.0 ],
  UNKNOWN:         [1.0, 1.0,  1.0,  1.0 ],
};

export function hmmAxisMultiplierTuple(
  section:    GlyphSection,
  confidence: number,
): [number, number, number, number] {
  const c    = Math.max(0, Math.min(1, confidence));
  const base = HMM_AXIS_TUPLE_TABLE[section] ?? HMM_AXIS_TUPLE_TABLE.UNKNOWN;
  const lerp = (b: number) => 1 + (b - 1) * c;
  return [lerp(base[0]), lerp(base[1]), lerp(base[2]), lerp(base[3])];
}

/**
 * Normalise a manifold4 point to a unit quaternion, applying a tuple multiplier
 * `[wScale, xScale, yScale, zScale]` to the raw components before L2-normalisation.
 *
 * multiplier[0] = wScale → grpo_w
 * multiplier[1] = xScale → som_x
 * multiplier[2] = yScale → som_y
 * multiplier[3] = zScale → semantic_z
 *
 * Equivalent to `toUnitQuaternion` when multiplier = [1, 1, 1, 1].
 */
export function biasedUnitQuaternionTuple(
  m4:         Manifold4Point,
  multiplier: [number, number, number, number],
): UnitQuaternion {
  const [sx, sy, sz, gw] = m4;
  const [wScale, xScale, yScale, zScale] = multiplier;
  const scaledM4: Manifold4Point = [sx * xScale, sy * yScale, sz * zScale, gw * wScale];
  return toUnitQuaternion(scaledM4);
}

// ── Standardised pipeline (primary ACE-facing API) ───────────────────────────
//
// Rule: NEVER apply HMM multipliers to raw manifold4 coordinates.
// Always:  standardize → weight → normalize → compare
//
// The functions below form the canonical ACE-facing stack.  Internal helpers
// (toUnitQuaternion, biasedUnitQuaternion, standardiseManifold4) remain for
// callers that already normalise upstream.

/**
 * Per-axis scale configuration for raw manifold4 standardisation.
 *
 * SOM coordinates can be large grid indices (0–400+); grpo_w and semantic_z
 * are already probability/similarity values in [0, 1].  Dividing by these
 * maxima brings every axis to O(1) before HMM multipliers are applied.
 */
export interface Manifold4StandardizationConfig {
  /** Maximum absolute value for som_x. Example: SOM grid width (default 40). */
  somXMax: number;
  /** Maximum absolute value for som_y. Example: SOM grid height (default 40). */
  somYMax: number;
  /** Maximum absolute value for semantic_z. Default 1 (cosine range). */
  semanticZMax: number;
  /** Maximum absolute value for grpo_w (reward). Default 1. */
  grpoWMax: number;
}

export const DEFAULT_MANIFOLD4_STANDARDIZATION: Manifold4StandardizationConfig = {
  somXMax:      40,
  somYMax:      40,
  semanticZMax: 1,
  grpoWMax:     1,
};

/** Axis scale tuple `[wScale, xScale, yScale, zScale]` from `hmmAxisMultiplierTuple`. */
export type QuaternionAxisMultiplier = [number, number, number, number];

function _clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

function _safeScale(value: number, maxAbs: number): number {
  const denom = Number.isFinite(maxAbs) && Math.abs(maxAbs) > 0 ? Math.abs(maxAbs) : 1;
  return _clampUnit(value / denom);
}

/**
 * Standardise raw manifold4 axes so each component is in [-1, 1].
 *
 * Uses separate X/Y maxima so non-square SOM grids are handled correctly.
 * American-spelling alias for callers who prefer `standardize`.
 */
export function standardizeManifold4(
  m4:     Manifold4Point,
  config: Partial<Manifold4StandardizationConfig> = {},
): Manifold4Point {
  const cfg = { ...DEFAULT_MANIFOLD4_STANDARDIZATION, ...config };
  const [somX, somY, semanticZ, grpoW] = m4;
  return [
    _safeScale(somX,     cfg.somXMax),
    _safeScale(somY,     cfg.somYMax),
    _safeScale(semanticZ, cfg.semanticZMax),
    _safeScale(grpoW,    cfg.grpoWMax),
  ] as Manifold4Point;
}

/**
 * Apply a `QuaternionAxisMultiplier` tuple `[wScale, xScale, yScale, zScale]`
 * to a manifold4 point.  The tuple maps:
 *   multiplier[0] = wScale → grpo_w
 *   multiplier[1] = xScale → som_x
 *   multiplier[2] = yScale → som_y
 *   multiplier[3] = zScale → semantic_z
 *
 * Call this AFTER `standardizeManifold4` and BEFORE `toUnitQuaternion`.
 */
export function applyQuaternionAxisMultiplier(
  m4:         Manifold4Point,
  multiplier: QuaternionAxisMultiplier,
): Manifold4Point {
  const [somX, somY, semanticZ, grpoW] = m4;
  const [wScale, xScale, yScale, zScale] = multiplier;
  return [somX * xScale, somY * yScale, semanticZ * zScale, grpoW * wScale] as Manifold4Point;
}

/**
 * Full safe pipeline: raw manifold4 → unit quaternion on S³.
 *
 *   1. standardizeManifold4(m4, config)   → axes in [-1, 1]
 *   2. applyQuaternionAxisMultiplier(std, multiplier) → HMM-biased manifold4
 *   3. toUnitQuaternion(biased)            → UnitQuaternion on S³
 *
 * This is the canonical ACE-facing function.  Use `hmmAxisMultiplierTuple()`
 * to compute `multiplier` from an HMM section prediction.
 *
 * Example:
 *   const multiplier = hmmAxisMultiplierTuple('CLAIMS', 0.9);
 *   const q = toStandardizedBiasedQuaternion(rawManifold4, multiplier, {
 *     somXMax: somGridWidth,
 *     somYMax: somGridHeight,
 *   });
 */
export function toStandardizedBiasedQuaternion(
  m4:         Manifold4Point,
  multiplier: QuaternionAxisMultiplier = [1, 1, 1, 1],
  config:     Partial<Manifold4StandardizationConfig> = {},
): UnitQuaternion {
  const standardized = standardizeManifold4(m4, config);
  const biased       = applyQuaternionAxisMultiplier(standardized, multiplier);
  return toUnitQuaternion(biased);
}
