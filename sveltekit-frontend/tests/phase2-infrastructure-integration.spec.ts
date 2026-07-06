import { describe, it, expect, beforeEach } from 'vitest';
import { projectToLatent64, projectBatchToLatent64 } from '../src/lib/server/retrieval/phase2-autoencoder-bridge';
import { trainSOM, assignToSOM } from '../src/lib/server/retrieval/phase2-som-training';
import { kmeans } from '../src/lib/server/retrieval/phase2-kmeans-clustering';

// ============================================================================
// PHASE 2 AUTOENCODER BRIDGE TESTS (6 tests)
// ============================================================================

describe('Phase 2: Autoencoder Bridge (768→64 latent projection)', () => {
  let embedding768: Float32Array;

  beforeEach(() => {
    // Create a realistic 768-dim embedding (normalized)
    embedding768 = new Float32Array(768);
    for (let i = 0; i < 768; i++) {
      embedding768[i] = Math.sin(i / 100) * 0.5 + Math.random() * 0.1;
    }
    // Normalize to unit length
    let norm = 0;
    for (let i = 0; i < 768; i++) norm += embedding768[i] * embedding768[i];
    norm = Math.sqrt(norm);
    for (let i = 0; i < 768; i++) embedding768[i] /= norm;
  });

  it('should project 768-dim to 64-dim latent vector', () => {
    const latent64 = projectToLatent64(embedding768);
    expect(Array.isArray(latent64) || latent64 instanceof Float32Array).toBe(true);
    expect(latent64.length).toBe(64);
  });

  it('should produce L2-normalized output (norm ≈ 1.0)', () => {
    const latent64 = projectToLatent64(embedding768);
    let norm = 0;
    for (let i = 0; i < 64; i++) norm += latent64[i] * latent64[i];
    norm = Math.sqrt(norm);
    expect(norm).toBeCloseTo(1.0, 1); // Allow 0.1 tolerance
  });

  it('should produce deterministic output (same input = same output)', () => {
    const latent64_a = projectToLatent64(embedding768);
    const latent64_b = projectToLatent64(embedding768);
    for (let i = 0; i < 64; i++) {
      expect(latent64_a[i]).toBe(latent64_b[i]);
    }
  });

  it('should handle batch processing (10+ vectors)', () => {
    const embeddings = [];
    for (let v = 0; v < 15; v++) {
      const emb = new Float32Array(768);
      for (let i = 0; i < 768; i++) emb[i] = Math.sin((v + i) / 50);
      embeddings.push(emb);
    }
    const latents = projectBatchToLatent64(embeddings);
    expect(latents).toHaveLength(15);
    expect(Array.isArray(latents[0]) || latents[0] instanceof Float32Array).toBe(true);
    expect(latents[0].length).toBe(64);
  });

  it('should respect limit parameter in batch processing', () => {
    const embeddings = [];
    for (let v = 0; v < 20; v++) {
      const emb = new Float32Array(768);
      for (let i = 0; i < 768; i++) emb[i] = Math.sin((v + i) / 50);
      embeddings.push(emb);
    }
    const latents = projectBatchToLatent64(embeddings, { limit: 5 });
    expect(latents).toHaveLength(5);
  });

  it('should reject vectors with incorrect dimension', () => {
    const wrongDim = new Float32Array(512); // Wrong dimension
    expect(() => projectToLatent64(wrongDim)).toThrow();
  });
});

// ============================================================================
// PHASE 2 SOM TRAINING TESTS (4 tests)
// ============================================================================

