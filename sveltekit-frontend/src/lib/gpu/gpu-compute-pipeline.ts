/**
 * Unified GPU Compute Pipeline — W3C WebGPU Spec Compliant
 *
 * Wires together:
 *   - WebGPU init (src/lib/webgpu/init.ts) — device/adapter lifecycle
 *   - Legal compute shaders (src/lib/webgpu/legal-compute-shaders.ts) — WGSL kernels
 *   - WASM accelerator (src/lib/wasm/webassembly-accelerator.ts) — SIMD fallback
 *   - WASM legal processor (src/lib/wasm/legal-processor.ts) — document pipeline
 *   - QLoRA binary codec (src/lib/types/qlora-protobuf.ts) — gzip transport
 *   - TensorRT types (src/lib/types/tensorrt-types.ts) — inference contract
 *   - gRPC embedding client (src/lib/server/grpc/embedding-client.ts) — server bridge
 *
 * Fallback chain: WebGPU → WASM SIMD → CPU
 *
 * References:
 *   W3C WebGPU Spec: https://www.w3.org/TR/webgpu/
 *   WGSL Spec: https://www.w3.org/TR/WGSL/
 */

import { browser } from '$app/environment';
import {
	COSINE_SIMILARITY_WGSL,
	L2_NORMALIZE_WGSL,
	MATMUL_WGSL,
	SHADER_REGISTRY,
	type ShaderSpec
} from './shader-registry.js';

// Re-export shader registry for consumers
export { SHADER_REGISTRY, type ShaderSpec };

// ─── Types ───────────────────────────────────────────────────────────────────

/** Compute backend used for a given operation */
export type ComputeBackend = 'webgpu' | 'wasm-simd' | 'cpu';

/** Result envelope from any compute operation */
export interface ComputeResult<T> {
	data: T;
	backend: ComputeBackend;
	durationMs: number;
	bufferSizeBytes?: number;
}

/** GPU buffer descriptor per W3C WebGPU § 6.1 */
export interface BufferDescriptor {
	label?: string;
	size: number;
	usage: GPUBufferUsageFlags;
	mappedAtCreation?: boolean;
}

/** Compute dispatch dimensions per W3C WebGPU § 11.1 */
export interface DispatchDimensions {
	x: number;
	y?: number;
	z?: number;
}

/** Pipeline cache entry */
interface CachedPipeline {
	pipeline: GPUComputePipeline;
	bindGroupLayout: GPUBindGroupLayout;
	shaderModule: GPUShaderModule;
	createdAt: number;
}

/** Buffer pool statistics */
export interface BufferPoolStats {
	acquired: number;
	released: number;
	created: number;
	hits: number;
	hitRate: number;
	pooledBuffers: number;
	pooledBytes: number;
}

// ─── Buffer Pool ─────────────────────────────────────────────────────────────

/**
 * Size-class bucketed GPU buffer pool.
 * Reuses GPUBuffers via queue.writeBuffer() instead of create/destroy cycles.
 * Buckets use power-of-2 sizes (min 256 bytes) keyed by usage flags.
 *
 * Per Toji.dev best practices: writeBuffer() is the recommended high-performance
 * path. Buffer pooling eliminates GC overhead from repeated create/destroy.
 */
class GPUBufferPool {
	private pools = new Map<string, GPUBuffer[]>();
	private device: GPUDevice;
	private _acquired = 0;
	private _released = 0;
	private _created = 0;
	private _hits = 0;

	constructor(device: GPUDevice) {
		this.device = device;
	}

	/** Round up to next power of 2, minimum 256 bytes */
	private sizeClass(bytes: number): number {
		if (bytes <= 256) return 256;
		return 1 << (32 - Math.clz32(bytes - 1));
	}

	private key(usage: GPUBufferUsageFlags, bytes: number): string {
		return `${usage}:${this.sizeClass(bytes)}`;
	}

	/** Acquire a buffer >= requested size with given usage flags */
	acquire(size: number, usage: GPUBufferUsageFlags, label?: string): GPUBuffer {
		this._acquired++;
		const k = this.key(usage, size);
		const pool = this.pools.get(k);

		if (pool && pool.length > 0) {
			this._hits++;
			return pool.pop()!;
		}

		this._created++;
		return this.device.createBuffer({
			label: label || `pool_${k}`,
			size: this.sizeClass(size),
			usage
		});
	}

