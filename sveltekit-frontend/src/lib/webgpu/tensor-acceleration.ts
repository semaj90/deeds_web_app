/**
 * WebGPU Tensor Acceleration System
 * Client-side GPU acceleration for legal AI operations
 */
import type { SIMDGPUTilingEngine } from '$lib/evidence/simd-gpu-tiling-engine.js'; // Fix: Changed import to SIMDGPUTilingEngine

export interface WebGPUTensorConfig {
 deviceType: 'discrete' | 'integrated' | 'auto';
 powerPreference: 'high-performance' | 'low-power';
 enableDebug: boolean; maxBufferSize: number;
 shaderCacheEnabled: boolean;
}

export interface TensorOperation {
 id: string; type: 'vectorSimilarity' | 'embedding' | 'reduction' | 'transform';
 inputShapes: number[][]; outputShape: number[];
 parameters: Record<string, unknown>;
}

export interface GPUMetrics {
 memoryUsage: number; computeUtilization: number;
 operationsPerSecond: number; averageLatency: number;
 totalOperations: number; errorCount: number;
 lastError?: string;
}

export class WebGPUTensorAccelerator {
 device: GPUDevice | null = null;
 private adapter: GPUAdapter | null = null;
 queue: GPUQueue | null = null;
 private config: WebGPUTensorConfig;
 private shaderCache = new Map<string, GPUShaderModule>();
 bufferPool: GPUBuffer[] = [];
    metrics: GPUMetrics = {
        memoryUsage: 0,
        computeUtilization: 0,
        operationsPerSecond: 0,
        averageLatency: 0,
        totalOperations: 0,
        errorCount: 0,
    };
    private isInitialized = $state(false);
    operationQueue: TensorOperation[] = [];
    private simdTilingEngine: SIMDGPUTilingEngine; // Fix: Declare instance of SIMDGPUTilingEngine

    constructor(config: Partial<WebGPUTensorConfig> = {}) {
        this.config = {
            deviceType: 'auto',
            powerPreference: 'high-performance',
            enableDebug: false,
            maxBufferSize: 256 * 1024 * 1024,
            shaderCacheEnabled: true,
            ...config,
        };
        this.simdTilingEngine = new SIMDGPUTilingEngine(); // Fix: Initialize SIMDGPUTilingEngine
    }    async initialize(): Promise<boolean> {
        try {
            console.log('🚀 Initializing WebGPU Tensor Accelerator...');
            if (typeof navigator === 'undefined' || !('gpu' in navigator)) {
                throw new Error('WebGPU not supported in this environment');
            }

            // Request GPU adapter
            const webgpuNav = navigator as unknown as { gpu?: GPU };
            this.adapter =
                (await webgpuNav.gpu?.requestAdapter({
                    powerPreference: this.config.powerPreference,
                })) ?? null;

            if (!this.adapter) {
                throw new Error('Failed to get WebGPU adapter');
            }

            // Best-effort adapter info
            const adapterMeta = this.adapter as unknown as Record<string, unknown>;
            console.log('📊 WebGPU Info: ', {
                info: adapterMeta.info ?? null,
                limits: adapterMeta.limits ?? null,
            });

            // Request GPU device using typed API
            const requiredFeatures: GPUFeatureName[] = [];
            const availableFeatures = Array.from((this.adapter.features ?? []) as Iterable<string>);
            if (availableFeatures.includes('timestamp-query')) {
                requiredFeatures.push('timestamp-query' as GPUFeatureName);
            }

            this.device = await this.adapter.requestDevice({
                requiredFeatures,
                requiredLimits: {, maxBufferSize: this.config.maxBufferSize,
                    maxStorageBufferBindingSize: this.config.maxBufferSize,
                    maxComputeWorkgroupStorageSize: 32768,
                },
            });
            this.queue = this.device.queue;

            // Set up error handling with typed event
            this.device.addEventListener('uncapturederror', (event: GPUUncapturedErrorEvent) => {
                this.metrics.errorCount++;
                const maybeErr = (event as unknown as { error?: unknown }).error;
                const message = maybeErr instanceof Error ? maybeErr.message : String(event);
                this.metrics.lastError = message;
                console.error('WebGPU Error: ', event);
            });

            // Initialize shader cache
            await this.initializeShaders();
            this.isInitialized = true;
            console.log('✅ WebGPU Tensor Accelerator initialized successfully');

            // Start metrics collection
            this.startMetricsCollection();
            return true;
        } catch (error: Error | unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('🔥 WebGPU failed: ', msg);
            this.metrics.errorCount++;
            this.metrics.lastError = msg;
            return false;
        }
    }

