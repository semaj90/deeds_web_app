/**
 * Phase 2 K-Means Clustering — Feature Grouping
 *
 * Clusters 64-dimensional latent vectors into K groups (default 16)
 * Output: kmeans_cluster (0-(K-1) cluster ID) + centroid location
 *
 * Algorithm: Lloyd's K-Means with k-means++ initialization
 * - Deterministic initialization (k-means++)
 * - Iterative reassignment + centroid update
 * - Convergence when centroid movement < threshold
 */

export interface Centroid {
  id: number;
  center: number[];
  size: number;
}

export interface KMeansResult {
  centroids: Centroid[];
  assignments: number[]; // Vector i assigned to cluster assignments[i]
  iterations: number;
  converged: boolean;
  inertia: number; // Sum of squared distances
}

export interface KMeansOptions {
  k: number; // Number of clusters
  maxIterations?: number; // Default 100
  tolerance?: number; // Default 1e-4
  verbose?: boolean;
}

/**
 * Euclidean distance
 */
function distance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

/**
 * K-means++ initialization
 * Spreads initial centroids far apart for faster convergence
 */
function kmeansPlusplusInit(vectors: number[][], k: number): number[][] {
  if (k > vectors.length) {
    throw new Error(`k (${k}) cannot exceed vector count (${vectors.length})`);
  }

  const centroids: number[][] = [];
  const chosen = new Set<number>();

  // Choose first centroid randomly
  const first = Math.floor(Math.random() * vectors.length);
  centroids.push([...vectors[first]]);
  chosen.add(first);

  // Choose remaining centroids
  for (let i = 1; i < k; i++) {
    let maxDist = -1;
    let bestIdx = -1;

    // Find point furthest from all existing centroids
    for (let j = 0; j < vectors.length; j++) {
      if (chosen.has(j)) continue;

      let minDistToCentroid = Infinity;
      for (const centroid of centroids) {
        const d = distance(vectors[j], centroid);
        if (d < minDistToCentroid) {
          minDistToCentroid = d;
        }
      }

      // Weight by distance probability
      if (minDistToCentroid > maxDist) {
        maxDist = minDistToCentroid;
        bestIdx = j;
      }
    }

    if (bestIdx >= 0) {
      centroids.push([...vectors[bestIdx]]);
      chosen.add(bestIdx);
    }
  }

  return centroids;
}

/**
 * Assign vectors to nearest centroid
 */
function assignVectors(vectors: number[][], centroids: number[][]): number[] {
  return vectors.map((vec) => {
    let bestCluster = 0;
    let bestDist = Infinity;

    for (let i = 0; i < centroids.length; i++) {
      const d = distance(vec, centroids[i]);
      if (d < bestDist) {
        bestDist = d;
        bestCluster = i;
      }
    }

    return bestCluster;
  });
}

/**
 * Compute new centroids from assignments
 */
function computeCentroids(vectors: number[][], assignments: number[], k: number): number[][] {
  const sums: number[][] = new Array(k);
  const counts: number[] = new Array(k).fill(0);

  for (let i = 0; i < k; i++) {
    sums[i] = new Array(vectors[0].length).fill(0);
  }

  for (let i = 0; i < vectors.length; i++) {
    const cluster = assignments[i];
    counts[cluster]++;
    for (let d = 0; d < vectors[i].length; d++) {
      sums[cluster][d] += vectors[i][d];
    }
  }

  const newCentroids: number[][] = [];
  for (let i = 0; i < k; i++) {
    const centroid = new Array(vectors[0].length);
    for (let d = 0; d < vectors[0].length; d++) {
      centroid[d] = counts[i] > 0 ? sums[i][d] / counts[i] : sums[i][d];
    }
    newCentroids.push(centroid);
  }

  return newCentroids;
}

/**
 * Compute inertia (sum of squared distances to nearest centroid)
 */
function computeInertia(vectors: number[][], assignments: number[], centroids: number[][]): number {
  let sum = 0;
  for (let i = 0; i < vectors.length; i++) {
    const d = distance(vectors[i], centroids[assignments[i]]);
    sum += d * d;
  }
  return sum;
}

/**
 * Main K-means algorithm
 */
export function kmeans(vectors: number[][], options: KMeansOptions): KMeansResult {
  const { k, maxIterations = 100, tolerance = 1e-4, verbose = false } = options;

  if (k <= 0 || k > vectors.length) {
    throw new Error(`Invalid k=${k}, must be in [1, ${vectors.length}]`);
  }

  // Initialize centroids
  let centroids = kmeansPlusplusInit(vectors, k);

  let assignments: number[] = [];
  let converged = false;
  let iteration = 0;

  for (iteration = 0; iteration < maxIterations; iteration++) {
    // E-step: assign vectors to nearest centroid
    const newAssignments = assignVectors(vectors, centroids);

    // Check convergence
    const changed = newAssignments.some((v, i) => v !== assignments[i]);
    assignments = newAssignments;

    // M-step: compute new centroids
    const newCentroids = computeCentroids(vectors, assignments, k);

    // Check centroid movement
    let centroidShift = 0;
    for (let i = 0; i < k; i++) {
      centroidShift += distance(centroids[i], newCentroids[i]);
    }

    centroids = newCentroids;

    if (verbose && iteration % 10 === 0) {
      const inertia = computeInertia(vectors, assignments, centroids);
      console.log(`K-means iteration ${iteration}/${maxIterations}, shift=${centroidShift.toFixed(6)}, inertia=${inertia.toFixed(2)}`);
    }

    if (!changed && centroidShift < tolerance) {
      converged = true;
      iteration++;
      break;
    }
  }

  const inertia = computeInertia(vectors, assignments, centroids);

  // Build result with centroid metadata
  const result: KMeansResult = {
    centroids: centroids.map((center, id) => ({
      id,
      center,
      size: assignments.filter((a) => a === id).length
    })),
    assignments,
    iterations: iteration,
    converged,
    inertia
  };

  if (verbose) {
    console.log(`✓ K-means converged in ${iteration} iterations`);
    console.log(`  Cluster sizes: ${result.centroids.map((c) => c.size).join(', ')}`);
    console.log(`  Inertia: ${inertia.toFixed(2)}`);
  }

  return result;
}

/**
 * Phase 2 K-means configuration
 */
export const kmeansConfig = {
  k: 16, // Initial cluster count (tunable: 8-32)
  maxIterations: 100,
  tolerance: 1e-4
};

/**
 * Expected output:
 * - 52,235 vectors assigned to K clusters (0-15 for k=16)
 * - Centroid locations for each cluster
 * - Inertia metric for cluster quality assessment
 *
 * Tuning: Measure silhouette score or Davies-Bouldin index
 * to find optimal K between 8-32
 *
 * Next phase: use K-means clusters for fast candidate filtering
 */
