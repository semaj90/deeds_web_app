/**
 * SOM Topic Modeler
 * Provides a small, self-contained Self-Organizing Map trainer and predictor
 */

export type Vector = number[];

export interface SOMOptions {
  width?: number;
  height?: number;
  learningRate?: number;
  radius?: number;
  iterations?: number;
  seed?: number;
}

export interface SOMModel {
  weights: Vector[]; // length = width * height
  width: number;
  height: number;
  dimension: number;
}

/** Simple seedable RNG (mulberry32) */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
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

function indexToXY(index: number, width: number) {
  return { x: index % width, y: Math.floor(index / width) };
}

/** Initialize weights in the bounding box of the input points, or [01] if points empty */
function initWeights(count: number, dim: number, points: Vector[], rng: () => number): Vector[] {
  const weights: Vector[] = new Array(count);
  const min: number[] = new Array(dim).fill(Infinity);
  const max: number[] = new Array(dim).fill(-Infinity);

  if (points.length > 0) {
    for (const p of points) {
      for (let i = 0; i < dim; i++) {
        if (p[i] < min[i]) min[i] = p[i];
        if (p[i] > max[i]) max[i] = p[i];
      }
    }
  } else {
    for (let i = 0; i < dim; i++) {
      min[i] = 0;
      max[i] = 1;
    }
  }

  for (let i = 0; i < count; i++) {
    const w: Vector = new Array(dim);
    for (let d = 0; d < dim; d++) {
      const lo = isFinite(min[d]) ? min[d] : 0;
      const hi = isFinite(max[d]) ? max[d] : lo + 1;
      w[d] = lo + rng() * (hi - lo);
    }
    weights[i] = w;
  }
  return weights;
}

/** Train a SOM on the provided points and return the model */
export function trainSOM(points: Vector[], options: SOMOptions = {}): SOMModel {
  if (!Array.isArray(points)) {
    throw new Error('points must be an array of vectors');
  }
  const width = options.width && options.width > 0 ? Math.floor(options.width) : 10;
  const height = options.height && options.height > 0 ? Math.floor(options.height) : 10;
  const iterations =
    options.iterations && options.iterations > 0 ? Math.floor(options.iterations) : 1000;
  const learningRate0 =
    options.learningRate && options.learningRate > 0 ? options.learningRate : 0.1;
  const radius0 =
    options.radius && options.radius > 0 ? options.radius : Math.max(width, height) / 2;
  const seed = options.seed ?? Date.now();
  const rng = mulberry32(seed);

  if (points.length === 0) {
    throw new Error('trainSOM requires at least one point');
  }

  const dimension = points[0].length;
  for (const p of points) {
    if (!Array.isArray(p) || p.length !== dimension) {
      throw new Error('all points must be vectors of the same length');
    }
  }

  const nodeCount = width * height;
  const weights = initWeights(nodeCount, dimension, points, rng);

  for (let iter = 0; iter < iterations; iter++) {
    const t = iter / iterations;
    const lr = learningRate0 * (1 - t);
    const radius = radius0 * (1 - t);
    const radiusSq = radius * radius;

    // pick random input
    const p = points[Math.floor(rng() * points.length)];

    // find BMU
    let bmuIndex = -1;
    let bestDist = Infinity;
    for (let i = 0; i < nodeCount; i++) {
      const d = euclideanSquared(p, weights[i]);
      if (d < bestDist) {
        bestDist = d;
        bmuIndex = i;
      }
    }

    const bmuXY = indexToXY(bmuIndex, width);

    // update weights of nodes in neighborhood
    for (let i = 0; i < nodeCount; i++) {
      const xy = indexToXY(i, width);
      const dx = xy.x - bmuXY.x;
      const dy = xy.y - bmuXY.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= radiusSq) {
        const influence = Math.exp(-distSq / (2 * radiusSq));
        const coef = lr * influence;
        const w = weights[i];
        for (let d = 0; d < dimension; d++) {
          w[d] += coef * (p[d] - w[d]);
        }
      }
    }
  }

  return {
    weights,
    width,
    height,
    dimension,
  };
}

/** Predict best-matching unit for a point and return index and coordinates */
export function predictSOM(
  model: SOMModel,
  point: Vector
): { index: number; x: number; y: number } {
  if (!model || !Array.isArray(model.weights) || model.weights.length === 0) {
    throw new Error('invalid SOM model');
  }
  if (!Array.isArray(point) || point.length !== model.dimension) {
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
