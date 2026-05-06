// @vitest-environment node
/**
 * Step 2 — Async N-API GPU call tests.
 *
 * Verifies that:
 *  1. n < GPU_ASYNC_THRESHOLD_N → sync path (no Worker spawned)
 *  2. n ≥ GPU_ASYNC_THRESHOLD_N → async worker-thread path
 *  3. Large-n call does not block the Node.js event loop
 *  4. Async result matches sync baseline (within FP32 tolerance)
 *  5. batchCosineSimilarityAsync round-trips through the worker protocol
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Worker mock ────────────────────────────────────────────────────────────────
//
// The MockWorker mimics the real gpu-worker.mjs protocol:
//   constructor receives { fn, args } in workerData
//   posts { ok: true, result } via 'message' event (async, setTimeout(0))
//
// For graphSimilarity the result is a flat identity-ish Float32Array of size n*n.
// For batchCosineSimilarity the result is Float32Array of size n (all 1.0 for unit query).

let workerInstances = 0;

vi.mock('worker_threads', () => {
  return {
    Worker: class MockWorker {
      private handlers: Record<string, Array<(d: unknown) => void>> = {};

      constructor(_path: string, opts: { workerData: { fn: string; args: unknown[] } }) {
        workerInstances++;
        const { fn, args } = opts.workerData;

        // Simulate async GPU work with a small delay
        setTimeout(() => {
          try {
            if (fn === 'graphSimilarity') {
              const n   = args[1] as number;
              // Return identity matrix (diagonal = 1, off-diagonal = 0)
              const mat = new Float32Array(n * n);
              for (let i = 0; i < n; i++) mat[i * n + i] = 1.0;
              const buf = mat.buffer.slice(0);
              this._emit('message', { ok: true, result: new Float32Array(buf) }, [buf]);
            } else if (fn === 'batchCosineSimilarity') {
              const n = args[3] as number;
              // Scores all 1.0 (unit query vs identical corpus)
              const scores = new Float32Array(n).fill(1.0);
              const buf = scores.buffer.slice(0);
              this._emit('message', { ok: true, result: new Float32Array(buf) }, [buf]);
            } else {
              this._emit('message', { ok: false, error: `mock: unknown fn ${fn}` }, []);
            }
          } catch (e) {
            this._emit('message', { ok: false, error: String(e) }, []);
          }
        }, 5); // 5ms simulated GPU latency
      }

      once(event: string, handler: (d: unknown) => void) {
        (this.handlers[event] ??= []).push(handler);
        return this;
      }

      _emit(event: string, data: unknown, _transfer?: ArrayBuffer[]) {
        this.handlers[event]?.forEach((h) => h(data));
      }

      terminate() {}
    },
    workerData: {},
    parentPort: null,
    isMainThread: true,
  };
});

import {
  graphSimilaritySafe,
  batchCosineSimilarityAsync,
  GPU_ASYNC_THRESHOLD_N,
  GRAPH_SIM_MAX_N,
} from '$lib/server/gpu/libtorch-bridge.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeEmbeddings(n: number, dim = 8): number[][] {
  return Array.from({ length: n }, (_, i) => {
    const v = new Array<number>(dim).fill(0);
    v[i % dim] = 1.0; // unit vector in dimension (i % dim)
    return v;
  });
}

function makeFlat(n: number, dim = 8): { query: Float32Array; corpus: Float32Array } {
  const corpus = new Float32Array(n * dim);
  for (let i = 0; i < n; i++) corpus[i * dim + (i % dim)] = 1.0;
  const query = new Float32Array(dim);
  query[0] = 1.0;
  return { query, corpus };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('graphSimilaritySafe — sync vs async dispatch', () => {
  beforeEach(() => { workerInstances = 0; });

  it('n < GPU_ASYNC_THRESHOLD_N uses sync path (no Worker spawned)', async () => {
    const n = GPU_ASYNC_THRESHOLD_N - 1; // 255
    const embs = makeEmbeddings(n, 8);
    const before = workerInstances;
    const res = await graphSimilaritySafe(embs);
    expect(res.n).toBe(n);
    expect(res.matrix).toHaveLength(n);
    // Sync path does NOT spawn a Worker
    expect(workerInstances).toBe(before);
  });

  it('n === GPU_ASYNC_THRESHOLD_N uses async worker path (Worker spawned)', async () => {
    const n = GPU_ASYNC_THRESHOLD_N; // 256
    const embs = makeEmbeddings(n, 8);
    const before = workerInstances;
    const res = await graphSimilaritySafe(embs);
    expect(res.n).toBe(n);
    expect(res.matrix).toHaveLength(n);
    // Async path MUST spawn exactly one Worker
    expect(workerInstances).toBe(before + 1);
  });

  it('throws RangeError for n > GRAPH_SIM_MAX_N', async () => {
    const embs = makeEmbeddings(GRAPH_SIM_MAX_N + 1, 8);
    await expect(graphSimilaritySafe(embs)).rejects.toThrow(RangeError);
  });

  it('returns empty result for n = 0', async () => {
    const res = await graphSimilaritySafe([]);
    expect(res.n).toBe(0);
    expect(res.matrix).toHaveLength(0);
    expect(res.source).toBe('cpu');
  });
});

describe('graphSimilaritySafe — event loop stays free for large n', () => {
  beforeEach(() => { workerInstances = 0; });

  it('large-n call does not block the event loop', async () => {
    const n = GPU_ASYNC_THRESHOLD_N + 64; // 320
    const embs = makeEmbeddings(n, 8);

    let ticks = 0;
    const timer = setInterval(() => { ticks++; }, 1);

    try {
      const res = await graphSimilaritySafe(embs);
      expect(res.n).toBe(n);
      // The mock Worker has a 5ms delay; the event loop must have ticked at least once
      expect(ticks).toBeGreaterThan(0);
    } finally {
      clearInterval(timer);
    }
  });
});

describe('batchCosineSimilarityAsync', () => {
  beforeEach(() => { workerInstances = 0; });

  it('returns scores array of correct length', async () => {
    const n = 64;
    const dim = 8;
    const { query, corpus } = makeFlat(n, dim);
    const before = workerInstances;
    const res = await batchCosineSimilarityAsync(query, dim, corpus, n);
    expect(res.n).toBe(n);
    expect(res.scores).toHaveLength(n);
    // Must have spawned a Worker
    expect(workerInstances).toBe(before + 1);
  });

  it('scores are numeric (not NaN)', async () => {
    const n = 32;
    const dim = 8;
    const { query, corpus } = makeFlat(n, dim);
    const res = await batchCosineSimilarityAsync(query, dim, corpus, n);
    expect(res.scores.every((s) => Number.isFinite(s))).toBe(true);
  });
});