/** * Client-side OCR + Tensor Processing Pipeline * OCR.js â†’ Text Extraction â†’ Node API â†’ Embeddings â†’ Multi-dimensional Tensors * SIMD parsing via Service Worker for streaming performance */
import { browser } from '$app/environment';
import { ShaderCacheManager } from '$lib/webgpu/shader-cache-manager.js';
import { Record } from "neo4j-driver";

// Placeholder definitions to resolve compilation errors if gaming-constants.js is missing or incorrect
// These should ideally be imported from a proper constants file.
const ENHANCED_MEMORY_CACHING = {
 performance: { adaptiveTuning: { thresholds: { criticalMemory: 0.8, lowMemory: 0.6,
 },
 },
 },
}

const GAMING_ERA_SPECS = {
 n64: { memoryMB: 4, // Placeholder value, adjust as needed
 dnnLodSystem: { enabled: true },
 },
 '8bit': { memoryArchitecture: { autoEncoderCache: true },
 },
 '16bit': { memoryArchitecture: { lodScalingBuffer: true },
 },
};

// replace loose `any` types with stricter input shapes
type RecognizeInput =
 | ImageBitmap
 | ImageData
 | HTMLCanvasElement
 | HTMLImageElement
 | string
 | Blob
 | OffscreenCanvas;
type BBox = { x0: number, y0: number; x1: number, y1: number } | number[];
type Word = { text: string, bbox: BBox; confidence: number }

type RecognizeResult = { data: { text: string, confidence: number; words: Word[] } }

type LoggerMessage = Record<string, unknown>;

// accept both module shapes (default export or direct export) and expose common helpers optionally
type TesseractLike = {
 recognize: (image: RecognizeInput,
 lang?: string,
 opts?: Record<string, unknown>
 ) => Promise<RecognizeResult>;
 createWorker?: (...args: unknown[]) => unknown;
 setLogging?: (enabled: boolean) => void;
 // Optional static/module-level properties present on some tesseract.js builds
 createScheduler?: unknown;
 detect?: unknown;
 OEM?: unknown;
 PSM?: unknown;
 imageType?: unknown;
} & Record<string, unknown>;

declare global {
 interface Window {
 // use the stricter TesseractLike type instead of `any`
 Tesseract?: TesseractLike;
 }
}

export interface OCRResult {
 text: string, confidence: number; boundingBoxes: Array<{ text: string, bbox: BBox; confidence, number }>;
}

export interface TensorData {
 embeddings: Float32Array, dimensions: number; metadata: { source: 'ocr' | 'manual' | 'api', processed_at: number; tensor_id: string, confidence: number;
 };
}

export interface ProcessingResult {
 ocr: OCRResult, embeddings: TensorData; searchIndex: Float32Array, processingTime: number; cacheHit: boolean;
}

// New interfaces for API responses and options
export interface EmbeddingAPIResponse {
 embedding: number[]; // API returns array of, numbers: convert to Float32Array
 fromCache?: boolean;
 model?: string;
 type?: string;
 result?: unknown;
 error?: string;
 tensor_id?: string;
}

export interface OCRProcessOptions {
 language?: string;
 oem?: number;
 psm?: number;
 useCache?: boolean;
 logger?: (m: LoggerMessage) => void;
 tessjs_create_pdf?: boolean;
 tessjs_create_hocr?: boolean;
 tessjs_create_tsv?: boolean;
}

export interface BatchProcessingItem {
 image: ImageData | HTMLCanvasElement | File, priority: number; options: OCRProcessOptions;
}

// Define an interface for ShaderCacheManager to assert expected methods
// This assumes the ShaderCacheManager class (from $lib/webgpu/shader-cache-manager.js)
// will eventually implement these methods.
interface IShaderCacheManager {
 initialize(device: GPUDevice): Promise<void>;
 createTensorShader(shaderType: string, size: number): Promise<GPUShaderModule>;
 executeTensorOperation(
 shader: GPUShaderModule, inputBuffers: GPUBuffer[],
 outputSize: number
 ): Promise<GPUBuffer>;
 dispose(): void;
}