	/** Return a buffer to the pool for reuse */
	release(buffer: GPUBuffer): void {
		this._released++;
		const k = `${buffer.usage}:${buffer.size}`;
		const pool = this.pools.get(k) || [];
		pool.push(buffer);
		this.pools.set(k, pool);
	}

	/** Pool statistics */
	get stats(): BufferPoolStats {
		let pooledBuffers = 0;
		let pooledBytes = 0;
		for (const [, pool] of this.pools) {
			pooledBuffers += pool.length;
			for (const buf of pool) pooledBytes += buf.size;
		}
		return {
			acquired: this._acquired,
			released: this._released,
			created: this._created,
			hits: this._hits,
			hitRate: this._acquired > 0 ? this._hits / this._acquired : 0,
			pooledBuffers,
			pooledBytes
		};
	}

	/** Destroy all pooled buffers and reset counters */
	destroy(): void {
		for (const [, pool] of this.pools) {
			for (const buf of pool) buf.destroy();
		}
		this.pools.clear();
		this._acquired = this._released = this._created = this._hits = 0;
	}
}

// ─── Pipeline Class ──────────────────────────────────────────────────────────

export class DeedsGPUCompute {
	private device: GPUDevice | null = null;
	private queue: GPUQueue | null = null;
	private pipelineCache = new Map<string, CachedPipeline>();
	private bufferPool: GPUBufferPool | null = null;
	private _backend: ComputeBackend = 'cpu';

	get backend(): ComputeBackend {
		return this._backend;
	}

	get isGPUReady(): boolean {
		return this.device !== null && this.queue !== null;
	}

	/** Buffer pool statistics (null if GPU not initialized) */
	get poolStats(): BufferPoolStats | null {
		return this.bufferPool?.stats ?? null;
	}

	/**
	 * Initialize — delegates to webgpu/init.ts for device lifecycle
	 * Falls back to WASM SIMD → CPU automatically
	 */
	async initialize(): Promise<ComputeBackend> {
		if (!browser) {
			this._backend = 'cpu';
			return 'cpu';
		}

		try {
			const { initWebGPU } = await import('$lib/webgpu/init.js');
			const ctx = await initWebGPU({ powerPreference: 'high-performance' });

			if (ctx) {
				this.device = ctx.device;
				this.queue = ctx.device.queue;
				this._backend = 'webgpu';

				// Initialize buffer pool for this device
				this.bufferPool = new GPUBufferPool(this.device);

				// Handle device loss — rebuild cache + pool
				this.device.lost.then((info) => this.handleDeviceLost(info));

				// Pre-compile hot-path shaders
				await Promise.all([
					this.getOrCreatePipeline('cosine_similarity', COSINE_SIMILARITY_WGSL, 4),
					this.getOrCreatePipeline('l2_normalize', L2_NORMALIZE_WGSL, 2),
					this.getOrCreatePipeline('matmul', MATMUL_WGSL, 4)
				]);

				return 'webgpu';
			}
		} catch (e) {
			console.warn('[GPUCompute] WebGPU init failed, trying WASM:', e);
		}

		// WASM SIMD fallback
		try {
			const simdSupported =
				typeof WebAssembly?.validate === 'function' &&
				WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
			if (simdSupported) {
				this._backend = 'wasm-simd';
				return 'wasm-simd';
			}
		} catch {
			/* no WASM */
		}

		this._backend = 'cpu';
		return 'cpu';
	}

	/** Handle GPU device loss — clear all caches and fall back to CPU */
	private handleDeviceLost(info: GPUDeviceLostInfo): void {
		console.warn(`[GPUCompute] Device lost: ${info.message} (reason: ${info.reason})`);
		this.bufferPool?.destroy();
		this.bufferPool = null;
		this.pipelineCache.clear();
		this.device = null;
		this.queue = null;
		this._backend = 'cpu';
	}

	// ─── Compute Operations ────────────────────────────────────────────────

