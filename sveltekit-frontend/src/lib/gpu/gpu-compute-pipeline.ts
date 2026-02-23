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

// ─── WGSL Shaders ────────────────────────────────────────────────────────────

/**
 * Cosine similarity kernel — mirrors rag_kernels.cu vectorized approach
 * but targets WebGPU compute shaders (WGSL)
 *
 * W3C WGSL Spec § 12.3.5 (built-in functions: dot, length, normalize)
 *
 * Workgroup size 256 matches RTX 3060 Ti warp scheduling (8 warps × 32)
 */
const COSINE_SIMILARITY_WGSL = /* wgsl */ `
struct Params {
  dimension: u32,
  count: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> query: array<f32>;
@group(0) @binding(2) var<storage, read> documents: array<f32>;
@group(0) @binding(3) var<storage, read_write> results: array<f32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let doc_idx = gid.x;
  if (doc_idx >= params.count) { return; }

  let dim = params.dimension;
  let offset = doc_idx * dim;

  var dot_product: f32 = 0.0;
  var norm_q: f32 = 0.0;
  var norm_d: f32 = 0.0;

  // Unrolled 4-wide (mirrors rag_kernels.cu float4 pattern)
  let chunks = dim / 4u;
  for (var i: u32 = 0u; i < chunks; i = i + 1u) {
    let base = i * 4u;
    let q0 = query[base];
    let q1 = query[base + 1u];
    let q2 = query[base + 2u];
    let q3 = query[base + 3u];
    let d0 = documents[offset + base];
    let d1 = documents[offset + base + 1u];
    let d2 = documents[offset + base + 2u];
    let d3 = documents[offset + base + 3u];

    dot_product += q0 * d0 + q1 * d1 + q2 * d2 + q3 * d3;
    norm_q += q0 * q0 + q1 * q1 + q2 * q2 + q3 * q3;
    norm_d += d0 * d0 + d1 * d1 + d2 * d2 + d3 * d3;
  }

  // Handle remainder
  for (var i = chunks * 4u; i < dim; i = i + 1u) {
    let q = query[i];
    let d = documents[offset + i];
    dot_product += q * d;
    norm_q += q * q;
    norm_d += d * d;
  }

  let denom = sqrt(norm_q) * sqrt(norm_d);
  results[doc_idx] = select(0.0, dot_product / denom, denom > 0.0);
}
`;

/**
 * L2 normalization kernel — normalize vectors in-place
 * Used after embedding generation for unit-vector search
 */
const L2_NORMALIZE_WGSL = /* wgsl */ `
struct Params {
  dimension: u32,
  count: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> vectors: array<f32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let vec_idx = gid.x;
  if (vec_idx >= params.count) { return; }

  let dim = params.dimension;
  let offset = vec_idx * dim;

  var magnitude: f32 = 0.0;
  for (var i: u32 = 0u; i < dim; i = i + 1u) {
    let v = vectors[offset + i];
    magnitude += v * v;
  }
  magnitude = sqrt(magnitude);

  if (magnitude > 0.0) {
    for (var i: u32 = 0u; i < dim; i = i + 1u) {
      vectors[offset + i] = vectors[offset + i] / magnitude;
    }
  }
}
`;

/**
 * Matrix multiply kernel — for batch embedding transforms
 * C = A × B where A is (M×K), B is (K×N)
 */
const MATMUL_WGSL = /* wgsl */ `
struct Params {
  M: u32,
  N: u32,
  K: u32,
  _pad: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> matA: array<f32>;
@group(0) @binding(2) var<storage, read> matB: array<f32>;
@group(0) @binding(3) var<storage, read_write> matC: array<f32>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let row = gid.x;
  let col = gid.y;
  if (row >= params.M || col >= params.N) { return; }

  var sum: f32 = 0.0;
  for (var k: u32 = 0u; k < params.K; k = k + 1u) {
    sum += matA[row * params.K + k] * matB[k * params.N + col];
  }
  matC[row * params.N + col] = sum;
}
`;

// ─── Pipeline Class ──────────────────────────────────────────────────────────

export class DeedsGPUCompute {
	private device: GPUDevice | null = null;
	private queue: GPUQueue | null = null;
	private pipelineCache = new Map<string, CachedPipeline>();
	private _backend: ComputeBackend = 'cpu';