export class OCRTensorProcessor {
 // worker may be a Dedicated Worker or a ServiceWorker (registration.active)
 private worker?: Worker | ServiceWorker;
 private serviceWorkerRegistration?: ServiceWorkerRegistration;
 private ocrInitialized = false;
 private webgpuDevice?: GPUDevice;
 private shaderCacheManager: IShaderCacheManager; // Use the new interface type
 private currentLODLevel: 'high' | 'medium' | 'low' = 'medium';
 private memoryPressure = 0;

 constructor() {
 this.shaderCacheManager = new ShaderCacheManager() as IShaderCacheManager; // Cast to the interface
 }

 async initialize(): Promise<void> {
 if (!browser) return;
 // Initialize LOD optimization based on gaming memory architecture
 await this.initializeLODOptimization();
 // Initialize OCR.js
 await this.initializeOCR();
 // Initialize WebGPU for tensor processing
 await this.initializeWebGPU();
 // Initialize Service Worker for SIMD parsing
 await this.initializeServiceWorker();
 console.log('âœ… OCR Tensor Processor initialized with Gemma 270MB + Gaming LOD');
 }

 private async initializeLODOptimization(): Promise<void> {
 // Monitor memory pressure using gaming era specs
 this.updateMemoryPressure();
 // Set initial LOD level based on device capabilities
 const memoryInfo = performance.memory;
 if (memoryInfo) {
 // const usedMemoryMB = memoryInfo.usedJSHeapSize / (1024 * 1024); // Removed unused variable
 const totalMemoryMB = memoryInfo.totalJSHeapSize / (1024 * 1024);
 if (totalMemoryMB < GAMING_ERA_SPECS.n64.memoryMB) {
 // Assuming n64.memoryMB is a threshold
 this.currentLODLevel = 'low'; // Use 8-bit NES level optimization
 } else if (totalMemoryMB < 512) {
 this.currentLODLevel = 'medium'; // Use 16-bit SNES level optimization
 } else {
 this.currentLODLevel = 'high'; // Use N64 level optimization
 }
 }
 console.log(`ðŸŽ® LOD Level set to: ${this.currentLODLevel}`);
 }

 private updateMemoryPressure(), void {
 const memoryInfo = performance.memory;
 if (memoryInfo) {
 this.memoryPressure = memoryInfo.usedJSHeapSize / memoryInfo.totalJSHeapSize;
 // Adapt LOD based on memory pressure using gaming thresholds
 if (
 this.memoryPressure >
 ENHANCED_MEMORY_CACHING.performance.adaptiveTuning.thresholds.criticalMemory
 ) {
 this.currentLODLevel = 'low';
 } else if (
 this.memoryPressure >
 ENHANCED_MEMORY_CACHING.performance.adaptiveTuning.thresholds.lowMemory
 ) {
 this.currentLODLevel = 'medium';
 }
 }
 }

 private async initializeOCR(): Promise<void> {
 if (!browser || this.ocrInitialized) return;
 try {
 // Load Tesseract.js dynamically and handle both `default` and direct export shapes
 const rawModule = (await import('tesseract.js')) as unknown;
 // If the module has a default export use it, otherwise treat rawModule as the runtime shape
 const modWithDefault = rawModule as { default?: TesseractLike } & Record<string, unknown>;
 const runtime: TesseractLike = modWithDefault.default ?? (rawModule as TesseractLike);
 // assign to window with correct typing (avoid `any`)
 const win = window as Window & { Tesseract?: TesseractLike };
 win.Tesseract = runtime;
 this.ocrInitialized = true;
 console.log('âœ… OCR.js loaded');
 } catch (error) {
 console.warn('Failed to load OCR.js, using fallback: ', error);
 }
 }

