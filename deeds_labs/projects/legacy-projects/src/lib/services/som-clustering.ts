/**
 * Simple Self-Organizing Map (SOM) implementation in TypeScript
 * Exports trainSOM, predictSOM, and helper types.
 */

export type Vector = number[];

export interface SOMOptions {
  width: number;
  height: number;
  iterations?: number;
  learningRate?: number;
  radius?: number;
  seed?: number;
}

export interface SOMModel {
  weights: Vector[]; // length = width * height
  width: number;
  height: number;
  dimension: number;
}

/* deterministic PRNG */
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function euclideanSquared(a: Vector, b: Vector): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s;
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}

/* initialize weights randomly between min/max of dataset per dimension */
function initializeWeights(
  count: number,
  dim: number,
  points: Vector[],
  rand: () => number
): Vector[] {
  const mins = new Array(dim).fill(Infinity);
  const maxs = new Array(dim).fill(-Infinity);
  for (const p of points) {
    for (let i = 0; i < dim; i++) {
      if (p[i] < mins[i]) mins[i] = p[i];
      if (p[i] > maxs[i]) maxs[i] = p[i];
    }
  }
  // fallback if degenerate
  for (let i = 0; i < dim; i++) {
    if (!isFinite(mins[i])) {
      mins[i] = 0;
      maxs[i] = 1;
    } else if (mins[i] === maxs[i]) {
      // provide a small range
      maxs[i] = mins[i] + 1e-6;
    }
  }

  const weights: Vector[] = new Array(count);
  for (let j = 0; j < count; j++) {
    const w: Vector = new Array(dim);
    for (let i = 0; i < dim; i++) {
      w[i] = mins[i] + rand() * (maxs[i] - mins[i]);
    }
    weights[j] = w;
  }
  return weights;
}

function indexToXY(index: number, width: number): { x: number; y: number } {
  return { x: index % width, y: Math.floor(index / width) };
}

function gridDistanceSq(aIdx: number, bIdx: number, width: number): number {
  const a = indexToXY(aIdx, width);
  const b = indexToXY(bIdx, width);
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Train a SOM on the provided points and return a model.
 */
export function trainSOM(points: Vector[], options: SOMOptions): SOMModel {
  if (!Array.isArray(points) || points.length === 0) {
    throw new Error('points must be a non-empty array of vectors');
  }
  const width = options.width;
  const height = options.height;
  const iterations = options.iterations ?? 1000;
  const initialLR = options.learningRate ?? 0.1;
  const initialRadius = options.radius ?? Math.max(width, height) / 2;
  const seed = options.seed ?? Date.now() & 0xffffffff;
  const rand = mulberry32(seed);

  const dim = points[0].length;
  for (const p of points) {
    if (!Array.isArray(p) || p.length !== dim) {
      throw new Error('all points must have the same dimensionality');
    }
  }

  const count = width * height;
  const weights = initializeWeights(count, dim, points, rand);

  for (let t = 0; t < iterations; t++) {
    // linear decay for learning rate and radius
    const timeFrac = t / Math.max(1, iterations - 1);
    const lr = initialLR * (1 - timeFrac);
    const radius = initialRadius * (1 - timeFrac);
    const radiusSq = radius * radius;

    // sample a random point
    const p = points[Math.floor(rand() * points.length)];

    // find Best Matching Unit (BMU)
    let bmuIndex = 0;
    let bestDist = Infinity;
    for (let i = 0; i < count; i++) {
      const d = euclideanSquared(p, weights[i]);
      if (d < bestDist) {
        bestDist = d;
        bmuIndex = i;
      }
    }

    // update weights within neighborhood
    for (let i = 0; i < count; i++) {
      const gd = gridDistanceSq(i, bmuIndex, width);
      if (gd <= radiusSq) {
        const influence = Math.exp(-gd / (2 * radiusSq || 1));
        const factor = lr * influence;
        const w = weights[i];
        for (let d = 0; d < dim; d++) {
          w[d] += factor * (p[d] - w[d]);
        }
      }
    }
  }

  return {
    weights,
    width,
    height,
    dimension: dim,
  };
}

/**
 * Given a trained SOM model and a point, return the index and coordinates of the BMU.
 */
export function predictSOM(
  model: SOMModel,
  point: Vector
): { index: number; x: number; y: number } {
  if (point.length !== model.dimension) {
    throw new Error('point dimensionality does not match the model');
  }
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < model.weights.length; i++) {
    const d = euclideanSquared(point, model.weights[i]);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  const coords = indexToXY(best, model.width);
  return { index: best, x: coords.x, y: coords.y };
}
