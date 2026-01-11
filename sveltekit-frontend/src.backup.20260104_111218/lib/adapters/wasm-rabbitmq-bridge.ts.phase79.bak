/** * WASM-RabbitMQ Bridge Adapter * Connects RabbitMQ message processing with WebAssembly vector operations * Enables high-performance tensor processing within RabbitMQ workflows */

import type { RabbitMQServiceWorker } from '$lib/workers/rabbitmq-service-worker.js';
import type { MessageHandler } from '$lib/server/messaging/rabbitmq-service';
import type { enhanceRabbitMQMessage } from '$lib/simd/simd-json-integration.js';

// WebAssembly module cache
let wasmModule: WebAssembly.WebAssemblyInstantiatedSource | null = null;
let wasmReady = $state<boolean>(false);

/** * Initialize WebAssembly module for RabbitMQ operations */
export async function initializeWASMBridge(): Promise<boolean> {
 try {
 console.log('🚀 Initializing WASM-RabbitMQ Bridge...');
 // Load our compiled vector operations WASM
 const wasmResponse = await fetch('/wasm/vector-ops.wasm');
 const wasmBytes = await wasmResponse.arrayBuffer();
 wasmModule = await WebAssembly.instantiate(wasmBytes);
 wasmReady = true;
 console.log('✅ WASM-RabbitMQ Bridge initialized successfully');
 return true;
 } catch (error) {
 console.error('❌ Failed to initialize WASM-RabbitMQ Bridge: ', error);
 wasmReady = false;
 return false;
 }
}

/** * WASM-accelerated message handler wrapper * Provides WASM vector operations to RabbitMQ message handlers */
export function createWASMHandler(
 baseHandler: MessageHandler,
 wasmOperations?: {
 vectorSimilarity?: boolean;
 batchNormalization?: boolean;
 tensorCompression?: boolean;
 }
): (message: unknown, originalMessage: unknown) => Promise<void> {
 return async (message: unknown, originalMessage: unknown) => {
 const startTime = performance.now();
 try {
 // First, enhance message with SIMD JSON parsing for nested JSON fields
 const simdEnhancedMessage = enhanceRabbitMQMessage(message);

 // Check if message requires WASM acceleration
 if (shouldUseWASM(simdEnhancedMessage) && wasmReady && wasmModule) {
 console.log(
 `🚀 SIMD+WASM-accelerating message: ${(simdEnhancedMessage as any)?.type || 'unknown'}`
 );
 // Enhance message with WASM capabilities
 const enhancedMessage = await enhanceMessageWithWASM(simdEnhancedMessage, wasmOperations);
 // Process with WASM-enhanced context
 await baseHandler(enhancedMessage, originalMessage);
 const processingTime = performance.now() - startTime;
 console.log(`✅ WASM-accelerated processing completed in ${processingTime.toFixed(2)}ms`);
 return;
 } else {
 // Fallback to regular processing
 await baseHandler(message, originalMessage);
 return;
 }
 } catch (error) {
 console.error('❌ WASM-accelerated handler error: ', error);
 // Fallback to base handler on WASM errors
 await baseHandler(message, originalMessage);
 return;
 }
 };
}

/** * Determine if a message should use WASM acceleration */
function shouldUseWASM(message: any): boolean {
 // Check for vector operations, embeddings, or tensor data
 const wasmIndicators = [
 'embeddings',
 'vectors',
 'similarity',
 'tensor',
 'vector-embedding',
 'cuda-acceleration',
 'batch-processing',
 ];
 const messageStr = JSON.stringify(message).toLowerCase();
 return wasmIndicators.some(
 (indicator) =>
 messageStr.includes(indicator) ||
 message.type?.includes(indicator) ||
 message.stage?.includes('embedding') ||
 message.cudaAccelerated === true
 );
}

