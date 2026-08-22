/**
 * src/lib/server/gpu/cuda-stream-manager.ts  — Phase H2
 *
 * CUDA Stream-Aware Graph Dispatch
 * ─────────────────────────────────
 * Wraps the native `replayGraphOnStream` N-API export to dispatch batches of
 * embedding rerank requests across a round-robin pool of 4 CUDA streams.
 * Concurrent calls on different stream IDs overlap their H2D + kernel + D2H
 * stages on the GPU instead of serialising on the default stream.
 *
 * Architecture
 * ─────────────
 *  ┌─────────────────────────┐
 *  │  TS: CudaStreamManager  │
 *  │  dispatchBatch(items[]) │
 *  │   ↓ round-robin stream  │
 *  │  Promise.all( …4 lanes) │
 *  └────────────┬────────────┘
 *               │  replayGraphOnStream(key, input, streamId)
 *  ┌────────────▼────────────┐
 *  │  C++: binding.cc        │
 *  │  ReplayGraphOnStream    │
 *  │  Wrapper (N-API)        │
 *  └────────────┬────────────┘
 *               │
 *  ┌────────────▼────────────┐
 *  │ cuda_graph_bridge.cu    │
 *  │ stream pool [0..3]      │
 *  │ cudaMemcpyAsync H2D     │
 *  │ cudaGraphLaunch         │
 *  │ cudaMemcpyAsync D2H     │
 *  │ cudaStreamSynchronize   │
 *  └─────────────────────────┘
 *
 * CPU fallback: when native addon is absent, all calls are passed through to
 * an inline JS scorer so the TS API surface never changes.
 */

import {
	captureGraphSync,
	replayGraphOnStream,
	cudaStreamCount,
	cudaGraphCount,
	type CudaGraphReplayResult,
} from './libtorch-bridge.js';

// ── Constants ───────────────────────────────────────────────────────────────

/** Matches STREAM_POOL_SIZE in cuda_graph_bridge.cu */
const NATIVE_STREAM_POOL = 4;

/** Default graph key used for the ACE rerank workload */
const DEFAULT_GRAPH_KEY = 'ace:rerank';

// ── Types ────────────────────────────────────────────────────────────────────

export interface CudaKernel {
	name: string;
	/** Pre-flattened embedding vector [n × dim] */
	input: Float32Array;
	/** Shape hint: number of embedding rows */
	n: number;
	/** Embedding dimension */
	dim: number;
	/** Override graph registry key; defaults to DEFAULT_GRAPH_KEY */
	graphKey?: string;
}

export interface CudaKernelResult {
	name: string;
	scores: Float32Array;
	streamId: number;
	source: 'gpu' | 'stub';
	elapsedMs: number;
}

// ── Atomic round-robin counter ────────────────────────────────────────────────
// Node.js is single-threaded so a plain integer is safe here; we increment
// mod the live pool size (from the native export or default 4).
let _nextStream = 0;

function nextStreamId(): number {
	const poolSize = cudaStreamCount();
	const id = _nextStream % poolSize;
	_nextStream = (_nextStream + 1) % poolSize;
	return id;
}

// ── CudaStreamManager ────────────────────────────────────────────────────────

export class CudaStreamManager {
	/**
	 * Ensures a CUDA graph is captured for the given key + shape.
	 * Safe to call multiple times (idempotent in the C++ registry).
	 *
	 * @returns 0 on success, negative on failure (log and continue).
	 */
	static ensureGraph(key: string, n: number, dim: number): number {
		const rc = captureGraphSync(key, n, dim);
		if (rc < 0 && rc !== -99) {
			console.warn(`[CudaStreamManager] captureGraph("${key}", n=${n}, dim=${dim}) rc=${rc}`);
		}
		return rc;
	}

