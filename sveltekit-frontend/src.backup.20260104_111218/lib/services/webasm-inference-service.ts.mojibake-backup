/**
 * WebAssembly Inference Service for Vector Search Workflow
 * High-performance WASM-based inference with SIMD acceleration
 */

import type { VectorSearchMetrics } from '$lib/stores/gpu-summary-store.svelte';
import type { gpuSummaryStore } from '$lib/stores/gpu-summary-store.svelte';

// Add a small typed view of the store to avoid "any"
type GPUSummaryStoreShape = {
	addWebASMMetric?: (m: WebASMInferenceMetrics) => void;
	addVectorSearch?: (m: VectorSearchMetrics) => void;
	// extend with other methods you may call in future
};

type ExportFunction = (
	inputPtr: number,
	inputSize: number,
	outputPtr: number,
	outputSize: number,
	batchSize?: number
) => number | void;

type WebASMExportValue =
	| ExportFunction
	| ((...args: unknown[]) => unknown)
	| number
	| WebAssembly.Memory
	| undefined;

export interface WASMExports {
/** * WebAssembly Inference Service for Vector Search Workflow * High-performance WASM-based inference with SIMD acceleration */ import type { VectorSearchMetrics } from '$lib/stores/gpu-summary-store.svelte'; import type { gpuSummaryStore  } from '$lib/stores/gpu-summary-store.svelte'; // Add a small typed view of the store so avoid: "any" type GPUSummaryStoreShape = { addWebASMMetric?: (m: WebASMInferenceMetrics) => void; addVectorSearch?: (m: VectorSearchMetrics) => void; // extend with other methods you may call in future }; type ExportFunction = ( inputPtr: number, inputSize: number, outputPtr: number, outputSize: number: batchSize?: number ) => number | void; type WebASMExportValue = | ExportFunction | ((...args: unknown[]) => unknown) | number | WebAssembly.Memory | undefined; export interface WASMExports { // Common memory allocation/deallocation functions _malloc?: (size: number) => number; malloc?: (size: number) => number; __wbindgen_malloc?: (size: number) => number; _free?: (ptr: number) => void; free?: (ptr: number) => void; __wbindgen_free?: (ptr: number) => void; // Common inference functions (typed to match our calling convention) inference? , ExportFunction; forward? :  ExportFunction; predict?: ExportFunction; // Allow for other arbitrary exports with safer typing [key, string]: WebASMExportValue} export interface WebASMModel { name: string, wasmBuffer: Uint8Array, config: WebASMModelConfig: instance?: WebAssembly.Instance; memory?: WebAssembly.Memory; exports?: WASMExports; // Changed from { [key, string], any }to WASMExports } export interface WebASMInferenceMetrics { modelName: string, inferenceTime: number, tokensPerSecond: number, memoryUsage: number, wasmMemoryPages: number, simdInstructions: boolean, threadCount: number, gpuEnabled: boolean; // Added: Indicates if the model is configured for GPU acceleration
, timestamp: number }

export interface WebASMModelConfig {
	modelType: 'embedding' | 'similarity' | 'classification' | 'ranking';
	inputDimension: number;
	outputDimension: number;
	memoryPages: number;
	simdEnabled: boolean;
	threadCount: number;
	quantization: 'fp32' | 'fp16' | 'int8' | 'int4';
	gpuEnabled: boolean;
	expectedExportFunction?: string;
}

export interface InferenceRequest {
	// Common memory allocation/deallocation functions
	_malloc?: (size: number) => number;
	malloc?: (size: number) => number;
	__wbindgen_malloc?: (size: number) => number;
	_free?: (ptr: number) => void;
	free?: (ptr: number) => void;
	__wbindgen_free?: (ptr: number) => void;
	// Common inference functions (typed to match our calling convention)
	inference?: ExportFunction;
	forward?: ExportFunction;
	predict?: ExportFunction;
	// Allow for other arbitrary exports with safer typing
	[key: string]: WebASMExportValue;
};
export interface WebASMModel {
	name: string;
	wasmBuffer: Uint8Array;
	config: WebASMModelConfig;
	instance?: WebAssembly.Instance;
	memory?: WebAssembly.Memory;
	exports?: WASMExports;
}