/** * Enhance message with WASM computational capabilities */
async function enhanceMessageWithWASM(
 message: unknown,
 operations?: {
 vectorSimilarity?: boolean;
 batchNormalization?: boolean;
 tensorCompression?: boolean;
 }
): Promise<any> {
 if (!wasmModule || !wasmReady) return message;
 const enhanced = { ...(message as any) };
 const wasmMemory = wasmModule.instance.exports.memory as WebAssembly.Memory;
 const floatView = new Float32Array(wasmMemory.buffer);
 try {
 // Process embeddings with WASM normalization
 if ((enhanced as any).embeddings && Array.isArray((enhanced as any).embeddings)) {
 console.log('🔧 Normalizing embeddings with WASM...');
 const embeddings = new Float32Array((enhanced as any).embeddings);
 const length = embeddings.length;
 // Allocate WASM memory
 const inputPtr = (wasmModule.instance.exports.__new as Function)(length * 4, 0);
 // Copy data to WASM
 floatView.set(embeddings, inputPtr / 4);
 // Normalize using WASM
 const normalizedPtr = (wasmModule.instance.exports.normalizeVector as Function)(
 inputPtr,
 length
 );
 // Create a view of the normalized data directly from WASM memory
 const normalizedEmbeddings = new Float32Array(wasmMemory.buffer, normalizedPtr, length);
 (enhanced as any).embeddings = Array.from(normalizedEmbeddings);
 (enhanced as any)._wasmProcessed = true;
 (enhanced as any)._wasmOperations = ['normalization'];
 // Cleanup WASM memory
 (wasmModule.instance.exports.__unpin as Function)(inputPtr);
 (wasmModule.instance.exports.__unpin as Function)(normalizedPtr);
 }

 // Process batch vectors
 if ((enhanced as any).batchVectors && Array.isArray((enhanced as any).batchVectors)) {
 console.log('🔧 Batch processing vectors with WASM...');
 const numVectors = (enhanced as any).batchVectors.length;
 const vectorLength = (enhanced as any).batchVectors[0]?.length || 0;
 if (numVectors > 0 && vectorLength > 0) {
 // Allocate memory for all vectors
 const vectorsPtr = (wasmModule.instance.exports.__new as Function)(
 numVectors * vectorLength * 4,
 0
 );
 const vectorsBuffer = new Float32Array(
 wasmMemory.buffer,
 vectorsPtr,
 numVectors * vectorLength
 );
 // Copy all vectors to WASM
 for (let v = 0; v < numVectors; v++) {
 const vector = new Float32Array((enhanced as any).batchVectors[v]);
 vectorsBuffer.set(vector, v * vectorLength);
 }
 // Batch normalize
 const normalizedPtr = (wasmModule.instance.exports.batchNormalizeVectors as Function)(
 vectorsPtr,
 numVectors,
 vectorLength
 );
 const normalizedVectorsBuffer = new Float32Array(
 wasmMemory.buffer,
 normalizedPtr,
 numVectors * vectorLength
 );
 // Copy normalized vectors back
 const normalizedVectors = [];
 for (let v = 0; v < numVectors; v++) {
 normalizedVectors.push(
 Array.from(normalizedVectorsBuffer.slice(v * vectorLength, (v + 1) * vectorLength))
 );
 }
 (enhanced as any).batchVectors = normalizedVectors;
 (enhanced as any)._wasmBatchProcessed = true;
 // Cleanup
 (wasmModule.instance.exports.__unpin as Function)(vectorsPtr);
 (wasmModule.instance.exports.__unpin as Function)(normalizedPtr);
 }
 }

 // Add WASM processing metadata
 (enhanced as any)._wasmAccelerated = true;
 (enhanced as any)._wasmTimestamp = Date.now();
 return enhanced;
 } catch (error) {
 console.error('❌ WASM enhancement failed: ', error);
 return message; // Return original on error
 }
}

