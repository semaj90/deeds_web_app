// src/lib/workers/gpu-tensor-worker.ts
// GPU Tensor Worker — WebGPU compute in a dedicated Web Worker thread

export type MultiDimArray = {
	shape: number[];
	data: Float32Array | number[];
	layout?: string;
	cacheKey?: string;
	timestamp?: number;
	lodLevel?: number;
	dimensions?: number;
};

export type WorkerMessageData =
	| MultiDimArray
	| MultiDimArray[]
	| { goServiceUrl?: string; cacheLimit?: number }
	| { cleared?: boolean }
	| GPUProcessingStats
	| undefined;

export interface WorkerMessage {
	type: 'INITIALIZE' | 'PROCESS_TENSOR' | 'PROCESS_BATCH' | 'GET_STATS' | 'CLEAR_CACHE';
	id?: string;
	data?: WorkerMessageData;
	config?: { goServiceUrl?: string; cacheLimit?: number };
}

export interface WorkerResponse {
	type: 'INITIALIZED' | 'SUCCESS' | 'ERROR' | 'STATS';
	id?: string;
	data?: WorkerMessageData | unknown;
	error?: string;
}

export interface GPUProcessingStats {
	totalProcessed: number;
	cacheHitRate: number;
	averageProcessingTime: number;
	webgpuSupported: boolean;
	lastProcessedTime?: number;
}

// L2 normalize WGSL shader
const L2_NORMALIZE_WGSL = `
struct Params { count: u32, dim: u32 }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> vectors: array<f32>;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let idx = gid.x;
  if (idx >= params.count) { return; }
  let offset = idx * params.dim;
  var mag: f32 = 0.0;
  for (var i: u32 = 0u; i < params.dim; i = i + 1u) {
    let v = vectors[offset + i];
    mag = mag + v * v;
  }
  mag = sqrt(mag);
  if (mag > 0.0) {
    for (var i: u32 = 0u; i < params.dim; i = i + 1u) {
      vectors[offset + i] = vectors[offset + i] / mag;
    }
  }
}`;

class GPUTensorWorker {
	private device: GPUDevice | null = null;
	private cacheLimit = 100;
	private cache = new Map<string, { data: Float32Array; ts: number }>();
	private processingTimes: number[] = [];
	private stats: GPUProcessingStats = {
		totalProcessed: 0,
		cacheHitRate: 0,
		averageProcessingTime: 0,
		webgpuSupported: false,
		lastProcessedTime: undefined
	};

	async initialize(config?: { goServiceUrl?: string; cacheLimit?: number }): Promise<{
		webgpuSupported: boolean
	}> {
		if (config?.cacheLimit) this.cacheLimit = config.cacheLimit;

		// Attempt WebGPU initialization in worker context
		try {
			const gpu = (navigator as any).gpu as GPU | undefined;
			if (gpu) {
				const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
				if (adapter) {
					this.device = await adapter.requestDevice({
						requiredLimits: {
							maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
							maxBufferSize: adapter.limits.maxBufferSize
						}
					});
					this.device.lost.then(() => {
						console.warn('[GPUWorker] Device lost');
						this.device = null;
						this.stats.webgpuSupported = false;
					});
					this.stats.webgpuSupported = true;
					console.log('[GPUWorker] WebGPU device acquired');
				}
			}
		} catch (e) {
			console.warn('[GPUWorker] WebGPU unavailable, CPU fallback:', e);
		}

		return { webgpuSupported: this.stats.webgpuSupported };
	}

	async processGPUTensor(tensor: MultiDimArray): Promise<MultiDimArray> {
		const start = performance.now();

		// Check cache
		if (tensor.cacheKey && this.cache.has(tensor.cacheKey)) {
			const cached = this.cache.get(tensor.cacheKey)!;
			this.recordTime(performance.now() - start);
			return { ...tensor, data: cached.data, timestamp: Date.now() };
		}

		const inputData = tensor.data instanceof Float32Array
			? tensor.data
			: new Float32Array(tensor.data);

		let result: Float32Array;
		const dims = tensor.dimensions ?? tensor.shape[tensor.shape.length - 1] ?? inputData.length;
		const count = Math.max(1, Math.floor(inputData.length / dims));

		if (this.device) {
			result = await this.gpuL2Normalize(inputData, count, dims);
		} else {
			result = this.cpuL2Normalize(inputData, count, dims);
		}

		// Cache result
		if (tensor.cacheKey) {
			this.evictIfNeeded();
			this.cache.set(tensor.cacheKey, { data: result, ts: Date.now() });
		}

		this.recordTime(performance.now() - start);
		return { ...tensor, data: result, timestamp: Date.now() };
	}

	async processBatch(tensors: MultiDimArray[]): Promise<MultiDimArray[]> {
		const results: MultiDimArray[] = [];
		for (const t of tensors) {
			results.push(await this.processGPUTensor(t));
		}
		return results;
	}