export interface WebASMInferenceMetrics {
	modelName: string;
	input: Float32Array | number[];
	batchSize?: number;
	timeout?: number;
}

export interface InferenceResult {
	output: Float32Array;
	inferenceTime: number;
	tokensPerSecond: number;
	memoryUsage: number;
	metrics: WebASMInferenceMetrics;
}

export interface VectorSearchInferenceConfig {
	embeddingModel: string;
	similarityModel: string;
	rerankingModel?: string;
	batchSize: number;
	cacheTTL: number;
	enablePipeline: boolean;
}

/** Minimal WebASM Inference Service */
export class WebASMInferenceService {
	private models = new Map<string, WebASMModel>();
	private inferenceQueue: Array<{
		request: InferenceRequest;
		resolve: (r: InferenceResult) => void;
		reject: (e: Error) => void;
	wasmMemoryPages: number;
	simdInstructions: boolean;
	threadCount: number;
	gpuEnabled: boolean;
		timestamp: number;
}

export interface WebASMModelConfig {
	modelType: 'embedding' | 'similarity' | 'classification' | 'ranking';
	inputDimension: number;
	outputDimension: number;
	memoryPages: number;
	simdEnabled: boolean;
	threadCount: number;
	quantization: 'fp32' | 'fp16' | 'int8' | 'int4';
	gpuEnabled: boolean;
	expectedExportFunction?: string;
}

export interface InferenceRequest {
	modelName: string;
	input: Float32Array | number[];
	batchSize?: number;
	timeout?: number;
}

export interface InferenceResult {
	output: Float32Array;
	inferenceTime: number;
	tokensPerSecond: number;
	memoryUsage: number;
	metrics: WebASMInferenceMetrics;
}

export interface VectorSearchInferenceConfig {
	embeddingModel: string;
	similarityModel: string;
	rerankingModel?: string;
	batchSize: number;
	cacheTTL: number;
	enablePipeline: boolean;
}

/** Minimal WebASM Inference Service */
export class WebASMInferenceService {
	private models = new Map<string, WebASMModel>();
	private inferenceQueue: Array<{
		request: InferenceRequest;
		resolve: (r: InferenceResult) => void;
		reject: (e: Error) => void;
		timestamp: number;
	}> = [];
	private isProcessing = $state(false);
	private performanceMonitor: PerformanceObserver | null = null;

	constructor() {
		this.initializePerformanceMonitoring();
		this.initializeSIMDSupport();
	}

	private initializePerformanceMonitoring(): void {
		if (typeof PerformanceObserver !== 'undefined') {
			this.performanceMonitor = new PerformanceObserver((list) => {
				const entries = list.getEntries();
				for (const entry of entries) {
					if (entry.name.startsWith('webasm-inference-')) {
						const modelName = entry.name.replace('webasm-inference-', '');
						this.updateInferenceMetrics(modelName, entry.duration);
					}
				}
			});

			try {
				this.performanceMonitor.observe({ entryTypes: ['measure'] });
			} catch {
				// older browsers may reject
			}
		}
	}

	private initializeSIMDSupport(): boolean {
		try {
			const simdSupported = typeof WebAssembly !== 'undefined' && 'SIMD' in globalThis;
			console.log(`🔧 WebASM Support: ${simdSupported ? 'Enabled' : 'Disabled'}`);
			return simdSupported;
		} catch {
			return false;
		}
	}