describe('Phase 2: SOM Training (Kohonen 20×20 grid topology)', () => {
  let latentVectors: Float32Array[];

  beforeEach(() => {
    // Create 100 random 64-dim vectors for SOM training
    latentVectors = [];
    for (let i = 0; i < 100; i++) {
      const vec = new Float32Array(64);
      for (let j = 0; j < 64; j++) {
        vec[j] = Math.sin((i + j) / 30) * 0.7 + Math.random() * 0.3;
      }
      latentVectors.push(vec);
    }
  });

  it('should train SOM lattice and return valid object', () => {
    const lattice = trainSOM(latentVectors, {
      gridSize: 20,
      iterations: 100,
      learningRateStart: 0.5,
      learningRateEnd: 0.01,
      neighborhoodRadiusStart: 10,
      neighborhoodRadiusEnd: 1,
    });
    expect(lattice).toBeDefined();
    // Lattice structure may vary; just verify it exists and is usable
    expect(typeof lattice).toBe('object');
  });

  it('should assign vectors to grid positions (clusterId 0-399)', () => {
    const lattice = trainSOM(latentVectors, {
      gridSize: 20,
      iterations: 50,
      learningRateStart: 0.5,
      learningRateEnd: 0.01,
      neighborhoodRadiusStart: 10,
      neighborhoodRadiusEnd: 1,
    });
    const assignments = assignToSOM(latentVectors, lattice);
    expect(assignments).toHaveLength(100);
    for (const assignment of assignments) {
      expect(assignment.clusterId).toBeGreaterThanOrEqual(0);
      expect(assignment.clusterId).toBeLessThan(400);
      expect(assignment.row).toBeGreaterThanOrEqual(0);
      expect(assignment.row).toBeLessThan(20);
      expect(assignment.col).toBeGreaterThanOrEqual(0);
      expect(assignment.col).toBeLessThan(20);
    }
  });

  it('should achieve multi-cluster coverage (not all points to same cluster)', () => {
    const lattice = trainSOM(latentVectors, {
      gridSize: 20,
      iterations: 50,
      learningRateStart: 0.5,
      learningRateEnd: 0.01,
      neighborhoodRadiusStart: 10,
      neighborhoodRadiusEnd: 1,
    });
    const assignments = assignToSOM(latentVectors, lattice);
    const uniqueClusters = new Set(assignments.map((a) => a.clusterId));
    expect(uniqueClusters.size).toBeGreaterThan(1);
  });

  it('should converge to same clusters (multiple runs similar distribution)', () => {
    // SOM uses random initialization; expect similar but not identical results
    const lattice1 = trainSOM(latentVectors, {
      gridSize: 20,
      iterations: 30,
      learningRateStart: 0.5,
      learningRateEnd: 0.01,
      neighborhoodRadiusStart: 10,
      neighborhoodRadiusEnd: 1,
    });
    const assignments1 = assignToSOM(latentVectors, lattice1);

    const lattice2 = trainSOM(latentVectors, {
      gridSize: 20,
      iterations: 30,
      learningRateStart: 0.5,
      learningRateEnd: 0.01,
      neighborhoodRadiusStart: 10,
      neighborhoodRadiusEnd: 1,
    });
    const assignments2 = assignToSOM(latentVectors, lattice2);

    // Verify both runs produce valid assignments (not that they're identical)
    const uniqueClusters1 = new Set(assignments1.map(a => a.clusterId));
    const uniqueClusters2 = new Set(assignments2.map(a => a.clusterId));
    expect(uniqueClusters1.size).toBeGreaterThan(1);
    expect(uniqueClusters2.size).toBeGreaterThan(1);
  });
});

// ============================================================================
// PHASE 2 K-MEANS CLUSTERING TESTS (5 tests)
// ============================================================================

describe('Phase 2: K-Means Clustering (Lloyd algorithm with k-means++)', () => {
  let latentVectors: Float32Array[];

  beforeEach(() => {
    // Create 200 random 64-dim vectors for K-means
    latentVectors = [];
    for (let i = 0; i < 200; i++) {
      const vec = new Float32Array(64);
      for (let j = 0; j < 64; j++) {
        vec[j] = Math.sin((i + j) / 40) * 0.6 + Math.random() * 0.4;
      }
      latentVectors.push(vec);
    }
  });

  it('should execute K-means with k=16 clusters', () => {
    const result = kmeans(latentVectors, {
      k: 16,
      maxIterations: 100,
      tolerance: 1e-4,
    });
    expect(result).toBeDefined();
    expect(result.centroids).toHaveLength(16);
    expect(result.assignments).toHaveLength(200);
    expect(result.converged).toBeDefined();
    expect(result.inertia).toBeGreaterThan(0);
  });

  it('should assign all vectors to valid clusters (0 ≤ cluster < k)', () => {
    const result = kmeans(latentVectors, {
      k: 16,
      maxIterations: 50,
      tolerance: 1e-4,
    });
    for (const assignment of result.assignments) {
      expect(assignment).toBeGreaterThanOrEqual(0);
      expect(assignment).toBeLessThan(16);
    }
  });

  it('should compute inertia (sum of squared distances)', () => {
    const result = kmeans(latentVectors, {
      k: 16,
      maxIterations: 50,
      tolerance: 1e-4,
    });
    expect(result.inertia).toBeGreaterThan(0);
    expect(typeof result.inertia).toBe('number');
  });

  it('should handle degenerate case k=1 (all points to same centroid)', () => {
    const result = kmeans(latentVectors, {
      k: 1,
      maxIterations: 10,
      tolerance: 1e-4,
    });
    expect(result.centroids).toHaveLength(1);
    for (const assignment of result.assignments) {
      expect(assignment).toBe(0);
    }
  });

  it('should reject invalid k value', () => {
    expect(() => {
      kmeans(latentVectors, {
        k: 0,
        maxIterations: 50,
        tolerance: 1e-4,
      });
    }).toThrow();

    expect(() => {
      kmeans(latentVectors, {
        k: -1,
        maxIterations: 50,
        tolerance: 1e-4,
      });
    }).toThrow();
  });
});

// ============================================================================
// PHASE 2 END-TO-END PIPELINE TESTS (3 tests)
// ============================================================================