	/**
	 * Batch cosine similarity — query vs N document vectors
	 * Mirrors deeds_labs/cuda-grpc-stubs/cuda/rag_kernels.cu
	 *
	 * @param query - 768-dim query embedding (Float32Array)
	 * @param documents - N × 768-dim document embeddings (flat Float32Array)
	 * @param count - number of document vectors
	 */
	async cosineSimilarity(
		query: Float32Array,
		documents: Float32Array,
		count: number
	): Promise<ComputeResult<Float32Array>> {
		const start = performance.now();
		const dimension = query.length;

		if (this.isGPUReady) {
			try {
				const result = await this.dispatchCosineSimilarity(query, documents, count, dimension);
				return {
					data: result,
					backend: 'webgpu',
					durationMs: performance.now() - start,
					bufferSizeBytes: documents.byteLength
				};
			} catch (e) {
				console.warn('[GPUCompute] GPU cosine failed, CPU fallback:', e);
			}
		}

		// CPU fallback
		const results = this.cpuCosineSimilarity(query, documents, count, dimension);
		return {
			data: results,
			backend: this._backend === 'wasm-simd' ? 'wasm-simd' : 'cpu',
			durationMs: performance.now() - start
		};
	}

	/**
	 * L2 normalize vectors in-place
	 */
	async l2Normalize(
		vectors: Float32Array,
		count: number,
		dimension: number
	): Promise<ComputeResult<Float32Array>> {
		const start = performance.now();

		if (this.isGPUReady) {
			try {
				const result = await this.dispatchL2Normalize(vectors, count, dimension);
				return { data: result, backend: 'webgpu', durationMs: performance.now() - start };
			} catch (e) {
				console.warn('[GPUCompute] GPU normalize failed, CPU fallback:', e);
			}
		}

		// CPU fallback
		const result = new Float32Array(vectors);
		for (let v = 0; v < count; v++) {
			const offset = v * dimension;
			let mag = 0;
			for (let i = 0; i < dimension; i++) {
				mag += result[offset + i] ** 2;
			}
			mag = Math.sqrt(mag);
			if (mag > 0) {
				for (let i = 0; i < dimension; i++) {
					result[offset + i] /= mag;
				}
			}
		}
		return { data: result, backend: this._backend, durationMs: performance.now() - start };
	}

	/**
	 * Matrix multiply C = A × B
	 * Used for batch embedding projection/transform
	 */
	async matmul(
		a: Float32Array,
		b: Float32Array,
		m: number,
		n: number,
		k: number
	): Promise<ComputeResult<Float32Array>> {
		const start = performance.now();

		if (this.isGPUReady) {
			try {
				const result = await this.dispatchMatmul(a, b, m, n, k);
				return { data: result, backend: 'webgpu', durationMs: performance.now() - start };
			} catch (e) {
				console.warn('[GPUCompute] GPU matmul failed, CPU fallback:', e);
			}
		}

		// CPU fallback (naive)
		const c = new Float32Array(m * n);
		for (let i = 0; i < m; i++) {
			for (let j = 0; j < n; j++) {
				let sum = 0;
				for (let p = 0; p < k; p++) {
					sum += a[i * k + p] * b[p * n + j];
				}
				c[i * n + j] = sum;
			}
		}
		return { data: c, backend: this._backend, durationMs: performance.now() - start };
	}

	// ─── GPU Dispatch (W3C WebGPU § 11.1) ──────────────────────────────────

	private async dispatchCosineSimilarity(
		query: Float32Array,
		documents: Float32Array,
		count: number,
		dimension: number
	): Promise<Float32Array> {
		const device = this.device!;
		const pool = this.bufferPool!;
		const dataSize = count * 4;

		const cached = await this.getOrCreatePipeline('cosine_similarity', COSINE_SIMILARITY_WGSL, 4);

		// Acquire buffers from pool (reused across dispatches)
		const paramsBuffer = pool.acquire(8, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'cosine_params');
		const queryBuffer = pool.acquire(query.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'cosine_query');
		const docsBuffer = pool.acquire(documents.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'cosine_docs');
		const resultBuffer = pool.acquire(dataSize, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC, 'cosine_results');
		const stagingBuffer = pool.acquire(dataSize, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST, 'cosine_staging');

		// Upload data via writeBuffer (reuses existing buffers)
		const paramsData = new Uint32Array([dimension, count]);
		device.queue.writeBuffer(paramsBuffer, 0, paramsData);
		device.queue.writeBuffer(queryBuffer, 0, query.buffer, query.byteOffset, query.byteLength);
		device.queue.writeBuffer(docsBuffer, 0, documents.buffer, documents.byteOffset, documents.byteLength);

		// Bind group
		const bindGroup = device.createBindGroup({
			layout: cached.bindGroupLayout,
			entries: [
				{ binding: 0, resource: { buffer: paramsBuffer } },
				{ binding: 1, resource: { buffer: queryBuffer } },
				{ binding: 2, resource: { buffer: docsBuffer } },
				{ binding: 3, resource: { buffer: resultBuffer } }
			]
		});

		// Encode + dispatch
		const encoder = device.createCommandEncoder({ label: 'cosine_encoder' });
		const pass = encoder.beginComputePass({ label: 'cosine_pass' });
		pass.setPipeline(cached.pipeline);
		pass.setBindGroup(0, bindGroup);
		pass.dispatchWorkgroups(Math.ceil(count / 256));
		pass.end();

		// Copy results to staging for readback
		encoder.copyBufferToBuffer(resultBuffer, 0, stagingBuffer, 0, dataSize);
		device.queue.submit([encoder.finish()]);

		// Read back — use (0, dataSize) since pooled buffer may be larger
		await stagingBuffer.mapAsync(GPUMapMode.READ);
		const output = new Float32Array(stagingBuffer.getMappedRange(0, dataSize).slice(0));
		stagingBuffer.unmap();

		// Release buffers back to pool (not destroyed — available for next dispatch)
		pool.release(paramsBuffer);
		pool.release(queryBuffer);
		pool.release(docsBuffer);
		pool.release(resultBuffer);
		pool.release(stagingBuffer);

		return output;
	}