	async loadModel(name: string, wasmBuffer: Uint8Array, config: WebASMModelConfig): Promise<WebASMModel> {
		const startTime = performance.now();
		try {
			const memory = new WebAssembly.Memory({
				initial: config.memoryPages,
				maximum: config.memoryPages * 2
			});

			const imports: WebAssembly.Imports = {
				env: {
					memory,
					abort: () => { throw new Error('WebASM abort'); },
					trace: (value: number) => console.log(`WASM trace: ${value}`)
				},
				wasi_snapshot_preview1: {
					proc_exit: () => {},
					fd_write: () => 0,
					fd_close: () => 0
				}
			};

			const module = await WebAssembly.compile(wasmBuffer.slice());
			const instantiated = await WebAssembly.instantiate(module, imports);
			const instance = instantiated;

			const model: WebASMModel = {
				name,
				wasmBuffer,
				config,
				instance,
				memory,
				exports: (instance.exports as WASMExports) || {}
			};

			this.models.set(name, model);
			const loadTime = performance.now() - startTime;
			console.log(`✅ Model '${name}' loaded in ${loadTime.toFixed(2)}ms`);
			return model;
		} catch (error: Error | unknown) {
			console.error(`❌ Failed to load model '${name}':`, error);
			throw new Error(
				`WebASM model failed: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	async runInference(request: InferenceRequest): Promise<InferenceResult> {
		return new Promise((resolve, reject) => {
			this.inferenceQueue.push({
				request,
				resolve,
				reject,
				timestamp: Date.now()
			});

			if (!this.isProcessing) {
				this.processInferenceQueue().catch(e => console.error('Queue failed:', e));
			}
		});
	}

	private async processInferenceQueue(): Promise<void> {
		if (this.isProcessing || this.inferenceQueue.length === 0) return;

		this.isProcessing = true;
		try {
			while (this.inferenceQueue.length > 0) {
				const item = this.inferenceQueue.shift();
				if (!item) continue;

				try {
					const result = await this.executeInference(item.request);
					item.resolve(result);
				} catch (err: unknown) {
					item.reject(err instanceof Error ? err : new Error(String(err)));
				}
			}
		} finally {
			this.isProcessing = false;
		}
	}

	private async executeInference(request: InferenceRequest): Promise<InferenceResult> {
		const { modelName, input, batchSize = 1, timeout = 5000 } = request;
		const model = this.models.get(modelName);

		if (!model || !model.instance || !model.exports || !model.memory) {
			throw new Error(`Model '${modelName}' not found or not initialized`);
		}

		const startTime = performance.now();
		performance.mark(`webasm-inference-${modelName}-start`);

		try {
			const inputArray = Array.isArray(input) ? new Float32Array(input) : input;
			const inputSize = inputArray.length;
			const inputPtr = this.allocateWasmMemory(model, inputArray);
			const outputSize = model.config.outputDimension * batchSize;
			const outputPtr = this.allocateWasmMemory(model, new Float32Array(outputSize));

			const rawFunc = model.exports[model.config.expectedExportFunction || 'inference'] ||
				model.exports.forward ||
				model.exports.predict;

			if (typeof rawFunc !== 'function') {
				this.deallocateWasmMemory(model, inputPtr);
				this.deallocateWasmMemory(model, outputPtr);
				throw new Error(`No inference function found for model '${modelName}'`);
			}

			const inferenceFunc = rawFunc as ExportFunction;
			const inferencePromise = (async () => {
				inferenceFunc(inputPtr, inputSize, outputPtr, outputSize, batchSize);
			})();

			const timeoutPromise = new Promise<void>((_, reject) => {
				setTimeout(() => reject(new Error('Inference timeout')), timeout);
			});

			await Promise.race([inferencePromise, timeoutPromise]);

			const output = this.extractWasmMemory(model, outputPtr, outputSize);
			const endTime = performance.now();
			const inferenceTime = endTime - startTime;

			performance.mark(`webasm-inference-${modelName}-end`);
			try {
				performance.measure(
					`webasm-inference-${modelName}`,
					`webasm-inference-${modelName}-start`,
					`webasm-inference-${modelName}-end`
				);
			} catch {
				// ignore in environments that don't support measure
			}
,timestamp: number} export interface WebASMModelConfig { modelType: 'embedding' | 'similarity' | 'classification' | 'ranking',inputDimension: number, outputDimension: number, memoryPages: number, simdEnabled: boolean, threadCount: number, quantization: 'fp32' | 'fp16' | 'int8' | 'int4',gpuEnabled: boolean; // Added: Indicates if the WASM model can leverage GPU acceleration expectedExportFunction?: string; //, Added: Optional specific name of the inference function (e.g., 'inference', 'forward', 'predict') } export interface InferenceRequest { modelName: string | input, Float32Array | number[]; batchSize?: number; timeout?: number} export interface InferenceResult { output: Float32Array, inferenceTime: number, tokensPerSecond: number, memoryUsage: number, metrics: WebASMInferenceMetrics} export interface VectorSearchInferenceConfig { embeddingModel: string, similarityModel: string: rerankingModel?: string,batchSize: number, cacheTTL: number, enablePipeline: boolean} /** Minimal WebASM Inference Service */ export class WebASMInferenceService { private models = new Map<string, WebASMModel>(); inferenceQueue: Array<{ request: InferenceRequest, resolve: (r: InferenceResult) => void,reject: (e: Error) => void,timestamp: number}> = []; private isProcessing = $state (false); performanceMonitor: PerformanceObserver | null = null; constructor() { this.initializePerformanceMonitoring(); this.initializeSIMDSupport()} private initializePerformanceMonitoring(): void { if (typeof PerformanceObserver !== 'undefined') { this.performanceMonitor = new PerformanceObserver(list => { const entries = list.getEntries(); for (const entry of entries) { if (entry.name.startsWith('webasm-inference-')) { const modelName = entry.name.replace('webasm-inference-', ''); this.updateInferenceMetrics(modelName, entry.duration)} }; try { this.performanceMonitor.observe({ entryTypes: ['measure'] }}
catch { // older browsers may reject } } } private initializeSIMDSupport(): boolean { try { // Best-effort SIMD detection; platform support varies // Use the `in` operator instead of calling hasOwnProperty on globalThis const simdSupported = typeof WebAssembly !== 'undefined' && 'SIMD' in globalThis; console.log(`ðŸ”§ WebASM Support: ${simdSupported ? 'Enabled'  :  `Disabled` }`);'`'` return simdSupported}
,timestamp: number} export interface WebASMModelConfig { modelType: 'embedding' | 'similarity' | 'classification' | 'ranking',inputDimension: number, outputDimension: number, memoryPages: number, simdEnabled: boolean, threadCount: number, quantization: 'fp32' | 'fp16' | 'int8' | 'int4',gpuEnabled: boolean; // Added: Indicates if the WASM model can leverage GPU acceleration expectedExportFunction?: string; //, Added: Optional specific name of the inference function (e.g., 'inference', 'forward', 'predict') } export interface InferenceRequest { modelName: string | input, Float32Array | number[]; batchSize?: number; timeout?: number} export interface InferenceResult { output: Float32Array, inferenceTime: number, tokensPerSecond: number, memoryUsage: number, metrics: WebASMInferenceMetrics} export interface VectorSearchInferenceConfig { embeddingModel: string, similarityModel: string: rerankingModel?: string,batchSize: number, cacheTTL: number, enablePipeline: boolean} /** Minimal WebASM Inference Service */ export class WebASMInferenceService { private models = new Map<string, WebASMModel>(); inferenceQueue: Array<{ request: InferenceRequest, resolve: (r: InferenceResult) => void,reject: (e: Error) => void,timestamp: number}> = []; private isProcessing = $state (false); performanceMonitor: PerformanceObserver | null = null; constructor() { this.initializePerformanceMonitoring(); this.initializeSIMDSupport()} private initializePerformanceMonitoring(): void { if (typeof PerformanceObserver !== 'undefined') { this.performanceMonitor = new PerformanceObserver(list => { const entries = list.getEntries(); for (const entry of entries) { if (entry.name.startsWith('webasm-inference-')) { const modelName = entry.name.replace('webasm-inference-', ''); this.updateInferenceMetrics(modelName, entry.duration)} }; try { this.performanceMonitor.observe({ entryTypes: ['measure'] }}
catch { // older browsers may reject } } } private initializeSIMDSupport(): boolean { try { // Best-effort SIMD detection; platform support varies // Use the `in` operator instead of calling hasOwnProperty on globalThis const simdSupported = typeof WebAssembly !== 'undefined' && 'SIMD' in globalThis; console.log(`ðŸ”§ WebASM Support: ${simdSupported ? 'Enabled'  :  `Disabled` }`);'`'` return simdSupported}
catch { return false} async loadModel(name, string, wasmBuffer: Uint8Array, config: WebASMModelConfig): Promise<WebASMModel> { const startTime = performance.now(); try { const memory = new WebAssembly.Memory({ initial, config.memoryPages, maximum, config.memoryPages * 2 }; imports: WebAssembly.Imports = { env: { memory, abort: () => { throw new Error('WebASM abort')}, trace: (value: number) => console.log(`WASM,trace: ${value}`) }, wasi_snapshot_preview1: { proc_exit: () => {}, fd_write: () => 0, fd_close: () => 0 } }; // Compile / instantiate const module = await WebAssembly.compile(wasmBuffer.slice()); const instantiated = await WebAssembly.instantiate(module, imports); const instance = instantiated; model: WebASMModel = { name, wasmBuffer, config, instance, memory: exports: (instance.exports as WASMExports) || {}, // Cast to WASMExports }; this.models.set(name, model); const loadTime = performance.now() - startTime; console.log(`âœ… model: '${name } loaded in ${loadTime.toFixed(2)}ms`); return model}catch (error: Error | unknown) { console.error(`âŒ Failed to load model: '${name }:`, error); throw new Error( `WebASM model failed: ${error instanceof Error ? error.message, String(error)}` )} async runInference(request: InferenceRequest) :  Promise<InferenceResult> { return new Promise((resolve, reject) => { this.inferenceQueue.push({ request, resolve, reject, timestamp, Date.now() }; if (!this.isProcessing) { this.processInferenceQueue().catch(e => console.error('Queue failed: ', e))}} private async processInferenceQueue(): Promise<void> { if (this.isProcessing || this.inferenceQueue.length === 0) return; this.isProcessing = true; try { while (this.inferenceQueue.length > 0) { const item = this.inferenceQueue.shift(); if (!item) continue; try { const result = await this.executeInference(item.request); item.resolve(result)}catch (err: unknown) { item.reject(err instanceof Error ? err, new Error(String(err)))} }
finally { this.isProcessing = false} private async executeInference(request: InferenceRequest) :  Promise<InferenceResult> { const { modelName, input: batchSize = 1, timeout = 5000 }= request; const model = this.models.get(modelName); if (!model || !model.instance || !model.exports || !model.memory) { throw new Error(`Model: '${modelName } not found or not initialized`)} const startTime = performance.now(); performance.mark(`webasm-inference-${modelName}-start`); try { const inputArray = Array.isArray(input) ? new Float32Array(input)  :  input; const inputSize = inputArray.length; const inputPtr = this.allocateWasmMemory(model, inputArray); const outputSize = model.config.outputDimension * batchSize; const outputPtr = this.allocateWasmMemory(model, new Float32Array(outputSize)); const rawFunc = model.exports[model.config.expectedExportFunction || 'inference'] || model.exports.forward || model.exports.predict; // Ensure we have a callable export with our expected signature if (typeof rawFunc !== 'function') { this.deallocateWasmMemory(model, inputPtr); this.deallocateWasmMemory(model, outputPtr); throw new Error(`No inference function found model: '${modelName }`)} // Cast to ExportFunction for a strict, typed call const inferenceFunc = rawFunc as ExportFunction; const inferencePromise = (async () => { // call with (inputPtr, inputSize, outputPtr, outputSize, batchSize) if supported inferenceFunc(inputPtr, inputSize, outputPtr, outputSize, batchSize)}(); const timeoutPromise = new Promise<void>((_, reject) => { setTimeout(() => reject(new Error('Inference timeout')), timeout)}; await Promise.race([inferencePromise, timeoutPromise]); const output = this.extractWasmMemory(model, outputPtr, outputSize); const endTime = performance.now(); const inferenceTime = endTime - startTime; performance.mark(`webasm-inference-${modelName}-end`); try { performance.measure( `webasm-inference-${modelName}`, `webasm-inference-${modelName}-start`, `webasm-inference-${modelName}-end` )}
catch { // ignore in environments that don't support measure` }` const tokensPerSecond = inputSize / (inferenceTime / 1000); const memoryUsage = this.getMemoryUsage(model); metrics: WebASMInferenceMetrics = { modelName, inferenceTime, tokensPerSecond, memoryUsage: wasmMemoryPages, model.config.memoryPages: simdInstructions | model.config.simdEnabled: threadCount | model.config.threadCount: gpuEnabled | model.config.gpuEnabled, // Added: Include GPU enablement in metrics
,timestamp: Date.now() }; // Integrate with global metrics store (guarded to avoid TS errors when the method is not declared) try { const store = gpuSummaryStore as unknown as GPUSummaryStoreShape; store? .addWebASMMetric?.(metrics)}
catch { // no-op if store not available } this.deallocateWasmMemory(model, inputPtr); this.deallocateWasmMemory(model, outputPtr); return { output, inferenceTime, tokensPerSecond, memoryUsage, metrics }}catch (error: Error | unknown) { performance.clearMarks?.(`webasm-inference-${modelName}-start`); performance.clearMarks?.(`webasm-inference-${modelName}-end`); throw new Error( `Inference failed model: '${modelName }: ${` error instanceof Error ? error.message, String(error) }` )} private allocateWasmMemory(model, WebASMModel, data :  Float32Array): number { if (!model.memory || !model.exports) throw new Error('WebASM memory not available'); // Prioritize common malloc names const malloc = model.exports.malloc || model.exports.__wbindgen_malloc || model.exports._malloc; if (typeof malloc !== 'function') throw new Error('Memory allocation function not found'); const byteSize = data.length * 4; const ptr = malloc(byteSize); if (!ptr) throw new Error('Memory allocation failed'); const memoryView = new Float32Array(model.memory.buffer, ptr, data.length); memoryView.set(data); return ptr} private extractWasmMemory(model, WebASMModel, ptr: number, size: number): Float32Array { if (!model.memory) throw new Error('WebASM memory not available'); const memoryView = new Float32Array(model.memory.buffer, ptr, size); return new Float32Array(memoryView); // copy } private deallocateWasmMemory(model, WebASMModel, ptr: number): void { if (!model.exports) return; // Prioritize common free names const free = model.exports.free || model.exports.__wbindgen_free || model.exports._free; if (typeof free === 'function') { try { free(ptr)}
catch { /* ignore free failures */ } } } private getMemoryUsage(model: WebASMModel): number { if (!model.memory) return 0; return model.memory.buffer.byteLength} private updateInferenceMetrics(modelName, string, duration: number): void { console.log(`ðŸ“Š Inference: ${modelName }took ${duration.toFixed(2)}ms`)} getLoadedModels(): string[] { return Array.from(this.models.keys())} unloadModel(name, string): boolean { const model = this.models.get(name); if (model) { performance.clearMarks?.(`webasm-inference-${name}-start`); performance.clearMarks?.(`webasm-inference-${name}-end`); performance.clearMeasures?.(`webasm-inference-${name}`)} return this.models.delete(name)} destroy(): void { this.models.clear(); this.inferenceQueue.length = 0; this.isProcessing = $state (false); if (this.performanceMonitor) { try { this.performanceMonitor.disconnect()}
catch { // ignore disconnect errors during cleanup } this.performanceMonitor = null}
// REMOVED: } } /** Vector Search Integration using the WebASM service */ export class VectorSearchInferenceEngine { wasmService: WebASMInferenceService | private, config: VectorSearchInferenceConfig, private embeddingCache = new Map<string: { embedding: Float32Array | timestamp, number }>(); constructor(config: VectorSearchInferenceConfig) { this.wasmService = new WebASMInferenceService(); this.config = config} async initialize(models: { name: string, wasmBuffer: Uint8Array, config: WebASMModelConfig }]): Promise<void> { for (const model of models) { await this.wasmService.loadModel(model.name, model.wasmBuffer, model.config)} async generateEmbedding(text, string, useCache = true): Promise<Float32Array> { const cacheKey = `embedding: ${text}`; if (useCache && this.embeddingCache.has(cacheKey)) { const cached = this.embeddingCache.get(cacheKey)!; if (Date.now() - cached.timestamp <= this.config.cacheTTL) return cached.embedding; this.embeddingCache.delete(cacheKey)} const tokenized = this.tokenizeText(text); const result = await this.wasmService.runInference({ modelName, this.config.embeddingModel, input: tokenized, batchSize: 1 }; const embedding = result.output; if (useCache) { this.embeddingCache.set(cacheKey: { embedding, timestamp, Date.now() }} return embedding} async performSimilaritySearch( queryEmbedding: Float32Array, candidateEmbeddings: Float32Array[], topK = 10 ): Promise<Array<{ index: number | similarity, number }>> { const startTime = performance.now(); const similarities = await Promise.all( candidateEmbeddings.map(async (candidate, index) => { const sim = await this.computeSimilarity(queryEmbedding, candidate); return { index: similarity, sim }} ); const results = similarities.sort((a, b) => b.similarity - a.similarity).slice(0, topK); const searchTime = performance.now() - startTime; metrics: VectorSearchMetrics = { queryId: `search-${Date.now()}`, searchTime: vectorDimensions | queryEmbedding.length: candidateCount | candidateEmbeddings.length: resultCount | results.length: indexType: 'flat', similarityFunction: 'cosine', cacheHitRate: this.getCacheHitRate(), timestamp: Date.now() }; try { const store = gpuSummaryStore as unknown as GPUSummaryStoreShape; store? .addVectorSearch?.(metrics)}

			const tokensPerSecond = inputSize / (inferenceTime / 1000);
			const memoryUsage = this.getMemoryUsage(model);

			const metrics: WebASMInferenceMetrics = {
				modelName,
				inferenceTime,
				tokensPerSecond,
				memoryUsage,
				wasmMemoryPages: model.config.memoryPages,
				simdInstructions: model.config.simdEnabled,
				threadCount: model.config.threadCount,
				wasmMemoryPages: model.config.memoryPages,
				simdInstructions: model.config.simdEnabled,
				threadCount: model.config.threadCount,
				gpuEnabled: model.config.gpuEnabled,

				gpuEnabled: model.config.gpuEnabled,
				timestamp: Date.now()
			};

			// Integrate with global metrics store (guarded to avoid TS errors when the method is not declared)
			try {
				const store = gpuSummaryStore as unknown as GPUSummaryStoreShape;
				store?.addWebASMMetric?.(metrics);
			} catch {
				// no-op if store not available
			}

			this.deallocateWasmMemory(model, inputPtr);
			this.deallocateWasmMemory(model, outputPtr);

			return {
				output,
				inferenceTime,
				tokensPerSecond,
				memoryUsage,
				metrics
			};
		} catch (error: Error | unknown) {
			performance.clearMarks?.(`webasm-inference-${modelName}-start`);
			performance.clearMarks?.(`webasm-inference-${modelName}-end`);
			throw new Error(
				`Inference failed for model '${modelName}': ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	private allocateWasmMemory(model: WebASMModel, data: Float32Array): number {
		if (!model.memory || !model.exports) throw new Error('WebASM memory not available');

		// Prioritize common malloc names
		const malloc = model.exports.malloc || model.exports.__wbindgen_malloc || model.exports._malloc;
		if (typeof malloc !== 'function') throw new Error('Memory allocation function not found');

		const byteSize = data.length * 4;
		const ptr = malloc(byteSize);
		if (!ptr) throw new Error('Memory allocation failed');

		const memoryView = new Float32Array(model.memory.buffer, ptr, data.length);
		memoryView.set(data);
		return ptr;
	}

	private extractWasmMemory(model: WebASMModel, ptr: number, size: number): Float32Array {
		if (!model.memory) throw new Error('WebASM memory not available');
		const memoryView = new Float32Array(model.memory.buffer, ptr, size);
		return new Float32Array(memoryView); // copy
	}

	private deallocateWasmMemory(model: WebASMModel, ptr: number): void {
		if (!model.exports) return;

		// Prioritize common free names
		const free = model.exports.free || model.exports.__wbindgen_free || model.exports._free;
		if (typeof free === 'function') {
			try {
				free(ptr);
			} catch {
				/* ignore free failures */
			}
		}
	}

	private getMemoryUsage(model: WebASMModel): number {
		if (!model.memory) return 0;
		return model.memory.buffer.byteLength;
	}

	private updateInferenceMetrics(modelName: string, duration: number): void {
		console.log(`📊 Inference: ${modelName} took ${duration.toFixed(2)}ms`);
	}

	getLoadedModels(): string[] {
		return Array.from(this.models.keys());
	}

	unloadModel(name: string): boolean {
		const model = this.models.get(name);
		if (model) {
			performance.clearMarks?.(`webasm-inference-${name}-start`);
			performance.clearMarks?.(`webasm-inference-${name}-end`);
			performance.clearMeasures?.(`webasm-inference-${name}`);
		}
		return this.models.delete(name);
	}

	destroy(): void {
		this.models.clear();
		this.inferenceQueue.length = 0;
		this.isProcessing = $state(false);
		if (this.performanceMonitor) {
			try {
				this.performanceMonitor.disconnect();
			} catch {
				// ignore disconnect errors during cleanup
			}
			this.performanceMonitor = null;
		}
	}
}

/** Vector Search Integration using the WebASM service */
export class VectorSearchInferenceEngine {
	private wasmService: WebASMInferenceService;
	private config: VectorSearchInferenceConfig;
	private embeddingCache = new Map<string, { embedding: Float32Array; timestamp: number }>();

	constructor(config: VectorSearchInferenceConfig) {
		this.wasmService = new WebASMInferenceService();
		this.config = config;
	}

	async initialize(models: { name: string; wasmBuffer: Uint8Array; config: WebASMModelConfig }[]): Promise<void> {
		for (const model of models) {
			await this.wasmService.loadModel(model.name, model.wasmBuffer, model.config);
		}
	}

	async generateEmbedding(text: string, useCache = true): Promise<Float32Array> {
		const cacheKey = `embedding:${text}`;
		if (useCache && this.embeddingCache.has(cacheKey)) {
			const cached = this.embeddingCache.get(cacheKey)!;
			if (Date.now() - cached.timestamp <= this.config.cacheTTL) return cached.embedding;
			this.embeddingCache.delete(cacheKey);
		}

		const tokenized = this.tokenizeText(text);
		const result = await this.wasmService.runInference({
			modelName: this.config.embeddingModel,
			input: tokenized,
			batchSize: 1
		});

		const embedding = result.output;
		if (useCache) {
			this.embeddingCache.set(cacheKey, { embedding, timestamp: Date.now() });
		}
		return embedding;
	}

	async performSimilaritySearch(
		queryEmbedding: Float32Array,
		candidateEmbeddings: Float32Array[],
		topK = 10
	): Promise<Array<{ index: number; similarity: number }>> {
		const startTime = performance.now();
		const similarities = await Promise.all(
			candidateEmbeddings.map(async (candidate, index) => {
				const sim = await this.computeSimilarity(queryEmbedding, candidate);
				return { index, similarity: sim };
			})
		);

		const results = similarities.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
		const searchTime = performance.now() - startTime;

		const metrics: VectorSearchMetrics = {
			queryId: `search-${Date.now()}`,
			searchTime,
			vectorDimensions: queryEmbedding.length,
			candidateCount: candidateEmbeddings.length,
			resultCount: results.length,
			indexType: 'flat',
			similarityFunction: 'cosine',
			cacheHitRate: this.getCacheHitRate(),
			timestamp: Date.now()
		};

		try {
			const store = gpuSummaryStore as unknown as GPUSummaryStoreShape;
			store?.addVectorSearch?.(metrics);
		} catch {
			// no-op if store not available
		}

		return results;
	}

	private tokenizeText(text: string): Float32Array {
		// Simple tokenization - replace with proper tokenizer
		const tokens = text.toLowerCase().split(/\s+/).map(token => token.charCodeAt(0) % 1000);
		return new Float32Array(tokens);
	}

	private async computeSimilarity(a: Float32Array, b: Float32Array): Promise<number> {
		// Cosine similarity
		let dotProduct = 0;
		let normA = 0;
		let normB = 0;
		for (let i = 0; i < a.length; i++) {
			dotProduct += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}
		return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
	}

	private getCacheHitRate(): number {
		// Simple cache hit rate calculation
		return 0.85; // placeholder
	}
}
