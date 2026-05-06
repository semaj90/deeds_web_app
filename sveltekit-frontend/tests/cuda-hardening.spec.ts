// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import {
  clusterEmbeddings,
  graphSimilarity,
  kmeansWithCentroidsAsync,
  GRAPH_SIM_MAX_N,
} from '$lib/server/gpu/libtorch-bridge.js';

// Intercept worker_threads so kmeansWithCentroidsAsync never spawns a real OS thread.
// The MockWorker mimics the message protocol used by runGpuWorker():
//   1. Constructor schedules the reply via setTimeout(0) so once() calls happen first.
//   2. Emits { ok: true, result: { assignments, centroids, reseeded } } for kmeansWithCentroids.
vi.mock('worker_threads', () => {
  return {
    Worker: class MockWorker {
      private handlers: Record<string, Array<(d: unknown) => void>> = {};

      constructor(_path: string, opts: { workerData: { fn: string; args: unknown[] } }) {
        const { fn, args } = opts.workerData;
        setTimeout(() => {
          if (fn === 'kmeansWithCentroids') {
            const n   = args[1] as number;
            const dim = args[2] as number;
            const k   = args[3] as number;
            this._emit('message', {
              ok: true,
              result: {
                assignments: new Int32Array(n).fill(0),
                centroids:   new Float32Array(k * dim),
                reseeded:    2,
              },
            });
          } else {
            this._emit('message', { ok: false, error: `mock: unknown fn ${fn}` });
          }
        }, 0);
      }

      once(event: string, handler: (d: unknown) => void) {
        (this.handlers[event] ??= []).push(handler);
      }

      _emit(event: string, data: unknown) {
        this.handlers[event]?.forEach((h) => h(data));
      }

      terminate() {}
    },
  };
});

// ── graphSimilarity: hard cap enforcement ─────────────────────────────────────

describe('graphSimilarity safety', () => {
  it('throws RangeError when n > GRAPH_SIM_MAX_N', async () => {
    const oversized = Array.from({ length: GRAPH_SIM_MAX_N + 1 }, () => [1, 0, 0, 0]);
    await expect(graphSimilarity(oversized)).rejects.toThrow(RangeError);
  });

  it('RangeError message names the cap value', async () => {
    const oversized = Array.from({ length: GRAPH_SIM_MAX_N + 1 }, () => [1, 0, 0, 0]);
    await expect(graphSimilarity(oversized)).rejects.toThrow(String(GRAPH_SIM_MAX_N));
  });
});

// ── clusterEmbeddings: k > n guard ───────────────────────────────────────────

describe('clusterEmbeddings safety', () => {
  it('clamps k to n, returns one valid assignment per embedding', async () => {
    const embeddings = [
      [1, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 1, 0],
    ];
    const result = await clusterEmbeddings(embeddings, 10);

    expect(result.k).toBe(3);
    expect(result.assignments.length).toBe(3);
    for (const a of result.assignments) {
      expect(Number.isFinite(a)).toBe(true);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(result.k);
    }
  });

  it('k=1 assigns all embeddings to cluster 0', async () => {
    const embeddings = Array.from({ length: 5 }, (_, i) => [i * 0.1, 0]);
    const result = await clusterEmbeddings(embeddings, 1);
    expect(result.k).toBe(1);
    for (const a of result.assignments) expect(a).toBe(0);
  });

  it('CPU k-means produces no NaN assignments even with near-degenerate input', async () => {
    // All identical vectors → empty clusters likely unless seeded carefully
    const embeddings = Array.from({ length: 6 }, () => [1, 0]);
    const result = await clusterEmbeddings(embeddings, 4);
    expect(result.assignments.length).toBe(6);
    for (const a of result.assignments) {
      expect(Number.isFinite(a)).toBe(true);
    }
  });
});

// ── kmeansWithCentroidsAsync: reseeded field wiring ──────────────────────────

describe('kmeansWithCentroidsAsync reseeded wiring', () => {
  it('result includes reseeded as a number from the native binding', async () => {
    const n = 4, dim = 2, k = 2;
    // Interleaved vectors: [1,0], [0,1], [1,0], [0,1]
    const embeddings = new Float32Array([1, 0, 0, 1, 1, 0, 0, 1]);
    const result = await kmeansWithCentroidsAsync(embeddings, n, dim, k);

    expect(typeof result.reseeded).toBe('number');
    expect(result.reseeded).toBe(2); // matches the mock's fixed value
    expect(result.assignments.length).toBe(n);
    expect(result.centroids.length).toBe(k * dim);
    expect(result.source).toMatch(/^(gpu|cpu)$/);
  });
});