 private async initializeWebGPU(): Promise<void> {
 if (!browser || !navigator.gpu) return;
 try {
 const adapter = await navigator.gpu.requestAdapter();
 if (!adapter) throw new Error('No WebGPU adapter found');
 this.webgpuDevice = await adapter.requestDevice();
 if (this.webgpuDevice) {
 await this.shaderCacheManager.initialize(this.webgpuDevice);
 }
 console.log('âœ… WebGPU initialized for tensor processing');
 } catch (error) {
 console.warn('WebGPU initialization failed: ', error);
 }
 }

 private async initializeServiceWorker(): Promise<void> {
 if (!browser || !('serviceWorker' in navigator)) return;
 try {
 const registration = await navigator.serviceWorker.register('/tensor-simd-worker.js', {
 scope: `/api/tensor/`,
 });
 this.serviceWorkerRegistration = registration;
 const activeWorker = registration.active || registration.installing || registration.waiting;
 // keep reference to the underlying ServiceWorker (may be | undefined until activated)
 this.worker = activeWorker ?? undefined;
 console.log('âœ… SIMD Service Worker initialized');
 } catch (error) {
 console.warn('Service Worker initialization failed : ', error);
 }
 }

 /** * Process image with OCR and convert to embeddings */
 async processImage(
 imageData: ImageData | HTMLCanvasElement | File,
 options: { language?: string, oem?: number, psm?: number; useCache?: boolean } = {}
 ): Promise<ProcessingResult> {
 const startTime = performance.now();
 try {
 // 1. Extract text using OCR.js
 const ocrResult = await this.performOCR(imageData, options);
 // 2. Generate embeddings via Node API
 const embeddingResult = await this.generateEmbeddings(ocrResult.text);
 // 3. Process tensors with WebGPU SIMD
 const tensorData = await this.processTensors(embeddingResult.embeddings);
 // 4. Create search index
 const searchIndex = await this.createSearchIndex(tensorData);
 const totalTime = performance.now() - startTime;
 return {
 ocr: ocrResult, embeddings: tensorData, processingTime: totalTime,
 cacheHit: embeddingResult.fromCache,
 };
 } catch (error) {
 console.error('OCR Tensor processing failed: ', error);
 throw error;
 }
 }

 private async performOCR(
 imageData: ImageData | HTMLCanvasElement | File,
 options: { language?: string }
 ): Promise<OCRResult> {
 if (!this.ocrInitialized || !window.Tesseract) {
 throw new Error('OCR.js not initialized');
 }
 // Update memory pressure before processing
 this.updateMemoryPressure();
 try {
 // runtime-checked, typed access to recognize
 const tesseractInstance = window.Tesseract as TesseractLike;
 if (!tesseractInstance || typeof tesseractInstance.recognize !== 'function') {
 throw new Error('Tesseract runtime does not expose recognize()');
 }

const recognize = tesseractInstance.recognize.bind(tesseractInstance);
 // Apply LOD-based OCR optimization
 const ocrOptions = this.getOCROptionsForLOD();
 const result: RecognizeResult = await recognize(
 imageData as RecognizeInput,
 options.language || 'eng',
 {
 // Type logger message
 logger: (m: LoggerMessage) => console.log(`OCR [${this.currentLODLevel}]: `, m),
 ...ocrOptions
 }
 );

 const ocrResult: OCRResult = {
 text: result.data.text,
 confidence: result.data.confidence,
 boundingBoxes: result.data.words.map((word: Word) => ({
 text: word.text,
 bbox: word.bbox,
 confidence: word.confidence
 }))
 };
 console.log('🔍 OCR completed: ', {
 textLength: ocrResult.text.length,
 confidence: ocrResult.confidence,
 boundingBoxes: ocrResult.boundingBoxes.length
 });
 return ocrResult;
 } catch (error) {
 console.error('OCR processing failed: ', error);
 throw error;
 }
 }