 private async initializeShaders(): Promise<void> {
 if (!this.device) throw new Error('Device not initialized');

 const shaders: Record<string, string> = {
 elementWiseProducts: `
 @group(0) @binding(0) var<storage, read> vectorA: array<f32>;
 @group(0) @binding(1) var<storage, read> vectorB: array<f32>;
 @group(0) @binding(2) var<storage, read_write> dotProducts_out: array<f32>;
 @group(0) @binding(3) var<storage, read_write> normASq_out: array<f32>;
 @group(0) @binding(4) var<storage, read_write> normBSq_out: array<f32>;
 @group(0) @binding(5) var<uniform> params: vec4<f32>; // size

 @compute @workgroup_size(256)
 fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
 let index = global_id.x;
 let size = u32(params.x);
 if (index >= size) { return; }
 let a = vectorA[index];
 let b = vectorB[index];
 dotProducts_out[index] = a * b;
 normASq_out[index] = a * a;
 normBSq_out[index] = b * b;
 }
 `,
 reduceSum: `
 @group(0) @binding(0) var<storage, read> input_array: array<f32>;
 @group(0) @binding(1) var<storage, read_write> output_sum: array<f32>; // Single element output
 @group(0) @binding(2) var<uniform> params: vec4<f32>; // size of input_array

 var<workgroup> temp: array<f32, 256>; // Assuming workgroup_size 256

 @compute @workgroup_size(256)
 fn main(@builtin(global_invocation_id) global_id: vec3<u32>,
 @builtin(local_invocation_id) local_id: vec3<u32>,
 @builtin(workgroup_id) workgroup_id: vec3<u32>) {
 let index = global_id.x;
 let local_index = local_id.x;
 let size = u32(params.x);

 if (index < size) { temp[local_index] = input_array[index]; }
 else { temp[local_index] = 0.0; }
 workgroupBarrier();

 var stride = 128u;
 while (stride > 0u) {
 if (local_index < stride) {
 temp[local_index] = temp[local_index] + temp[local_index + stride];
 }
 workgroupBarrier();
 stride = stride / 2u;
 }

 if (local_index == 0u) {
 // This assumes a single workgroup dispatch for the entire array.
 // For larger arrays, a multi-pass reduction or atomic operations would be needed.
 output_sum[0] = temp[0];
 }
 }
 `,
 cosineReduction: `
 @group(0) @binding(0) var<storage, read> dotProducts: array<f32>;
 @group(0) @binding(1) var<storage, read> normA: array<f32>;
 @group(0) @binding(2) var<storage, read> normB: array<f32>;
 @group(0) @binding(3) var<storage, read_write> result: array<f32>;
 @group(0) @binding(4) var<uniform> params: vec4<f32>;

 var<workgroup> temp: array<f32, 256>;

 @compute @workgroup_size(256)
 fn main(@builtin(global_invocation_id) global_id: vec3<u32>,
 @builtin(local_invocation_id) local_id: vec3<u32>,
 @builtin(workgroup_id) workgroup_id: vec3<u32>) {
 let index = global_id.x;
 let local_index = local_id.x;
 let size = u32(params.x);

 if (index < size) { temp[local_index] = dotProducts[index]; }
 else { temp[local_index] = 0.0; }
 workgroupBarrier();

 var stride = 128u;
 while (stride > 0u) {
 if (local_index < stride && (index + stride) < size) {
 temp[local_index] = temp[local_index] + temp[local_index + stride];
 }
 workgroupBarrier();
 stride = stride / 2u;
 }

 if (local_index == 0u) {
 let dot_sum = temp[0];
 let norm_a = normA[0];
 let norm_b = normB[0];
 let cosine = dot_sum / (norm_a * norm_b);
 result[workgroup_id.x] = cosine;
 }
 }
 `,
 embedding: `
 @group(0) @binding(0) var<storage, read> input: array<u32>;
 @group(0) @binding(1) var<storage, read> weights: array<f32>;
 @group(0) @binding(2) var<storage, read_write> output: array<f32>;
 @group(0) @binding(3) var<uniform> params: vec4<f32>;

 @compute @workgroup_size(256)
 fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
 let output_index = global_id.x;
 let input_size = u32(params.x);
 let embedding_dim = u32(params.y);
 let vocab_size = u32(params.z);

 if (output_index >= input_size * embedding_dim) { return; }

 let token_idx = output_index / embedding_dim;
 let dim_idx = output_index % embedding_dim;
 let token_id = input[token_idx];

 if (token_id < vocab_size) {
 let weight_idx = token_id * embedding_dim + dim_idx;
 output[output_index] = weights[weight_idx];
 } else {
 output[output_index] = 0.0;
 }
 }
 `,
 matrixMultiply: `
 @group(0) @binding(0) var<storage, read> matrixA: array<f32>;
 @group(0) @binding(1) var<storage, read> matrixB: array<f32>;
 @group(0) @binding(2) var<storage, read_write> result: array<f32>;
 @group(0) @binding(3) var<uniform> params: vec4<f32>;

 var<workgroup> tileA: array<array<f32, 16>, 16>;
 var<workgroup> tileB: array<array<f32, 16>, 16>;

 @compute @workgroup_size(16, 16)
 fn main(@builtin(global_invocation_id) global_id: vec3<u32>,
 @builtin(local_invocation_id) local_id: vec3<u32>) {
 let M = u32(params.x);
 let N = u32(params.y);
 let K = u32(params.z);

 let row = global_id.y;
 let col = global_id.x;
 let localRow = local_id.y;
 let localCol = local_id.x;

 var sum = 0.0;
 let numTiles = (K + 15u) / 16u;

 for (var tile = 0u; tile < numTiles; tile = tile + 1u) {
 let tileCol = tile * 16u + localCol;
 let tileRow = tile * 16u + localRow;

 if (row < M && tileCol < K) { tileA[localRow][localCol] = matrixA[row * K + tileCol]; }
 else { tileA[localRow][localCol] = 0.0; }

 if (tileRow < K && col < N) { tileB[localRow][localCol] = matrixB[tileRow * N + col]; }
 else { tileB[localRow][localCol] = 0.0; }

 workgroupBarrier();

 for (var k = 0u; k < 16u; k = k + 1u) {
 sum = sum + tileA[localRow][k] * tileB[k][localCol];
 }
 workgroupBarrier();
 }

 if (row < M && col < N) { result[row * N + col] = sum; }
 }
 `,
 };

 for (const [name, source] of Object.entries(shaders)) {
 const shader = this.device.createShaderModule({ label: `${ name }Shader`, code: source });
 if (this.config.shaderCacheEnabled) {
 this.shaderCache.set(name, shader);
 }
 }
 }