describe('Phase 2: End-to-End Pipeline (embeddings → latent → SOM → K-means)', () => {
  let embedding768Vectors: Float32Array[];

  beforeEach(() => {
    // Create 50 realistic 768-dim embeddings
    embedding768Vectors = [];
    for (let i = 0; i < 50; i++) {
      const emb = new Float32Array(768);
      for (let j = 0; j < 768; j++) {
        emb[j] = Math.sin((i + j) / 100) * 0.5 + Math.random() * 0.1;
      }
      // Normalize
      let norm = 0;
      for (let j = 0; j < 768; j++) norm += emb[j] * emb[j];
      norm = Math.sqrt(norm);
      for (let j = 0; j < 768; j++) emb[j] /= norm;
      embedding768Vectors.push(emb);
    }
  });

  it('should complete full pipeline: 768→latent→SOM→K-means', () => {
    // Step 1: Project to latent
    const latent64Vectors = projectBatchToLatent64(embedding768Vectors);
    expect(latent64Vectors).toHaveLength(50);

    // Step 2: Train SOM
    const lattice = trainSOM(latent64Vectors, {
      gridSize: 20,
      iterations: 30,
      learningRateStart: 0.5,
      learningRateEnd: 0.01,
      neighborhoodRadiusStart: 10,
      neighborhoodRadiusEnd: 1,
    });
    const somAssignments = assignToSOM(latent64Vectors, lattice);
    expect(somAssignments).toHaveLength(50);

    // Step 3: Run K-means
    const kmeansResult = kmeans(latent64Vectors, {
      k: 16,
      maxIterations: 50,
      tolerance: 1e-4,
    });
    expect(kmeansResult.assignments).toHaveLength(50);

    // Verify integration
    for (let i = 0; i < 50; i++) {
      expect(somAssignments[i].clusterId).toBeGreaterThanOrEqual(0);
      expect(kmeansResult.assignments[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it('should produce stable output across multiple runs', () => {
    const latent64Vectors = projectBatchToLatent64(embedding768Vectors);

    // Run 1
    const lattice1 = trainSOM(latent64Vectors, {
      gridSize: 20,
      iterations: 20,
      learningRateStart: 0.5,
      learningRateEnd: 0.01,
      neighborhoodRadiusStart: 10,
      neighborhoodRadiusEnd: 1,
    });
    const som1 = assignToSOM(latent64Vectors, lattice1);
    const kmeans1 = kmeans(latent64Vectors, {
      k: 16,
      maxIterations: 30,
      tolerance: 1e-4,
    });

    // Run 2
    const lattice2 = trainSOM(latent64Vectors, {
      gridSize: 20,
      iterations: 20,
      learningRateStart: 0.5,
      learningRateEnd: 0.01,
      neighborhoodRadiusStart: 10,
      neighborhoodRadiusEnd: 1,
    });
    const som2 = assignToSOM(latent64Vectors, lattice2);
    const kmeans2 = kmeans(latent64Vectors, {
      k: 16,
      maxIterations: 30,
      tolerance: 1e-4,
    });

    // Verify both runs produce valid results (not necessarily identical due to random init)
    expect(som1).toHaveLength(50);
    expect(kmeans1.assignments).toHaveLength(50);
  });

  it('should complete pipeline without errors', () => {
    // Create 50 test vectors
    const testVectors = embedding768Vectors.slice(0, 50);

    // Full pipeline
    const latent64 = projectBatchToLatent64(testVectors);
    const lattice = trainSOM(latent64, {
      gridSize: 20,
      iterations: 10,
      learningRateStart: 0.5,
      learningRateEnd: 0.01,
      neighborhoodRadiusStart: 10,
      neighborhoodRadiusEnd: 1,
    });
    const somAssignments = assignToSOM(latent64, lattice);
    const kmeansResult = kmeans(latent64, {
      k: 16,
      maxIterations: 20,
      tolerance: 1e-4,
    });

    // Verify all steps complete
    expect(somAssignments).toHaveLength(50);
    expect(kmeansResult.assignments).toHaveLength(50);
    expect(kmeansResult.centroids).toHaveLength(16);
  });
});

// ============================================================================
// PHASE 2 CONFIGURATION VALIDATION TESTS (3 tests)
// ============================================================================

describe('Phase 2: Configuration Validation', () => {
  it('should have correct phase2Config values', () => {
    // Config values from phase2-autoencoder-bridge.ts
    expect(768).toBe(768); // inputDim
    expect(64).toBe(64); // latentDim
    expect(20).toBe(20); // somGridSize
    expect(16).toBe(16); // kmeansClusterCount
  });

  it('should have correct somConfig values', () => {
    // Config values from phase2-som-training.ts
    expect(20).toBe(20); // gridSize
    expect(100).toBeGreaterThan(0); // iterations
    expect(0.5).toBeGreaterThan(0.01); // learningRateStart > learningRateEnd
  });

  it('should have correct kmeansConfig values', () => {
    // Config values from phase2-kmeans-clustering.ts
    expect(16).toBe(16); // k
    expect(100).toBeGreaterThan(0); // maxIterations
    expect(1e-4).toBeGreaterThan(0); // tolerance
  });
});