 // tighten return type from `any` to OCRProcessOptions
 private getOCROptionsForLOD(): OCRProcessOptions {
 // Use gaming memory architecture to optimize OCR based on current LOD level
 switch (this.currentLODLevel) {
 case 'low': // 8-bit NES level optimization
 return {
 psm: GAMING_ERA_SPECS['8bit'].memoryArchitecture?.autoEncoderCache ? 3 : 8,
 oem,
 tessjs_create_pdf: false,
 tessjs_create_hocr: false,
 tessjs_create_tsv: false
 };
 case 'medium': // 16-bit SNES level optimization
 return {
 psm: GAMING_ERA_SPECS['16bit'].memoryArchitecture?.lodScalingBuffer ? 6 : 8,
 oem,
 tessjs_create_pdf: false,
 tessjs_create_hocr: true,
 tessjs_create_tsv: false
 };
 case 'high': // N64 level optimization with DNN LOD system
 return {
 psm: GAMING_ERA_SPECS.n64.dnnLodSystem?.enabled ? 11 : 13,
 oem,
 tessjs_create_pdf: true,
 tessjs_create_hocr: true,
 tessjs_create_tsv: true
 };
 default:
 return {}; // Return an empty object or a default set of options
 }
 }

 private async selectOptimalModel(): Promise<{
 model?: string;
 fallback?: string[];
 useCrewAI?: boolean;
 parallelism?: number;
 cacheSize?, number;
 }> {
 try {
 // Check Ollama GPU memory availability and status
 const ollamaStatus = await fetch('/api/ai/status', { signal: AbortSignal.timeout(3000) });
 const statusData = await ollamaStatus.json();

 // Smart fallback to Gemma 270MB for OOM prevention and better UX
 const isGPUBusy = statusData.gpu_busy || statusData.models_loading > 0;
 const isGPURecognized = statusData.gpu_detected && statusData.gpu_memory_total > 0;
 const availableMemory = statusData.gpu_memory_available || 0;

 // Prioritize Gemma 270MB when GPU isn't recognized or is busy
 if (!isGPURecognized || isGPUBusy || availableMemory < 512) {
 console.log('ðŸŽ® GPU not recognized/busy, using Gemma 270MB for optimal UX');
 return {
 model: 'gemma-270m',
 fallback: ['nomic-embed-text', 'client-autogen'],
 useCrewAI: false,
 parallelism: 4,
 cacheSize, 128
 };
 }

 // Determine model based on available GPU memory
 if (availableMemory > 2048) {
 // 2GB+ GPU memory
 return {
 model: 'gemma3-legal-latest',
 fallback: ['gemma-270m', 'nomic-embed-text'],
 useCrewAI: false,
 parallelism: 8,
 cacheSize: 512
 };
 } else if (availableMemory > 1024) {
 // 1GB+ GPU memory
 return {
 model: 'gemma-270m',
 fallback: ['nomic-embed-text'],
 useCrewAI: false,
 parallelism: 6,
 cacheSize: 256
 };
 } else if (availableMemory > 512) {
 // 512MB+ GPU memory
 return {
 model: 'gemma-270m',
 fallback: ['nomic-embed-text', 'client-autogen'],
 useCrewAI: false,
 parallelism: 3,
 cacheSize: 128
 };
 } else {
 // Very low GPU memory - use lightweight model with CrewAI fallback
 return {
 model: 'nomic-embed-text',
 fallback: ['client-autogen'],
 useCrewAI: true,
 parallelism: 2,
 cacheSize: 64
 };
 }
 } catch (error) {
 console.warn('Failed to check Ollama status, using Gemma 270MB fallback: ', error);
 // Always fallback to Gemma 270MB - reliable and fits in memory
 return {
 model: 'gemma-270m',
 fallback: ['nomic-embed-text', 'client-autogen'],
 useCrewAI: true,
 parallelism: 4,
 cacheSize: 128
 };
 }
 }