	private async dispatchL2Normalize(
		vectors: Float32Array,
		count: number,
		dimension: number
	): Promise<Float32Array> {
		const device = this.device!;
		const pool = this.bufferPool!;
		const cached = await this.getOrCreatePipeline('l2_normalize', L2_NORMALIZE_WGSL, 2);

		// Acquire from pool
		const paramsBuffer = pool.acquire(8, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'norm_params');
		const vecBuffer = pool.acquire(vectors.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST, 'norm_vectors');
		const stagingBuffer = pool.acquire(vectors.byteLength, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST, 'norm_staging');

		// Upload data
		const paramsData = new Uint32Array([dimension, count]);
		device.queue.writeBuffer(paramsBuffer, 0, paramsData);
		device.queue.writeBuffer(vecBuffer, 0, vectors.buffer, vectors.byteOffset, vectors.byteLength);

		const bindGroup = device.createBindGroup({
			layout: cached.bindGroupLayout,
			entries: [
				{ binding: 0, resource: { buffer: paramsBuffer } },
				{ binding: 1, resource: { buffer: vecBuffer } }
			]
		});

		const encoder = device.createCommandEncoder();
		const pass = encoder.beginComputePass();
		pass.setPipeline(cached.pipeline);
		pass.setBindGroup(0, bindGroup);
		pass.dispatchWorkgroups(Math.ceil(count / 256));
		pass.end();
		encoder.copyBufferToBuffer(vecBuffer, 0, stagingBuffer, 0, vectors.byteLength);
		device.queue.submit([encoder.finish()]);

		await stagingBuffer.mapAsync(GPUMapMode.READ);
		const output = new Float32Array(stagingBuffer.getMappedRange(0, vectors.byteLength).slice(0));
		stagingBuffer.unmap();

		// Release back to pool
		pool.release(paramsBuffer);
		pool.release(vecBuffer);
		pool.release(stagingBuffer);

		return output;
	}

	private async dispatchMatmul(
		a: Float32Array,
		b: Float32Array,
		m: number,
		n: number,
		k: number
	): Promise<Float32Array> {
		const device = this.device!;
		const pool = this.bufferPool!;
		const cached = await this.getOrCreatePipeline('matmul', MATMUL_WGSL, 4);
		const resultSize = m * n * 4;

		// Acquire from pool
		const paramsBuffer = pool.acquire(16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, 'matmul_params');
		const bufA = pool.acquire(a.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'matA');
		const bufB = pool.acquire(b.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, 'matB');
		const bufC = pool.acquire(resultSize, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC, 'matC');
		const staging = pool.acquire(resultSize, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST, 'matmul_staging');

		// Upload data
		const paramsData = new Uint32Array([m, n, k, 0]);
		device.queue.writeBuffer(paramsBuffer, 0, paramsData);
		device.queue.writeBuffer(bufA, 0, a.buffer, a.byteOffset, a.byteLength);
		device.queue.writeBuffer(bufB, 0, b.buffer, b.byteOffset, b.byteLength);

		const bindGroup = device.createBindGroup({
			layout: cached.bindGroupLayout,
			entries: [
				{ binding: 0, resource: { buffer: paramsBuffer } },
				{ binding: 1, resource: { buffer: bufA } },
				{ binding: 2, resource: { buffer: bufB } },
				{ binding: 3, resource: { buffer: bufC } }
			]
		});

		const encoder = device.createCommandEncoder();
		const pass = encoder.beginComputePass();
		pass.setPipeline(cached.pipeline);
		pass.setBindGroup(0, bindGroup);
		pass.dispatchWorkgroups(Math.ceil(m / 16), Math.ceil(n / 16));
		pass.end();
		encoder.copyBufferToBuffer(bufC, 0, staging, 0, resultSize);
		device.queue.submit([encoder.finish()]);

		await staging.mapAsync(GPUMapMode.READ);
		const output = new Float32Array(staging.getMappedRange(0, resultSize).slice(0));
		staging.unmap();

		// Release back to pool
		pool.release(paramsBuffer);
		pool.release(bufA);
		pool.release(bufB);
		pool.release(bufC);
		pool.release(staging);

		return output;
	}