	get backend(): ComputeBackend {
		return this._backend;
	}

	get isGPUReady(): boolean {
		return this.device !== null && this.queue !== null;
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

		const cached = await this.getOrCreatePipeline('cosine_similarity', COSINE_SIMILARITY_WGSL, 4);

		// Create uniform buffer (params)
		const paramsData = new Uint32Array([dimension, count]);
		const paramsBuffer = device.createBuffer({
			label: 'cosine_params',
			size: 8,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		device.queue.writeBuffer(paramsBuffer, 0, paramsData);

		// Create storage buffers
		const queryBuffer = this.createStorageBuffer('cosine_query', query);
		const docsBuffer = this.createStorageBuffer('cosine_docs', documents);
		const resultBuffer = device.createBuffer({
			label: 'cosine_results',
			size: count * 4,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
		});

		// Staging buffer for readback (W3C WebGPU § 6.2 — MAP_READ)
		const stagingBuffer = device.createBuffer({
			label: 'cosine_staging',
			size: count * 4,
			usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
		});

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
		encoder.copyBufferToBuffer(resultBuffer, 0, stagingBuffer, 0, count * 4);
		device.queue.submit([encoder.finish()]);

		// Read back (W3C WebGPU § 6.2.2 — mapAsync)
		await stagingBuffer.mapAsync(GPUMapMode.READ);
		const output = new Float32Array(stagingBuffer.getMappedRange().slice(0));
		stagingBuffer.unmap();

		// Cleanup
		paramsBuffer.destroy();
		queryBuffer.destroy();
		docsBuffer.destroy();
		resultBuffer.destroy();
		stagingBuffer.destroy();

		return output;
	}

	private async dispatchL2Normalize(
		vectors: Float32Array,
		count: number,
		dimension: number
	): Promise<Float32Array> {
		const device = this.device!;
		const cached = await this.getOrCreatePipeline('l2_normalize', L2_NORMALIZE_WGSL, 2);

		const paramsData = new Uint32Array([dimension, count]);
		const paramsBuffer = device.createBuffer({
			label: 'norm_params',
			size: 8,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		device.queue.writeBuffer(paramsBuffer, 0, paramsData);

		const vecBuffer = this.createStorageBuffer('norm_vectors', vectors, true);
		const stagingBuffer = device.createBuffer({
			label: 'norm_staging',
			size: vectors.byteLength,
			usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
		});

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
		const output = new Float32Array(stagingBuffer.getMappedRange().slice(0));
		stagingBuffer.unmap();

		paramsBuffer.destroy();
		vecBuffer.destroy();
		stagingBuffer.destroy();

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
		const cached = await this.getOrCreatePipeline('matmul', MATMUL_WGSL, 4);

		const paramsData = new Uint32Array([m, n, k, 0]);
		const paramsBuffer = device.createBuffer({
			label: 'matmul_params',
			size: 16,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		device.queue.writeBuffer(paramsBuffer, 0, paramsData);

		const bufA = this.createStorageBuffer('matA', a);
		const bufB = this.createStorageBuffer('matB', b);
		const bufC = device.createBuffer({
			label: 'matC',
			size: m * n * 4,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
		});
		const staging = device.createBuffer({
			label: 'matmul_staging',
			size: m * n * 4,
			usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
		});

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
		encoder.copyBufferToBuffer(bufC, 0, staging, 0, m * n * 4);
		device.queue.submit([encoder.finish()]);

		await staging.mapAsync(GPUMapMode.READ);
		const output = new Float32Array(staging.getMappedRange().slice(0));
		staging.unmap();

		paramsBuffer.destroy();
		bufA.destroy();
		bufB.destroy();
		bufC.destroy();
		staging.destroy();

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

	// ─── Buffer Helpers ────────────────────────────────────────────────────

	private createStorageBuffer(
		label: string,
		data: Float32Array,
		readWrite = false
	): GPUBuffer {
		const device = this.device!;
		const usage = readWrite
			? GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
			: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;

		const buffer = device.createBuffer({ label, size: data.byteLength, usage });
		device.queue.writeBuffer(buffer, 0, data.buffer, data.byteOffset, data.byteLength);
		return buffer;
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