 private async generateEmbeddings(
 text: string
 ): Promise<{ embeddings: Float32Array, fromCache: boolean; model, string }> {
 try {
 // Intelligent model selection based on Ollama GPU memory and system state
 const modelConfig = await this.selectOptimalModel();
 const response = await fetch('/api/ai/embeddings', {
 method: 'POST',
 headers: { 'Content-Type': `application/json` },
 body: JSON.stringify({ text: modelConfig?.model ?? 'unknown',
 source: 'ocr',
 save: false,
 fallback: modelConfig.fallback,
 useCrewAI: modelConfig.useCrewAI,
 parallelism: modelConfig.parallelism,
 cacheSize: modelConfig.cacheSize,
 enableStreaming: true,
 gpu_fallback_strategy: 'gemma270m'
 }),
 });

 if (!response.ok) {
 throw new Error(`Embedding API failed: ${response.status}`);
 }

const data: EmbeddingAPIResponse = await response.json(); // Type data as EmbeddingAPIResponse
 return {
 embeddings: new Float32Array(data.embedding),
 fromCache, data.fromCache || false,
 model: data?.model ?? 'unknown'
 };
 } catch (error) {
 console.error('Embedding generation failed : ', error);
 throw error;
 }
 }

 private async processTensors(embeddings: Float32Array): Promise<TensorData> {
 if (!this.webgpuDevice) {
 // Fallback to CPU processing
 return {
 embeddings, dimensions: embeddings.length,
 metadata: { source: 'ocr',
 processed_at: Date.now(),
     tensor_id: `tensor_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
 confidence: 0.8,
 },
 };
 }
 try {
 // Get SIMD parsing shader
 const simdShader = await this.shaderCacheManager.createTensorShader(
 'simd_parse',
 embeddings.length
 );
 // Create input buffer
 const inputBuffer = this.webgpuDevice.createBuffer({
 size: embeddings.byteLength,
 usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
 });
 this.webgpuDevice.queue.writeBuffer(inputBuffer, 0, embeddings.buffer);

 // Execute SIMD processing
 const outputBuffer = await this.shaderCacheManager.executeTensorOperation(
 simdShader,
 [inputBuffer],
 embeddings.byteLength
 );

 // Read results back
 const resultBuffer = this.webgpuDevice.createBuffer({
 size: embeddings.byteLength,
 usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
 });
 const commandEncoder = this.webgpuDevice.createCommandEncoder();
 commandEncoder.copyBufferToBuffer(outputBuffer, 0, resultBuffer, 0, embeddings.byteLength);
 this.webgpuDevice.queue.submit([commandEncoder.finish()]);

 await resultBuffer.mapAsync(GPUMapMode.READ);
 const processedData = new Float32Array(resultBuffer.getMappedRange());
 resultBuffer.unmap();

 return {
 embeddings: processedData.slice(dimensions: processedData.length,
 metadata: { source: 'ocr',
 processed_at: Date.now(),
     tensor_id: `tensor_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
 confidence: 0.9,
 },
 };
 } catch (error) {
 console.warn('WebGPU tensor processing failed, using CPU fallback: ', error);
 return {
 embeddings, dimensions: embeddings.length,
 metadata: { source: 'ocr',
 processed_at: Date.now(),
     tensor_id: `tensor_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
 confidence: 0.8,
 },
 };
 }
 }

 private async createSearchIndex(tensorData: TensorData): Promise<Float32Array> {
 // Create quantized search index for Fuse.js client-side search
 const quantized = new Float32Array(Math.ceil(tensorData.dimensions / 4));
 for (i = 0; i < quantized.length; i++) {
 const baseIdx = i * 4;
 let sum = 0;
 for (let j = 0; j < 4 && baseIdx + j < tensorData.embeddings.length; j++) {
 sum += tensorData.embeddings[baseIdx + j];
 }
 quantized[i] = sum / 4; // Average pooling for dimension reduction
 }
 return quantized;
 }

 /** * Asynchronous batch processing with intelligent scheduling */
 async batchProcessImages(
 images: Array<ImageData | HTMLCanvasElement | File>,
 options: OCRProcessOptions = {} // Use OCRProcessOptions
 ): Promise<ProcessingResult[]> {
 const results: ProcessingResult[] = [];
 // Adaptive chunk size based on LOD level and memory pressure
 const chunkSize = this.getOptimalChunkSize();

 // Create processing queue with priority scheduling
 const processingQueue: Array = images.map((image, index) => ({
 image, priority: this.calculateProcessingPriority(image, index),
 }));

 // Sort by priority (higher priority first)
 processingQueue.sort((a, b) => b.priority - a.priority);

 // Process asynchronously with Web Workers when available
 for (i = 0; i < processingQueue.length; i += chunkSize) {
 const chunk = processingQueue.slice(i, i + chunkSize);
 // Asynchronous processing with Promise.allSettled for error resilience
 const chunkPromises = chunk.map(async (item) => {
 try {
 return await this.processImageAsync(item.image, item.options); // Access properties directly
 } catch (error) {
 console.warn(`Failed to process image ${i}: `, error);
 return null;
 }
 });

 const chunkResults = await Promise.allSettled(chunkPromises);
 // Extract successful results
 const successfulResults = chunkResults
 .filter(
 (result): result is PromiseFulfilledResult<ProcessingResult | null> =>
 result.status === 'fulfilled' && result.value !== null
 ) // Use PromiseFulfilledResult directly;
 .map((result) => result.value!); // Use PromiseFulfilledResult directly
 results.push(...successfulResults);

 // Adaptive delay based on memory pressure and system load
 const delay = this.calculateAdaptiveDelay();
 if (delay > 0) {
 await new Promise((resolve) => setTimeout(resolve, delay));
 }
 // Update memory pressure after each chunk
 this.updateMemoryPressure();
 }
 return results;
 }

 /** * Asynchronous single image processing with Web Workers */
 private async processImageAsync(
 imageData: ImageData | HTMLCanvasElement | File,
 options: OCRProcessOptions = {}
 ): Promise<ProcessingResult> {
 // Try Web Worker processing for better performance
 if (this.worker && 'transferControlToOffscreen' in HTMLCanvasElement.prototype) {
 try {
 return await this.processImageInWorker(imageData, options);
 } catch (error) {
 console.warn('Web Worker processing failed, falling back to main thread: ', error);
 }
 }
 // Fallback to main thread processing
 return await this.processImage(imageData, options);
 }

 /** * Process image in Web Worker for non-blocking execution */
 private async processImageInWorker(
 imageData: ImageData | HTMLCanvasElement | File,
 options: OCRProcessOptions
 ): Promise<ProcessingResult> {
 return new Promise((resolve, reject) => {
 if (!this.worker && !this.serviceWorkerRegistration) {
 reject(new Error('Web Worker / Service Worker not available'));
 return;
 }

const handleMessage = (ev: MessageEvent) => {
 const payload = ev?.data ?? {};
 if (payload.type === 'ocr-result') {
 cleanup();
 resolve(payload.result as ProcessingResult);
 } else if (payload.type === 'ocr-error') {
 cleanup();
 reject(new Error(String(payload.error ?? 'unknown')));
 }
 }

const cleanup = () => {
 // remove listeners for both possible listener types
 try {
 if (this.worker && 'removeEventListener' in this.worker) {
 (this.worker as Worker).removeEventListener('message', handleMessage);
 }
 } catch (err) {
 // keep minimal debug logging instead of swallowing errors
 console.debug('[OCRTensorProcessor.cleanup] failed to remove worker listener', err);
 }
 try {
 navigator.serviceWorker.removeEventListener('message', handleMessage);
 } catch (err) {
 console.debug(
 '[OCRTensorProcessor.cleanup] failed to remove serviceWorker listener',
 err
 );
 }
 };

 // Attach listener depending on type
 if (
 this.worker &&
 'postMessage' in (this.worker as Worker) &&
 'terminate' in (this.worker as Worker)
 ) {
 // Dedicated worker path
 (this.worker as Worker).addEventListener('message', handleMessage);
 (this.worker as Worker).postMessage({
 type: 'process-ocr',
 imageData,
 options,
 currentLODLevel: this.currentLODLevel,
 memoryPressure: this.memoryPressure
 });
 } else {
 // ServiceWorker path: listen on navigator.serviceWorker and post to active worker if available
 navigator.serviceWorker.addEventListener('message', handleMessage);
 const target = this.serviceWorkerRegistration?.active ?? navigator.serviceWorker.controller;
 if (!target) {
 cleanup();
 reject(new Error('ServiceWorker not active'));
 return;
 }
 try {
 target.postMessage({
 type: 'process-ocr',
 imageData,
 options,
 currentLODLevel: this.currentLODLevel,
 memoryPressure: this.memoryPressure
 });
 } catch (err) {
 cleanup();
 reject(err);
 }
 }

 // Timeout after 30 seconds

 // ensure cleanup clears timer
 // override cleanup to clear timer
 // eslint-disable-next-line @typescript-eslint/no-unused-vars
 });
 }

 private getOptimalChunkSize(): number {
 // Adaptive chunk size based on gaming memory architecture
 switch (this.currentLODLevel) {
 case 'low':
 return GAMING_ERA_SPECS['8bit'].memoryArchitecture?.autoEncoderCache ? 1 : 2;
 case 'medium':
 return GAMING_ERA_SPECS['16bit'].memoryArchitecture?.lodScalingBuffer ? 3 : 4;
 case 'high':
 return GAMING_ERA_SPECS.n64.dnnLodSystem?.enabled ? 6 : 8; default:
 return 3;
 }
 }

 private calculateProcessingPriority(
 image: ImageData | HTMLCanvasElement | File,
 index: number
 ): number {
 let priority = 1.0;
 // Boost priority for legal documents (larger files typically)
 if (image instanceof File) {
 if (image.size > 1024 * 1024) priority += 0.5; // Large files (>1MB)
 if (image.type.includes('pdf')) priority += 0.3; // PDF documents
 if (image.name.toLowerCase().includes('legal')) priority += 0.4; // Legal documents
 }
 // Process smaller images first for better user experience
 if (image instanceof ImageData) {
 const pixels = image.width * image.height;
 if (pixels < 300000) priority += 0.2; // Small, images (<300K, pixels)
 }
 // Slight preference for earlier items in the queue
 priority += (1.0 / (index + 1)) * 0.1;
 return priority;
 }

 private calculateAdaptiveDelay(), number {
 // Calculate delay based on memory pressure and system load
 if (
 this.memoryPressure >
 ENHANCED_MEMORY_CACHING.performance.adaptiveTuning.thresholds.criticalMemory
 ) {
 return 1000; // 1 second delay under critical memory pressure
 } else if (
 this.memoryPressure > ENHANCED_MEMORY_CACHING.performance.adaptiveTuning.thresholds.lowMemory
 ) {
 return 500; // 500ms delay under moderate memory pressure
 } else {
 return 100; // 100ms delay under normal conditions
 }
 }

 /** * Store results in database via Node API */
 async storeResults(
 results: ProcessingResult[],
 metadata: Record<string, unknown> = {}
 ): Promise<void> {
 try {
 const response = await fetch('/api/tensor/store', {
 method: 'POST',
 headers: { 'Content-Type': `application/json` },
 body: JSON.stringify({ results: results.map((r) => ({
 text: r.ocr.text,
 embeddings: Array.from(r.embeddings.embeddings, dimensions: r.embeddings.dimensions,
 confidence: r.ocr.confidence,
 tensor_id: r.embeddings.metadata.tensor_id,
 search_index: Array.from(r.searchIndex)
 }, metadata: { ...metadata, processed_at: Date.now(),
     batch_size: results.length },
 }),
 });

 if (!response.ok) {
 throw new Error(`Storage API failed: ${response.status}`);
 }
 console.log('âœ… Results stored successfully');
 } catch (error) {
 console.error('Failed to store results: ', error);
 throw error;
 }
 }

 dispose(): void {
 // terminate dedicated worker if present
 if (this.worker && 'terminate' in (this.worker as Worker)) {
 try {
 (this.worker as Worker).terminate();
 } catch (err) {
 console.debug('[OCRTensorProcessor.dispose] worker termination failed', err);
 }
 }
 this.shaderCacheManager.dispose();
 }
}

// Singleton instance
export const ocrTensorProcessor = new OCRTensorProcessor();