	private async gpuL2Normalize(
		vectors: Float32Array, count: number, dim: number
	): Promise<Float32Array> {
		const device = this.device!;

		const paramsData = new Uint32Array([count, dim]);
		const paramsBuf = device.createBuffer({
			size: 8, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		device.queue.writeBuffer(paramsBuf, 0, paramsData.buffer);

		const vectorBuf = device.createBuffer({
			size: vectors.byteLength,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST
		});
		device.queue.writeBuffer(vectorBuf, 0, vectors.buffer);

		const readBuf = device.createBuffer({
			size: vectors.byteLength,
			usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST
		});

		const module = device.createShaderModule({ code: L2_NORMALIZE_WGSL });
		const pipeline = device.createComputePipeline({
			layout: 'auto',
			compute: { module, entryPoint: 'main' }
		});

		const bindGroup = device.createBindGroup({
			layout: pipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: { buffer: paramsBuf } },
				{ binding: 1, resource: { buffer: vectorBuf } }
			]
		});

		const encoder = device.createCommandEncoder();
		const pass = encoder.beginComputePass();
		pass.setPipeline(pipeline);
		pass.setBindGroup(0, bindGroup);
		pass.dispatchWorkgroups(Math.ceil(count / 256));
		pass.end();
		encoder.copyBufferToBuffer(vectorBuf, 0, readBuf, 0, vectors.byteLength);
		device.queue.submit([encoder.finish()]);

		await readBuf.mapAsync(GPUMapMode.READ);
		const result = new Float32Array(readBuf.getMappedRange().slice(0));
		readBuf.unmap();

		paramsBuf.destroy();
		vectorBuf.destroy();
		readBuf.destroy();

		return result;
	}

	private cpuL2Normalize(vectors: Float32Array, count: number, dim: number): Float32Array {
		const result = new Float32Array(vectors);
		for (let v = 0; v < count; v++) {
			const offset = v * dim;
			let mag = 0;
			for (let i = 0; i < dim; i++) mag += result[offset + i] ** 2;
			mag = Math.sqrt(mag);
			if (mag > 0) {
				for (let i = 0; i < dim; i++) result[offset + i] /= mag;
			}
		}
		return result;
	}

	private evictIfNeeded() {
		if (this.cache.size >= this.cacheLimit) {
			let oldestKey = '';
			let oldestTs = Infinity;
			for (const [k, v] of this.cache) {
				if (v.ts < oldestTs) { oldestTs = v.ts; oldestKey = k; }
			}
			if (oldestKey) this.cache.delete(oldestKey);
		}
	}

	private recordTime(ms: number) {
		this.stats.totalProcessed++;
		this.stats.lastProcessedTime = Date.now();
		this.processingTimes.push(ms);
		if (this.processingTimes.length > 100) this.processingTimes.shift();
		this.stats.averageProcessingTime =
			this.processingTimes.reduce((a, b) => a + b, 0) / this.processingTimes.length;

		const total = this.stats.totalProcessed;
		const cacheHits = total - this.processingTimes.filter(t => t > 1).length;
		this.stats.cacheHitRate = total > 0 ? cacheHits / total : 0;
	}

	getStats(): GPUProcessingStats {
		return { ...this.stats };
	}

	clearCache() {
		this.cache.clear();
	}
}

const worker = new GPUTensorWorker();

self.onmessage = async (ev: MessageEvent<WorkerMessage>) => {
	const msg = ev.data;
	try {
		switch (msg.type) {
			case 'INITIALIZE': {
				const result = await worker.initialize(msg.config);
				self.postMessage({ type: 'INITIALIZED', id: msg.id, data: result });
				break;
			}
			case 'PROCESS_TENSOR': {
				const out = await worker.processGPUTensor(msg.data as MultiDimArray);
				const transferables = out.data instanceof Float32Array ? [out.data.buffer] : [];
				self.postMessage({ type: 'SUCCESS', id: msg.id, data: out }, transferables as any);
				break;
			}
			case 'PROCESS_BATCH': {
				const results = await worker.processBatch(msg.data as MultiDimArray[]);
				const batchTransferables = results
					.filter(r => r.data instanceof Float32Array)
					.map(r => (r.data as Float32Array).buffer);
				self.postMessage({ type: 'SUCCESS', id: msg.id, data: results }, batchTransferables as any);
				break;
			}
			case 'GET_STATS':
				self.postMessage({ type: 'STATS', id: msg.id, data: worker.getStats() });
				break;
			case 'CLEAR_CACHE':
				worker.clearCache();
				self.postMessage({ type: 'SUCCESS', id: msg.id, data: { cleared: true } });
				break;
		}
	} catch (err) {
		self.postMessage({ type: 'ERROR', id: msg.id, error: String(err) });
	}
};
