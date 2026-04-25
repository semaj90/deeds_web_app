export type Vector = number[];

export interface KMeansOptions {
  k: number;
  maxIterations?: number;
  tolerance?: number;
  seed?: number;
}

export interface KMeansResult {
  centroids: Vector[];
  assignments: number[]; // index of centroid for each point
  iterations: number;
  inertia: number; // sum of squared distances
}

/**
 * Simple seeded RNG (mulberry32) to allow deterministic clustering when seed is provided.
 */
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

function addInto(target: Vector, source: Vector) {
  for (let i = 0; i < target.length; i++) target[i] += source[i];
}

function divScalar(v: Vector, s: number) {
  for (let i = 0; i < v.length; i++) v[i] /= s;
}

function clone(v: Vector): Vector {
  return v.slice();
}

/**
 * kmeans clustering
 * - points: array of vectors (all same dimensionality)
 * - options.k: number of clusters
 * - options.maxIterations: defaults to 100
 * - options.tolerance: centroid movement tolerance to stop (defaults to 1e-4)
 * - options.seed: optional number to make initialization deterministic
 */
export function kmeans(points: Vector[], options: KMeansOptions): KMeansResult {
  if (!Array.isArray(points) || points.length === 0) {
    throw new Error('points must be a non-empty array of vectors');
  }
  const k = options.k;
  if (!Number.isInteger(k) || k <= 0) {
    throw new Error('options.k must be a positive integer');
  }
  if (k > points.length) {
    throw new Error('options.k cannot be greater than number of points');
  }

  const dim = points[0].length;
  for (const p of points) {
    if (!Array.isArray(p) || p.length !== dim) {
      throw new Error('all points must be vectors of the same dimensionality');
    }
    for (const num of p) {
      if (typeof num !== 'number' || !isFinite(num)) {
        throw new Error('points must contain finite numbers');
      }
    }
  }

  const maxIterations = options.maxIterations ?? 100;
  const tolerance = options.tolerance ?? 1e-4;
  const rng = typeof options.seed === 'number' ? mulberry32(options.seed) : Math.random;

  // Initialize centroids by choosing k unique random points
  const indices = new Set<number>();
  while (indices.size < k) {
    const idx = Math.floor(rng() * points.length);
    indices.add(idx);
  }
  let centroids: Vector[] = Array.from(indices).map((i) => clone(points[i]));

  let assignments = new Array<number>(points.length).fill(-1);
  let iterations = 0;
  let inertia = Infinity;

  for (; iterations < maxIterations; iterations++) {
    // Assignment step
    let moved = false;
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      let bestIdx = -1;
      let bestDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = euclideanSquared(p, centroids[c]);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = c;
        }
      }
      if (assignments[i] !== bestIdx) {
        moved = true;
        assignments[i] = bestIdx;
      }
    }

    // Update step
    const sums: Vector[] = new Array(k);
    const counts = new Array<number>(k).fill(0);
    for (let c = 0; c < k; c++) sums[c] = new Array(dim).fill(0);

    for (let i = 0; i < points.length; i++) {
      const a = assignments[i];
      addInto(sums[a], points[i]);
      counts[a]++;
    }

    let maxShift = 0;
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) {
        // Reinitialize empty centroid to a random point
        const idx = Math.floor(rng() * points.length);
        const newCentroid = clone(points[idx]);
        maxShift = Math.max(maxShift, Math.sqrt(euclideanSquared(centroids[c], newCentroid)));
        centroids[c] = newCentroid;
        continue;
      }
      divScalar(sums[c], counts[c]);
      const newCentroid = sums[c];
      const shift = Math.sqrt(euclideanSquared(centroids[c], newCentroid));
      maxShift = Math.max(maxShift, shift);
      centroids[c] = newCentroid;
    }

    if (!moved || maxShift <= tolerance) break;
  }

  // Compute final inertia
  let sse = 0;
  for (let i = 0; i < points.length; i++) {
    const c = assignments[i];
    sse += euclideanSquared(points[i], centroids[c]);
  }
  inertia = sse;

  return {
    centroids,
    assignments,
    iterations,
    inertia,
  };
}

/** Predict cluster index for a single point given centroids */
export function predict(point: Vector, centroids: Vector[]): number {
  if (!Array.isArray(point) || !Array.isArray(centroids) || centroids.length === 0) {
    throw new Error('invalid input to predict');
  }
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < centroids.length; i++) {
    const c = centroids[i];
    if (c.length !== point.length) {
      throw new Error('point and centroid dimensionality mismatch');
    }
    const d = euclideanSquared(point, c);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}
