/**
 * Phase 2 SOM Training — Self-Organizing Map Topology
 *
 * Trains a 20×20 SOM on 64-dimensional latent vectors
 * Output: som_cluster (0-399 cluster ID) + som_row, som_col (grid coordinates)
 *
 * Algorithm: Kohonen SOM
 * - Competitive: Find best-matching unit (BMU) for each input
 * - Cooperative: Update BMU neighborhood
 * - Adaptive: Learning rate & neighborhood decay over iterations
 */

export interface SOMLatticePoint {
  row: number;
  col: number;
  weights: number[];
}

export interface SOMTrainingOptions {
  gridSize: number; // 20×20
  iterations: number; // 100-1000
  learningRateStart: number; // 0.5
  learningRateEnd: number; // 0.01
  neighborhoodRadiusStart: number; // 10
  neighborhoodRadiusEnd: number; // 1
  verbose?: boolean;
}

/**
 * Euclidean distance between two vectors
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
 * Find best-matching unit (closest grid point to input vector)
 */
function findBMU(
  input: number[],
  lattice: SOMLatticePoint[][]
): { row: number; col: number; distance: number } {
  let bestDist = Infinity;
  let bestRow = 0,
    bestCol = 0;

  for (let r = 0; r < lattice.length; r++) {
    for (let c = 0; c < lattice[r].length; c++) {
      const dist = distance(input, lattice[r][c].weights);
      if (dist < bestDist) {
        bestDist = dist;
        bestRow = r;
        bestCol = c;
      }
    }
  }

  return { row: bestRow, col: bestCol, distance: bestDist };
}

/**
 * Grid distance between two lattice points
 */
function gridDistance(r1: number, c1: number, r2: number, c2: number): number {
  const dr = r1 - r2;
  const dc = c1 - c2;
  return Math.sqrt(dr * dr + dc * dc);
}

/**
 * Gaussian decay for neighborhood influence
 */
function neighborhoodInfluence(
  gridDist: number,
  radius: number
): number {
  if (gridDist > radius) return 0;
  return Math.exp(-((gridDist * gridDist) / (2 * radius * radius)));
}

/**
 * Train SOM on input vectors
 */
export function trainSOM(
  vectors: number[][],
  options: SOMTrainingOptions
): SOMLatticePoint[][] {
  const { gridSize, iterations, learningRateStart, learningRateEnd, neighborhoodRadiusStart, neighborhoodRadiusEnd, verbose } = options;

  // Initialize lattice with random weights from input distribution
  const lattice: SOMLatticePoint[][] = [];
  for (let r = 0; r < gridSize; r++) {
    const row: SOMLatticePoint[] = [];
    for (let c = 0; c < gridSize; c++) {
      // Random initialization from gaussian
      const weights = new Array(vectors[0].length);
      for (let d = 0; d < weights.length; d++) {
        weights[d] = (Math.random() - 0.5) * 2; // [-1, 1)
      }
      row.push({ row: r, col: c, weights });
    }
    lattice.push(row);
  }

  // Training loop
  for (let iter = 0; iter < iterations; iter++) {
    const progress = iter / iterations;
    const learningRate = learningRateStart * Math.pow(learningRateEnd / learningRateStart, progress);
    const radius = neighborhoodRadiusStart * Math.pow(neighborhoodRadiusEnd / neighborhoodRadiusStart, progress);

    if (verbose && iter % 10 === 0) {
      console.log(`SOM iteration ${iter}/${iterations}, lr=${learningRate.toFixed(4)}, radius=${radius.toFixed(2)}`);
    }

    // For each input vector
    for (const input of vectors) {
      // Find BMU
      const bmu = findBMU(input, lattice);

      // Update BMU and neighborhood
      for (let r = 0; r < gridSize; r++) {
        for (let c = 0; c < gridSize; c++) {
          const gd = gridDistance(r, c, bmu.row, bmu.col);
          const influence = neighborhoodInfluence(gd, radius);

          if (influence > 1e-6) {
            // Update weights
            const weights = lattice[r][c].weights;
            for (let d = 0; d < weights.length; d++) {
              weights[d] += learningRate * influence * (input[d] - weights[d]);
            }
          }
        }
      }
    }
  }

  return lattice;
}

/**
 * Assign input vectors to nearest SOM grid points
 */
export function assignToSOM(
  vectors: number[][],
  lattice: SOMLatticePoint[][]
): Array<{ clusterId: number; row: number; col: number }> {
  return vectors.map((vec) => {
    const bmu = findBMU(vec, lattice);
    const clusterId = bmu.row * lattice.length + bmu.col;
    return { clusterId, row: bmu.row, col: bmu.col };
  });
}

/**
 * Phase 2 SOM configuration
 */
export const somConfig = {
  gridSize: 20,
  iterations: 100, // Quick iteration for proof-of-concept
  learningRateStart: 0.5,
  learningRateEnd: 0.01,
  neighborhoodRadiusStart: 10,
  neighborhoodRadiusEnd: 1,
  totalClusters: 400 // 20×20
};

/**
 * Expected output:
 * - 52,235 vectors assigned to SOM clusters (0-399)
 * - Grid coordinates (row, col) for each vector
 * - Deterministic placement based on latent vector similarity
 *
 * Next phase: use SOM clusters for topology-aware retrieval ranking
 */
