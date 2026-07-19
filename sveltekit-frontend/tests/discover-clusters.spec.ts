// @vitest-environment node

/**
 * P2.4 — Cluster discovery contract tests.
 *
 * All hermetic: no Redis, no Qdrant, no GPU.  The centroid store is supplied
 * as a plain fixture so the module under test has zero external dependencies.
 *
 * Covers:
 *  - Browse mode: all clusters returned in ascending ID order, score null
 *  - Browse mode: limit respected
 *  - Semantic mode: clusters ranked by cosine similarity to query vector
 *  - Semantic mode: top cluster scores ≥ lower clusters
 *  - Semantic mode: filter built from top-K cluster IDs
 *  - Semantic mode: filter key is 'som_cluster'
 *  - Empty centroid store returns ok=false without crashing
 *  - Dimension mismatch returns ok=false
 *  - limit defaults to 20
 *  - scoreAllClusters returns all clusters in descending score order
 *  - scoreAllClusters returns raw cosine (no softmax — scores may exceed next entry)
 *  - Identical query and centroid vector scores ~1.0
 *  - Orthogonal query and centroid vector scores ~0.0
 */

import { describe, it, expect } from 'vitest';
import { discoverClusters, scoreAllClusters } from '../src/lib/server/retrieval/discover-clusters.js';
import type { CentroidCacheEntry } from '../src/lib/server/retrieval/prefilter.types.js';

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const DIM = 64;

function makeUnit(dim: number, fillValue: number): Float32Array {
  const v = new Float32Array(dim).fill(fillValue);
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return v.map(x => x / norm);
}

function makeCentroids(count: number): CentroidCacheEntry {
  const flat: number[] = [];
  const ids: number[] = [];
  for (let i = 0; i < count; i++) {
    ids.push(i);
    // Each centroid unit vector along dimension i (mod DIM)
    const v = new Float32Array(DIM);
    v[i % DIM] = 1.0;
    flat.push(...Array.from(v));
  }
  return {
    data: new Float32Array(flat),
    ids,
    trainedAt: '2026-01-01T00:00:00Z',
    count,
    loadedAt: Date.now(),
  };
}