    async calculateVectorSimilarity(vectorA: Float32Array, vectorB: Float32Array): Promise<number> {
        if (!this.isInitialized || !this.device) {
            throw new Error('WebGPU not initialized');
        }
        const start = performance.now();
        let dotProductSum = 0;
        let normASqSum = 0;
        let normBSqSum = 0;

        try {
            const size = Math.min(vectorA.length, vectorB.length);
            const workgroupSize = 256; // Must match shader's @workgroup_size

            // --- Pass 1: Element-wise products and squares ---
            const bufferA = this.createBuffer(vectorA, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
            const bufferB = this.createBuffer(vectorB, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
            const dotProductsElemBuffer = this.device.createBuffer({
                size: size * 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
            });
            const normASqElemBuffer = this.device.createBuffer({
                size: size * 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
            });
            const normBSqElemBuffer = this.device.createBuffer({
                size: size * 4,
                usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
            });
            const paramsBufferElem = this.device.createBuffer({
                size: 16, // vec4<f32>
                usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            });
            this.queue!.writeBuffer(paramsBufferElem, 0, new Float32Array([size, 0, 0, 0]));

 const elementWiseShader = this.shaderCache.get('elementWiseProducts')!;
 const elementWisePipeline = this.device.createComputePipeline({
 layout: 'auto',
 compute: {, module: elementWiseShader,
 entryPoint: 'main',
 },
 });

 const elementWiseBindGroup = this.device.createBindGroup({
 layout: elementWisePipeline.getBindGroupLayout(0),
 entries: [
 { binding: 0, resource: {, buffer: bufferA } },
 { binding: 1, resource: {, buffer: bufferB } },
 { binding: 2, resource: {, buffer: dotProductsElemBuffer } },
 { binding: 3, resource: {, buffer: normASqElemBuffer } },
 { binding: 4, resource: {, buffer: normBSqElemBuffer } },
 { binding: 5, resource: {, buffer: paramsBufferElem } }],
 });

 const commandEncoder1 = this.device.createCommandEncoder();
 const computePass1 = commandEncoder1.beginComputePass();
 computePass1.setPipeline(elementWisePipeline);
 computePass1.setBindGroup(0, elementWiseBindGroup);
 computePass1.dispatchWorkgroups(Math.ceil(size / workgroupSize));
 computePass1.end();
 this.queue!.submit([commandEncoder1.finish()]);

 // --- Pass 2: Reduction (Summation) for dot product, normA_sq, normB_sq ---
 const reduceSumShader = this.shaderCache.get('reduceSum')!;
 const reduceSumPipeline = this.device.createComputePipeline({
 layout: 'auto',
 compute: {, module: reduceSumShader,
 entryPoint: 'main',
 },
 });

 // Output buffers for sums (single float each)
 const dotProductSumBuffer = this.device.createBuffer({
 size: 4, // 1 float
 usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
 });
 const normASqSumBuffer = this.device.createBuffer({
 size: 4, // 1 float
 usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
 });
 const normBSqSumBuffer = this.device.createBuffer({
 size: 4, // 1 float
 usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
 });

 const paramsBufferReduce = this.device.createBuffer({
 size: 16, // vec4<f32>
 usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
 });
 this.queue!.writeBuffer(paramsBufferReduce, 0, new Float32Array([size, 0, 0, 0]));

 const commandEncoder2 = this.device.createCommandEncoder();

 // Reduce dot products
 const reduceDotProductsBindGroup = this.device.createBindGroup({
 layout: reduceSumPipeline.getBindGroupLayout(0),
 entries: [
 { binding: 0, resource: {, buffer: dotProductsElemBuffer } },
 { binding: 1, resource: {, buffer: dotProductSumBuffer } },
 { binding: 2, resource: {, buffer: paramsBufferReduce } }],
 });
 const computePass2_1 = commandEncoder2.beginComputePass();
 computePass2_1.setPipeline(reduceSumPipeline);
 computePass2_1.setBindGroup(0, reduceDotProductsBindGroup);
 computePass2_1.dispatchWorkgroups(1); // Assuming size <= workgroupSize for single dispatch reduction
 computePass2_1.end();

 // Reduce normA squares
 const reduceNormASqBindGroup = this.device.createBindGroup({
 layout: reduceSumPipeline.getBindGroupLayout(0),
 entries: [
 { binding: 0, resource: {, buffer: normASqElemBuffer } },
 { binding: 1, resource: {, buffer: normASqSumBuffer } },
 { binding: 2, resource: {, buffer: paramsBufferReduce } }],
 });
 const computePass2_2 = commandEncoder2.beginComputePass();
 computePass2_2.setPipeline(reduceSumPipeline);
 computePass2_2.setBindGroup(0, reduceNormASqBindGroup);
 computePass2_2.dispatchWorkgroups(1); // Assuming size <= workgroupSize
 computePass2_2.end();

 // Reduce normB squares
 const reduceNormBSqBindGroup = this.device.createBindGroup({
 layout: reduceSumPipeline.getBindGroupLayout(0),
 entries: [
 { binding: 0, resource: {, buffer: normBSqElemBuffer } },
 { binding: 1, resource: {, buffer: normBSqSumBuffer } },
 { binding: 2, resource: {, buffer: paramsBufferReduce } }],
 });
 const computePass2_3 = commandEncoder2.beginComputePass();
 computePass2_3.setPipeline(reduceSumPipeline);
 computePass2_3.setBindGroup(0, reduceNormBSqBindGroup);
 computePass2_3.dispatchWorkgroups(1); // Assuming size <= workgroupSize
 computePass2_3.end();

 this.queue!.submit([commandEncoder2.finish()]);

 // --- Pass 3: Read back sums to CPU ---
 const stagingBufferDot = this.device.createBuffer({
 size: 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
 });
 const stagingBufferNormA = this.device.createBuffer({
 size: 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
 });
 const stagingBufferNormB = this.device.createBuffer({
 size: 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
 });

 const commandEncoder3 = this.device.createCommandEncoder();
 commandEncoder3.copyBufferToBuffer(dotProductSumBuffer, 0, stagingBufferDot, 0, 4);
 commandEncoder3.copyBufferToBuffer(normASqSumBuffer, 0, stagingBufferNormA, 0, 4);
 commandEncoder3.copyBufferToBuffer(normBSqSumBuffer, 0, stagingBufferNormB, 0, 4);
 this.queue!.submit([commandEncoder3.finish()]);

 await Promise.all([
 stagingBufferDot.mapAsync(GPUMapMode.READ),
 stagingBufferNormA.mapAsync(GPUMapMode.READ),
 stagingBufferNormB.mapAsync(GPUMapMode.READ)]);

 dotProductSum = new Float32Array(stagingBufferDot.getMappedRange())[0];
 normASqSum = new Float32Array(stagingBufferNormA.getMappedRange())[0];
 normBSqSum = new Float32Array(stagingBufferNormB.getMappedRange())[0];

 // --- Pass 4: Calculate final cosine similarity on CPU ---
 let cosineSimilarity = 0;
 if (normASqSum > 0 && normBSqSum > 0) {
 cosineSimilarity = dotProductSum / (Math.sqrt(normASqSum) * Math.sqrt(normBSqSum));
 }

 // Cleanup
 stagingBufferDot.unmap();
 stagingBufferNormA.unmap();
 stagingBufferNormB.unmap();

 bufferA.destroy();
 bufferB.destroy();
 dotProductsElemBuffer.destroy();
 normASqElemBuffer.destroy();
 normBSqElemBuffer.destroy();
 paramsBufferElem.destroy();
 dotProductSumBuffer.destroy();
 normASqSumBuffer.destroy();
 normBSqSumBuffer.destroy();
 paramsBufferReduce.destroy();
 stagingBufferDot.destroy();
 stagingBufferNormA.destroy();
 stagingBufferNormB.destroy();

 // Update metrics
 const duration = performance.now() - start;
 this.updateMetrics(duration);
 return cosineSimilarity;
 } catch (error: Error | unknown) {
 const msg = error instanceof Error ? error.message : String(error);
 this.metrics.errorCount++;
 this.metrics.lastError = msg;
 throw error;
 }
 }

    /**
     * Enhanced vector similarity with SIMD GPU tiling for large embeddings
     * This method demonstrates gpuTile: true option in the hot path
     */
    async calculateVectorSimilarityWithSIMDTiling(
        vectorA: Float32Array,
        vectorB: Float32Array,
        options: { enableTiling?: boolean; tileSize?: number; useEvidenceAnalysis?: boolean } = {}
    ): Promise<Record<string, unknown>> {
        const start = performance.now();
        const { enableTiling = true, tileSize = 256, useEvidenceAnalysis = false } = options;

        try {
            // Standard WebGPU similarity calculation
            const standardSimilarity = await this.calculateVectorSimilarity(vectorA, vectorB);
            const gpuTime = performance.now() - start;

            let tilingMeta: Record<string, unknown> | null = null;
            let simdTime = 0;

            if (enableTiling) {
                console.log('🎛️ Applying SIMD GPU tiling to embedding vectors...');
                const simdStart = performance.now();
                const combinedData = new Float32Array(vectorA.length + vectorB.length);
                combinedData.set(vectorA, 0);
                combinedData.set(vectorB, vectorA.length);

                try {
                    const evidenceId = `vector_similarity_${Date.now()}`;
                    const tilingResults = await this.simdTilingEngine.processEvidenceWithSIMDTiling(
                        // Fix: Use the instantiated engine
                        evidenceId,
                        combinedData,
                        Math.ceil(Math.sqrt(combinedData.length)), // Simulate width
                        Math.ceil(Math.sqrt(combinedData.length)), // Simulate height
                        {
                            tileSize,
                            evidenceType: useEvidenceAnalysis ? 'mixed' : 'text',
                            enableCompression: true,
                            priority: 'high',
                            generateEmbeddings: false, // We already have embeddings
                        }
                    );
                    simdTime = performance.now() - simdStart;

                    // Safely read chunks (unknown shape) and compute aggregates with type guards
                    const chunks = Array.isArray(
                        (tilingResults as unknown as Record<string, unknown>)['chunks']
                    )
                        ? ((tilingResults as unknown as Record<string, unknown>)['chunks'] as unknown[])
                        : [];
                    const tilesGenerated = chunks.length;
                    const avgConfidence =
                        chunks.reduce((sum: number, ch) => {
                            // Fix: Explicitly type 'sum'
                            const metadata = (ch as Record<string, unknown>)['metadata'] as unknown;
                            const confidence =
                                typeof metadata === 'object' &&
                                metadata !== null &&
                                'confidence' in (metadata as Record<string, unknown>) &&
                                typeof (metadata as Record<string, unknown>)['confidence'] === 'number'
                                    ? ((metadata as Record<string, unknown>)['confidence'] as number)
                                    : 0;
                            return sum + confidence;
                        }, 0) / Math.max(1, tilesGenerated);

                    const compressionRatio =
                        (tilingResults as unknown as Record<string, unknown>)['tensorCompressionRatio'] ?? null;
                    const memoryRegions = chunks.reduce(
                        (acc: Record<string, number>, ch) => {
                            // Fix: Explicitly type 'acc'
                            const region = (ch as Record<string, unknown>)['memoryRegion'];
                            const key = typeof region === 'string' ? region : String(region ?? 'unknown');
                            acc[key] = (acc[key] ?? 0) + 1;
                            return acc;
                        },
                        {} as Record<string, number>
                    );
                    const simdMetrics =
                        (tilingResults as unknown as Record<string, unknown>)['simdMetrics'] ?? null;

                    tilingMeta = {
                        tilesGenerated,
                        avgConfidence,
                        compressionRatio,
                        memoryRegions,
                        simdMetrics,
                    };

                    const confidenceBoost = Math.min(0.1, (avgConfidence ?? 0) * 0.05); // Max 10% boost
                    const enhancedSimilarity = standardSimilarity * (1 + confidenceBoost);

                    console.log(
                        `✅ SIMD complete: ${tilesGenerated} tiles, ${confidenceBoost.toFixed(4)} confidence boost`
                    );

                    const totalTime = performance.now() - start;
                    // Adapter/device friendly name resolution
                    const adapterMeta = this.adapter
                        ? (this.adapter as unknown as Record<string, unknown>)
                        : {};

                    const adapterName =
                        typeof adapterMeta['name'] === 'string'
                            ? (adapterMeta['name'] as string)
                            : typeof (adapterMeta['info'] as Record<string, unknown>)?.['device'] === 'string'
                            ? ((adapterMeta['info'] as Record<string, unknown>)['device'] as string)
                            : 'Unknown GPU';

                    return {
                        similarity: enhancedSimilarity,
                        gpuMeta: {
                            standardSimilarity,
                            confidenceBoost,
                            device: adapterName,
                        },
                        tilingMeta,
                        performanceMetrics: {
                            totalTime,
                            simdTime,
                            gpuTime,
                            throughput: (vectorA.byteLength + vectorB.byteLength) / 1024 / 1024 / (totalTime / 1000), // MB/s
                        },
                    } as Record<string, unknown>;
                } catch (tilingError: Error | unknown) {
                    const tmsg = tilingError instanceof Error ? tilingError.message : String(tilingError);
                    console.warn('SIMD GPU tiling failed, using similarity: ', tmsg);
                    simdTime = performance.now() - simdStart;
                }
            }

            const totalTime = performance.now() - start;
            const adapterMeta = this.adapter ? (this.adapter as unknown as Record<string, unknown>) : {};

            const adapterName =
                typeof adapterMeta['name'] === 'string'
                    ? (adapterMeta['name'] as string)
                    : typeof (adapterMeta['info'] as Record<string, unknown>)?.['device'] === 'string'
                    ? ((adapterMeta['info'] as Record<string, unknown>)['device'] as string)
                    : 'Unknown GPU';

            return {
                similarity: standardSimilarity,
                gpuMeta: {
                    standardSimilarity,
                    tilingEnabled: false,
                    device: adapterName,
                },
                performanceMetrics: {
                    totalTime,
                    simdTime,
                    gpuTime,
                    throughput: (vectorA.byteLength + vectorB.byteLength) / 1024 / 1024 / (totalTime / 1000), // MB/s
                },
            } as Record<string, unknown>;
        } catch (error: Error | unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            this.metrics.errorCount++;
            this.metrics.lastError = msg;
            throw error;
        }
    } async batchProcessEmbeddings(queries: string[]): Promise<Float32Array[]> {
 const embeddings: Float32Array[] = [];
 for (const query of queries) {
 // Simple tokenization and embedding (in production, use proper tokenizer)
 const tokens = this.simpleTokenize(query);
 const embedding = await this.generateEmbedding(tokens);
 embeddings.push(embedding);
 }
 return embeddings;
 }

 private simpleTokenize(text: string): Uint32Array {
 // Simplified tokenization - replace with proper tokenizer
 const words = text
 .toLowerCase()
 .split(/\W+/)
 .filter((w: string) => w.length > 0);
 const tokens = words.map((word) => this.getTokenId(word));
 return new Uint32Array(tokens);
 }

 private getTokenId(word: string): number {
 // Simple hash-based token ID (replace with proper vocabulary)
 let hash = 0;
 for (let i = 0; i < word.length; i++) {
 hash = ((hash << 5) - hash + word.charCodeAt(i)) & 0xffffffff;
 }
 return Math.abs(hash) % 50000; // Assume vocab size of 50k
 }

 private async generateEmbedding(tokens: Uint32Array): Promise<Float32Array> {
 if (!this.device) throw new Error('Device not initialized');

 const embeddingDim = 384; // nomic-embed-text dimension
 const vocabSize = 50000;

 // Create random weights (in production, load pre-trained weights)
 const weights = new Float32Array(vocabSize * embeddingDim);
 for (let i = 0; i < weights.length; i++) {
 weights[i] = (Math.random() - 0.5) * 0.1;
 }

 // Create buffers
 const tokensBuffer = this.createBuffer(
 tokens,
 GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
 );
 const weightsBuffer = this.createBuffer(
 weights,
 GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
 );
 const outputBuffer = this.device.createBuffer({
 size: tokens.length * embeddingDim * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
 });
 const paramsBuffer = this.device.createBuffer({
 size: 16, // vec4<f32> is 16 bytes
 usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
 });

 // Upload parameters
 this.queue!.writeBuffer(
 paramsBuffer,
 0,
 new Float32Array([tokens.length, embeddingDim, vocabSize, 0])
 );

 // Execute embedding computation
 const shader = this.shaderCache.get('embedding')!;
 const computePipeline = this.device.createComputePipeline({
 layout: 'auto',
 compute: {, module: shader,
 entryPoint: 'main',
 },
 });

 const bindGroup = this.device.createBindGroup({
 layout: computePipeline.getBindGroupLayout(0),
 entries: [
 { binding: 0, resource: {, buffer: tokensBuffer } },
 { binding: 1, resource: {, buffer: weightsBuffer } },
 { binding: 2, resource: {, buffer: outputBuffer } },
 { binding: 3, resource: {, buffer: paramsBuffer } }],
 });

 const commandEncoder = this.device.createCommandEncoder();
 const computePass = commandEncoder.beginComputePass();
 computePass.setPipeline(computePipeline);
 computePass.setBindGroup(0, bindGroup);
 computePass.dispatchWorkgroups(Math.ceil((tokens.length * embeddingDim) / 256));
 computePass.end();

 // Copy and read result
 const stagingBuffer = this.device.createBuffer({
 size: tokens.length * embeddingDim * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
 });
 commandEncoder.copyBufferToBuffer(
 outputBuffer,
 0,
 stagingBuffer,
 0,
 tokens.length * embeddingDim * 4
 );
 this.queue!.submit([commandEncoder.finish()]);

 await stagingBuffer.mapAsync(GPUMapMode.READ);
 const mapped = stagingBuffer.getMappedRange();
 const result = new Float32Array(mapped);

 // Average token embeddings
 const finalEmbedding = new Float32Array(embeddingDim);
 for (let i = 0; i < embeddingDim; i++) {
 let sum = 0;
 for (let j = 0; j < tokens.length; j++) {
 sum += result[j * embeddingDim + i];
 }
 finalEmbedding[i] = sum / Math.max(1, tokens.length);
 }

 // Cleanup
 stagingBuffer.unmap();
 tokensBuffer.destroy();
 weightsBuffer.destroy();
 outputBuffer.destroy();
 stagingBuffer.destroy();
 paramsBuffer.destroy();

 return finalEmbedding;
 }

    private createBuffer(data: BufferSource, usage: GPUBufferUsageFlags): GPUBuffer {
        // Fix: Changed data type to BufferSource
        const buffer = this.device!.createBuffer({
            size: data.byteLength,
            usage,
        });
        this.queue!.writeBuffer(buffer, 0, data);
        return buffer;
    }

    private updateMetrics(duration: number): void {
        this.metrics.totalOperations++;
        this.metrics.averageLatency =
            (this.metrics.averageLatency * (this.metrics.totalOperations - 1) + duration) /
            this.metrics.totalOperations;
        this.metrics.operationsPerSecond =
            this.metrics.averageLatency > 0 ? 1000 / this.metrics.averageLatency : 0;
    }

    private startMetricsCollection(): void {
        setInterval(() => {
            const adapterMeta = this.adapter
                ? (this.adapter as unknown as Record<string, unknown>)
                : null;
            if (adapterMeta && 'memoryUsage' in adapterMeta) {
                const m = adapterMeta['memoryUsage'];
                this.metrics.memoryUsage = typeof m === 'number' ? m : 0;
            }
        }, 1000);
    }

    getMetrics(): GPUMetrics {
        return { ...this.metrics };
    }

    getCapabilities(): Record<string, unknown> {
        const adapterMeta = this.adapter ? (this.adapter as unknown as Record<string, unknown>) : null;
        return {
            isSupported:
                typeof navigator !== 'undefined' && !!(navigator as unknown as { gpu?: GPU }).gpu,
            isInitialized: this.isInitialized,
            adapterInfo: adapterMeta?.info ?? null,
            limits: adapterMeta?.limits ?? null,
            features: this.adapter ? Array.from((this.adapter.features ?? []) as Iterable<string>) : [],
            shaderCacheSize: this.shaderCache.size,
        };
    }

    async cleanup(): Promise<void> {
        if (
            this.device &&
            typeof (this.device as unknown as Record<string, unknown>)?.['destroy'] === 'function'
        ) {
            // call destroy if available
            (this.device as unknown as { destroy?: () => void }).destroy?.();
            this.device = null;
        }
        this.bufferPool.forEach((buffer) => buffer.destroy());
        this.bufferPool = [];
        this.shaderCache.clear();
        this.isInitialized = false; // Re-assigning $state to reset reactivity
        console.log('🧹 WebGPU Tensor Accelerator cleaned up');
    }
}

// Singleton instance
let tensorAccelerator: WebGPUTensorAccelerator | null = null;

export async function initializeWebGPU(): Promise<WebGPUTensorAccelerator | null> {
    if (!tensorAccelerator) {
        tensorAccelerator = new WebGPUTensorAccelerator({
            powerPreference: 'high-performance',
            enableDebug: true,
            shaderCacheEnabled: true,
        });
        const success = await tensorAccelerator.initialize();
        if (!success) {
            tensorAccelerator = null;
        }
    }
    return tensorAccelerator;
}

export function getWebGPUAccelerator(): WebGPUTensorAccelerator | null {
    return tensorAccelerator;
}

// Export singleton instance and compatibility functions
export { tensorAccelerator };

export async function acceleratedSimilarity(a: Float32Array, b: Float32Array): Promise<number> {
    const accelerator = getWebGPUAccelerator();
    if (!accelerator) {
        // Fallback to CPU implementation
        let dotProduct = 0;
        let normASq = 0;
        let normBSq = 0;
        const len = Math.min(a.length, b.length);
        for (let i = 0; i < len; i++) {
            dotProduct += a[i] * b[i];
            normASq += a[i] * a[i];
            normBSq += b[i] * b[i];
        }
        if (normASq === 0 || normBSq === 0) return 0;
        return dotProduct / (Math.sqrt(normASq) * Math.sqrt(normBSq));
    }
    // If accelerator is present, use its method.
    // The original code had a CPU fallback here even if accelerator was present,
    // but the intent seems to be to use the accelerator if available.
    // Assuming calculateVectorSimilarity is the intended method.
    try {
        return await accelerator.calculateVectorSimilarity(a, b);
    } catch (e) {
        console.warn('WebGPU similarity calculation failed, falling back to CPU.', e);
        let dotProduct = 0;
        let normASq = 0;
        let normBSq = 0;
        const len = Math.min(a.length, b.length);
        for (let i = 0; i < len; i++) {
            dotProduct += a[i] * b[i];
            normASq += a[i] * a[i];
            normBSq += b[i] * b[i];
        }
        if (normASq === 0 || normBSq === 0) return 0;
        return dotProduct / (Math.sqrt(normASq) * Math.sqrt(normBSq));
    }
}
 if (normASq === 0 || normBSq === 0) return 0;
 return dotProduct / (Math.sqrt(normASq) * Math.sqrt(normBSq));
 }
}