	// ─── Pipeline Cache ────────────────────────────────────────────────────

	private async getOrCreatePipeline(
		name: string,
		wgslCode: string,
		bindingCount: number
	): Promise<CachedPipeline> {
		const cached = this.pipelineCache.get(name);
		if (cached) return cached;

		const device = this.device!;

		const shaderModule = device.createShaderModule({
			label: `${name}_shader`,
			code: wgslCode
		});

		// Build bind group layout entries
		const entries: GPUBindGroupLayoutEntry[] = [];
		for (let i = 0; i < bindingCount; i++) {
			if (i === 0) {
				// First binding is always uniform params
				entries.push({
					binding: i,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: 'uniform' }
				});
			} else if (name === 'l2_normalize' && i === 1) {
				// read_write storage for in-place ops
				entries.push({
					binding: i,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: 'storage' }
				});
			} else if (i === bindingCount - 1 && name !== 'l2_normalize') {
				// Last binding is output (read_write)
				entries.push({
					binding: i,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: 'storage' }
				});
			} else {
				// Middle bindings are read-only storage
				entries.push({
					binding: i,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: 'read-only-storage' }
				});
			}
		}

		const bindGroupLayout = device.createBindGroupLayout({
			label: `${name}_bgl`,
			entries
		});

		const pipelineLayout = device.createPipelineLayout({
			label: `${name}_layout`,
			bindGroupLayouts: [bindGroupLayout]
		});

		const pipeline = device.createComputePipeline({
			label: `${name}_pipeline`,
			layout: pipelineLayout,
			compute: { module: shaderModule, entryPoint: 'main' }
		});

		const entry: CachedPipeline = {
			pipeline,
			bindGroupLayout,
			shaderModule,
			createdAt: Date.now()
		};
		this.pipelineCache.set(name, entry);
		return entry;
	}

	// ─── CPU Fallbacks ─────────────────────────────────────────────────────

	private cpuCosineSimilarity(
		query: Float32Array,
		documents: Float32Array,
		count: number,
		dimension: number
	): Float32Array {
		const results = new Float32Array(count);
		for (let d = 0; d < count; d++) {
			const offset = d * dimension;
			let dot = 0, normQ = 0, normD = 0;
			for (let i = 0; i < dimension; i++) {
				const q = query[i];
				const v = documents[offset + i];
				dot += q * v;
				normQ += q * q;
				normD += v * v;
			}
			const denom = Math.sqrt(normQ) * Math.sqrt(normD);
			results[d] = denom > 0 ? dot / denom : 0;
		}
		return results;
	}

	// ─── Cleanup ───────────────────────────────────────────────────────────

	destroy(): void {
		this.bufferPool?.destroy();
		this.bufferPool = null;
		this.pipelineCache.clear();
		this.device = null;
		this.queue = null;
		this._backend = 'cpu';
	}
}

// ─── Singleton ─────────────────────────────────────────────────────────────

let _instance: DeedsGPUCompute | null = null;

/**
 * Get or create the singleton GPU compute pipeline.
 * Lazy-initializes on first call.
 */
export async function getGPUCompute(): Promise<DeedsGPUCompute> {
	if (!_instance) {
		_instance = new DeedsGPUCompute();
		await _instance.initialize();
	}
	return _instance;
}

/**
 * Get the cached instance without initializing (may be null).
 */
export function getCachedGPUCompute(): DeedsGPUCompute | null {
	return _instance;
}