function emptyCentroids(): CentroidCacheEntry {
  return {
    data: new Float32Array(0),
    ids: [],
    trainedAt: '2026-01-01T00:00:00Z',
    count: 0,
    loadedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Browse mode
// ---------------------------------------------------------------------------

describe('discoverClusters — browse mode (no queryVector)', () => {
  it('returns ok=true with all clusters in ascending ID order', () => {
    const centroids = makeCentroids(5);
    const result = discoverClusters(centroids);

    expect(result.ok).toBe(true);
    expect(result.clusters).toHaveLength(5);
    const ids = result.clusters.map(c => c.id);
    expect(ids).toEqual([0, 1, 2, 3, 4]);
  });

  it('sets score to null in browse mode', () => {
    const centroids = makeCentroids(3);
    const result = discoverClusters(centroids);

    result.clusters.forEach(c => expect(c.score).toBeNull());
  });

  it('does not include filter in browse mode', () => {
    const centroids = makeCentroids(3);
    const result = discoverClusters(centroids);

    expect(result.filter).toBeUndefined();
  });

  it('respects limit', () => {
    const centroids = makeCentroids(10);
    const result = discoverClusters(centroids, { limit: 3 });

    expect(result.clusters).toHaveLength(3);
    expect(result.totalClusters).toBe(10);
  });

  it('defaults limit to 20 when not specified', () => {
    const centroids = makeCentroids(25);
    const result = discoverClusters(centroids);

    expect(result.clusters).toHaveLength(20);
    expect(result.totalClusters).toBe(25);
  });

  it('returns all clusters when count < default limit', () => {
    const centroids = makeCentroids(7);
    const result = discoverClusters(centroids);

    expect(result.clusters).toHaveLength(7);
  });

  it('each cluster entry carries its centroid', () => {
    const centroids = makeCentroids(3);
    const result = discoverClusters(centroids);

    result.clusters.forEach(c => {
      expect(c.centroid).toBeInstanceOf(Float32Array);
      expect(c.centroid.length).toBe(DIM);
    });
  });
});

// ---------------------------------------------------------------------------
// Empty centroid store
// ---------------------------------------------------------------------------

describe('discoverClusters — empty centroid store', () => {
  it('returns ok=false when centroid store is empty', () => {
    const result = discoverClusters(emptyCentroids());

    expect(result.ok).toBe(false);
    expect(result.clusters).toHaveLength(0);
    expect(result.totalClusters).toBe(0);
    expect(result.message).toMatch(/empty/i);
  });
});

// ---------------------------------------------------------------------------
// Semantic mode
// ---------------------------------------------------------------------------

describe('discoverClusters — semantic mode (queryVector provided)', () => {
  it('returns ok=true with clusters in descending score order', () => {
    const centroids = makeCentroids(5);
    // Query aligned with centroid 0 (dim 0 unit vector)
    const qv = makeUnit(DIM, 0);
    qv.fill(0);
    qv[0] = 1.0;

    const result = discoverClusters(centroids, { queryVector: qv });

    expect(result.ok).toBe(true);
    expect(result.clusters.length).toBeGreaterThan(0);

    // Scores must be non-increasing
    const scores = result.clusters.map(c => c.score as number);
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });

  it('top cluster is the one most aligned with the query vector', () => {
    const centroids = makeCentroids(8);
    // Query aligned with centroid 3 (unit vector at dim 3)
    const qv = new Float32Array(DIM);
    qv[3] = 1.0;

    const result = discoverClusters(centroids, { queryVector: qv, limit: 8 });

    expect(result.ok).toBe(true);
    expect(result.clusters[0]!.id).toBe(3);
  });

  it('includes a filter in semantic mode', () => {
    const centroids = makeCentroids(5);
    const qv = new Float32Array(DIM);
    qv[0] = 1.0;

    const result = discoverClusters(centroids, { queryVector: qv });

    expect(result.filter).toBeDefined();
    expect(Array.isArray(result.filter!.should)).toBe(true);
    expect(result.filter!.should.length).toBeGreaterThan(0);
  });

  it('filter key is "som_cluster"', () => {
    const centroids = makeCentroids(5);
    const qv = new Float32Array(DIM);
    qv[1] = 1.0;

    const result = discoverClusters(centroids, { queryVector: qv });

    result.filter!.should.forEach(clause => {
      expect(clause.key).toBe('som_cluster');
      expect(typeof clause.match.value).toBe('number');
    });
  });

  it('filter contains exactly the returned cluster IDs', () => {
    const centroids = makeCentroids(10);
    const qv = new Float32Array(DIM);
    qv[2] = 1.0;

    const result = discoverClusters(centroids, { queryVector: qv, limit: 4 });

    const clusterIds = new Set(result.clusters.map(c => c.id));
    const filterIds = new Set(result.filter!.should.map(s => s.match.value));
    expect(filterIds).toEqual(clusterIds);
  });

  it('returns ok=false when query vector dimension does not match centroids', () => {
    const centroids = makeCentroids(3);
    const wrongDim = new Float32Array(32).fill(0.1);

    const result = discoverClusters(centroids, { queryVector: wrongDim });

    expect(result.ok).toBe(false);
    expect(result.clusters).toHaveLength(0);
    expect(result.message).toMatch(/dimension mismatch/i);
  });

  it('scores are numbers in semantic mode', () => {
    const centroids = makeCentroids(4);
    const qv = new Float32Array(DIM);
    qv[0] = 1.0;

    const result = discoverClusters(centroids, { queryVector: qv });

    result.clusters.forEach(c => {
      expect(typeof c.score).toBe('number');
      expect(Number.isFinite(c.score as number)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// scoreAllClusters
// ---------------------------------------------------------------------------

describe('scoreAllClusters', () => {
  it('returns all clusters in descending score order', () => {
    const centroids = makeCentroids(6);
    const qv = new Float32Array(DIM);
    qv[4] = 1.0;

    const ranked = scoreAllClusters(centroids, qv);

    expect(ranked).toHaveLength(6);
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i]!.score).toBeLessThanOrEqual(ranked[i - 1]!.score);
    }
  });

  it('top result is the cluster aligned with the query', () => {
    const centroids = makeCentroids(5);
    const qv = new Float32Array(DIM);
    qv[2] = 1.0;

    const ranked = scoreAllClusters(centroids, qv);

    expect(ranked[0]!.id).toBe(2);
  });

  it('identical vector scores close to 1.0', () => {
    const centroids = makeCentroids(3);
    const qv = new Float32Array(DIM);
    qv[0] = 1.0; // unit vector — identical to centroid 0

    const ranked = scoreAllClusters(centroids, qv);
    const top = ranked.find(r => r.id === 0)!;

    expect(top.score).toBeCloseTo(1.0, 5);
  });

  it('orthogonal vector scores close to 0.0', () => {
    const centroids = makeCentroids(2);
    // Centroid 0 is unit at dim 0; centroid 1 is unit at dim 1
    // Query is unit at dim 1 → orthogonal to centroid 0
    const qv = new Float32Array(DIM);
    qv[1] = 1.0;

    const ranked = scoreAllClusters(centroids, qv);
    const c0 = ranked.find(r => r.id === 0)!;

    expect(c0.score).toBeCloseTo(0.0, 5);
  });
});