/** * Vector similarity computation for RabbitMQ jobs */
export async function computeVectorSimilarityWASM(
 queryVector: number[],
 targetVectors: number[][],
 algorithm: 'cosine' | 'euclidean' | 'dot' | 'manhattan' = 'cosine'
): Promise<number[]> {
 if (!wasmModule || !wasmReady) {
 throw new Error('WASM module not ready for similarity computation');
 }
 const wasmMemory = wasmModule.instance.exports.memory as WebAssembly.Memory;
 const floatView = new Float32Array(wasmMemory.buffer);
 const queryVec = new Float32Array(queryVector);
 const vectorDim = queryVec.length;
 const vectorCount = targetVectors.length;
 // Algorithm mapping
 const algorithmMap = { cosine: 0, euclidean: 1, dot: 2, manhattan: 3 };
 try {
 // Allocate WASM memory
 const queryPtr = (wasmModule.instance.exports.__new as Function)(vectorDim * 4, 0);
 const vectorsPtr = (wasmModule.instance.exports.__new as Function)(
 vectorCount * vectorDim * 4,
 0
 );
 const resultsPtr = (wasmModule.instance.exports.__new as Function)(vectorCount * 4, 0);
 // Copy query vector
 floatView.set(queryVec, queryPtr / 4);
 // Copy target vectors
 for (let v = 0; v < vectorCount; v++) {
 const vector = new Float32Array(targetVectors[v]);
 floatView.set(vector, (vectorsPtr + v * vectorDim * 4) / 4);
 }
 // Compute similarities using WASM
 (wasmModule.instance.exports.computeBatchSimilarity as Function)(
 queryPtr,
 vectorsPtr,
 resultsPtr,
 vectorDim,
 vectorCount,
 algorithmMap[algorithm]
 );
 // Extract results
 const similarities = Array.from(new Float32Array(wasmMemory.buffer, resultsPtr, vectorCount));
 // Cleanup
 (wasmModule.instance.exports.__unpin as Function)(queryPtr);
 (wasmModule.instance.exports.__unpin as Function)(vectorsPtr);
 (wasmModule.instance.exports.__unpin as Function)(resultsPtr);
 return similarities;
 } catch (error) {
 console.error('❌ WASM similarity computation failed: ', error);
 throw error;
 }
}

/** * Register WASM-accelerated handlers with RabbitMQ worker */
export function registerWASMAcceleratedHandlers(worker: RabbitMQServiceWorker): void {
 console.log('🚀 Registering WASM-accelerated RabbitMQ handlers...');

 // WASM Vector Embedding Handler
 const vectorEmbeddingHandler = createWASMHandler(
 async (message: any) => {
 console.log(`🔨 WASM-accelerated embedding generation: ${message.documentId}`);
 // The message is already enhanced with normalized embeddings
 if (message._wasmProcessed) {
 console.log('✅ Embeddings processed with WASM normalization');
 // Store in vector database (simulated)
 await new Promise((resolve) => setTimeout(resolve, 100));
 // Publish to next stage
 await worker.publishMessage('legal.chunks.store', {
 ...message,
 embeddings: message.embeddings,
 wasmAccelerated: true,
 stage: 'ready_for_storage',
 });
 }
 },
 { batchNormalization: true }
 );
 worker.registerHandler('legal.chunks.embed', vectorEmbeddingHandler);

 // WASM Similarity Search Handler
 const similarityHandler = createWASMHandler(
 async (message: any) => {
 console.log(`🔍 WASM-accelerated similarity search: ${message.queryId || 'unknown'}`);
 if (message.queryVector && message.candidateVectors) {
 const similarities = await computeVectorSimilarityWASM(
 message.queryVector,
 message.candidateVectors,
 message.algorithm || 'cosine'
 );
 await worker.publishMessage('legal.search.results', {
 ...message,
 similarities,
 wasmAccelerated: true,
 processingTime: performance.now() - (message.timestamp || 0),
 });
 }
 },
 { vectorSimilarity: true }
 );
 worker.registerHandler('legal.similarity.compute', similarityHandler);

 console.log('✅ WASM-accelerated handlers registered');
}

/** * Bridge status and health check */
export function getBridgeStatus() {
 return {
 wasmReady,
 wasmModuleLoaded: wasmModule !== null,
 timestamp: Date.now(),
 capabilities: wasmReady
 ? ['vector_normalization', 'batch_processing', 'similarity_computation', 'tensor_operations']
 : [],
 };
}