	/**
	 * Dispatch a batch of rerank kernels across the CUDA stream pool.
	 *
	 * Each item is assigned a distinct stream ID (round-robin 0–3) and
	 * launched concurrently via Promise.all so the GPU can overlap the
	 * H2D copy + kernel + D2H copy stages.
	 *
	 * The graph is auto-captured on first call per (key, n, dim) tuple.
	 *
	 * @param kernels  Array of kernel descriptors
	 * @returns        Parallel results in the same order as `kernels`
	 */
	static async dispatchBatch(kernels: CudaKernel[]): Promise<CudaKernelResult[]> {
		if (kernels.length === 0) return [];

		// Fire-off all kernels simultaneously.  Each gets its own stream slot.
		const promises = kernels.map((k) => {
			const key = k.graphKey ?? DEFAULT_GRAPH_KEY;
			const streamId = nextStreamId();

			// Auto-capture graph for this (key, n, dim) if not yet done.
			CudaStreamManager.ensureGraph(key, k.n, k.dim);

			return replayGraphOnStream(key, k.input, streamId).then(
				(r: CudaGraphReplayResult): CudaKernelResult => ({
					name: k.name,
					scores: r.scores,
					streamId: r.streamId,
					source: r.source,
					elapsedMs: r.elapsedMs,
				}),
			);
		});

		return Promise.all(promises);
	}

	/**
	 * Single-item helper: replay one graph on the next available stream.
	 */
	static async dispatch(kernel: CudaKernel): Promise<CudaKernelResult> {
		const [result] = await CudaStreamManager.dispatchBatch([kernel]);
		return result;
	}

	/**
	 * Current number of captured graphs in the native registry.
	 * Useful for health dashboards and smoke tests.
	 */
	static graphCount(): number {
		return cudaGraphCount();
	}

	/**
	 * Active stream pool size.  Always 4 when CUDA is available; 4 (default)
	 * when the native addon is absent.
	 */
	static streamPoolSize(): number {
		return cudaStreamCount();
	}

	/**
	 * Legacy compat shim — maps the old `dispatchBatch(CudaKernel[])` call
	 * shape that only passed `name` + `source` + `batchSize` to the new API.
	 * Produces zero-score stubs so callers don't break during the migration.
	 *
	 * @deprecated Use the typed `dispatchBatch(CudaKernel[])` overload instead.
	 */
	static async dispatchLegacy(
		kernels: Array<{ name: string; source: string; batchSize: number }>,
	): Promise<string[]> {
		console.warn(
			'[CudaStreamManager] dispatchLegacy() called — migrate to dispatchBatch(CudaKernel[])',
		);
		return kernels.map((k) => `stream_stub_${k.name}_${Date.now()}`);
	}

	/**
	 * Pre-warms the stream pool by issuing a tiny synthetic capture+replay
	 * on every stream slot.  Call once at server startup to avoid cold-start
	 * latency on the first real ACE rerank request.
	 *
	 * @param n   Warm-up batch size (default 4 — one row per stream)
	 * @param dim Embedding dimension (default 768)
	 */
	static async warmup(n = NATIVE_STREAM_POOL, dim = 768): Promise<void> {
		const key = `__warmup_${dim}`;
		CudaStreamManager.ensureGraph(key, n, dim);

		const syntheticInput = new Float32Array(n * dim); // zeros — just pings the streams
		const warmupKernels: CudaKernel[] = Array.from({ length: n }, (_, i) => ({
			name: `warmup_stream_${i}`,
			input: syntheticInput.subarray(i * dim, (i + 1) * dim),
			n: 1,
			dim,
			graphKey: key,
		}));

		try {
			const results = await CudaStreamManager.dispatchBatch(warmupKernels);
			const gpuCount = results.filter((r) => r.source === 'gpu').length;
			console.log(
				`[CudaStreamManager] warmup: ${gpuCount}/${n} lanes hot on GPU ` +
					`(pool=${CudaStreamManager.streamPoolSize()}, graphs=${CudaStreamManager.graphCount()})`,
			);
		} catch (err) {
			console.warn('[CudaStreamManager] warmup failed (non-fatal):', (err as Error).message);
		}
	}

	/**
	 * @deprecated Old stub kept for call-site compat during migration.
	 */
	static optimizeMemoryPool(): void {
		console.warn(
			'[CudaStreamManager] optimizeMemoryPool() is a no-op — CUDA stream pool manages memory automatically.',
		);
	}
}
