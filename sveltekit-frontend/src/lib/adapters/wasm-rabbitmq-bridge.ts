/**
 * WASM-RabbitMQ Bridge Adapter
 * Connects RabbitMQ message processing with WebAssembly vector operations
 * Enables high-performance tensor processing within RabbitMQ workflows
 */

import type { RabbitMQServiceWorker } from '$lib/workers/rabbitmq-service-worker.js';
import type { MessageHandler } from '$lib/server/messaging/rabbitmq-service';
import { enhanceRabbitMQMessage } from '$lib/simd/simd-json-integration.js';

// WebAssembly module cache
let wasmModule: WebAssembly.WebAssemblyInstantiatedSource | null = null;
let wasmReady = $state<boolean>(false);

/**
 * Initialize WebAssembly module for RabbitMQ operations
 */
export async function initializeWASMBridge(): Promise<boolean> {
  try {
    console.log('🚀 Initializing WASM-RabbitMQ Bridge...');
    const wasmResponse = await fetch('/wasm/vector-ops.wasm');
    const wasmBytes = await wasmResponse.arrayBuffer();
    wasmModule = await WebAssembly.instantiate(wasmBytes);
    wasmReady = true;
    console.log('✅ WASM-RabbitMQ Bridge initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Failed to initialize WASM-RabbitMQ Bridge:', error);
    wasmReady = false;
    return false;
  }
}

/**
 * WASM-accelerated message handler wrapper
 */
export function createWASMHandler(
  baseHandler: MessageHandler,
  wasmOperations?: {
    vectorSimilarity?: boolean;
    batchNormalization?: boolean;
    tensorCompression?: boolean;
  }
): (message: unknown) => Promise<void> {
  return async (message: unknown): Promise<void> => {
    const startTime = performance.now();
    try {
      const simdEnhancedMessage = enhanceRabbitMQMessage(message);

      if (shouldUseWASM(simdEnhancedMessage) && wasmReady && wasmModule) {
        console.log(
          `🚀 SIMD+WASM-accelerating message: ${(simdEnhancedMessage as Record<string, unknown>)?.type ?? 'unknown'}`
        );
        const enhancedMessage = await enhanceMessageWithWASM(simdEnhancedMessage, wasmOperations);
        await baseHandler(enhancedMessage, message);
        const processingTime = performance.now() - startTime;
        console.log(`✅ WASM-accelerated processing completed in ${processingTime.toFixed(2)}ms`);
      } else {
        await baseHandler(message, message);
      }
    } catch (error) {
      console.error('❌ WASM-accelerated handler error:', error);
      await baseHandler(message, message);
    }
  };
}


/**
 * Determine if a message should use WASM acceleration
 */
function shouldUseWASM(message: unknown): boolean {
  const wasmIndicators = [
    'embeddings',
    'vectors',
    'similarity',
    'tensor',
    'vector-embedding',
    'cuda-acceleration',
    'batch-processing'];
  const messageStr = JSON.stringify(message).toLowerCase();
  const msgRecord = message as Record<string, unknown>;
  return wasmIndicators.some(
    (indicator) =>
      messageStr.includes(indicator) ||
      (typeof msgRecord?.type === 'string' && msgRecord.type.includes(indicator)) ?? (typeof msgRecord?.stage === 'string' && msgRecord.stage.includes('embedding')) ?? msgRecord?.cudaAccelerated === true
  );
}

/**
 * Enhance message with WASM computational capabilities
 */
async function enhanceMessageWithWASM(
  message: unknown,
  operations?: {
    vectorSimilarity?: boolean;
    batchNormalization?: boolean;
    tensorCompression?: boolean;
  }
): Promise<Record<string, unknown>> {
  if (!wasmModule || !wasmReady) return message as Record<string, unknown>;

  const enhanced = { ...(message as Record<string, unknown>) };
  const wasmMemory = wasmModule.instance.exports.memory as WebAssembly.Memory;
  const floatView = new Float32Array(wasmMemory.buffer);

  try {
    if (enhanced.embeddings && Array.isArray(enhanced.embeddings)) {
      console.log('🔧 Normalizing embeddings with WASM...');
      const embeddings = new Float32Array(enhanced.embeddings as number[]);
      const length = embeddings.length;

      const inputPtr = (wasmModule.instance.exports.__new as (size: number, id: number) => number)(length * 4, 0);
      floatView.set(embeddings, inputPtr / 4);

      const normalizedPtr = (wasmModule.instance.exports.normalizeVector as (ptr: number, len: number) => number)(
        inputPtr,
        length
      );

      const normalizedEmbeddings = new Float32Array(wasmMemory.buffer, normalizedPtr, length);
      enhanced.embeddings = Array.from(normalizedEmbeddings);
      enhanced._wasmProcessed = true;
      enhanced._wasmOperations = ['normalization'];

      (wasmModule.instance.exports.__unpin as (ptr: number) => void)(inputPtr);
      (wasmModule.instance.exports.__unpin as (ptr: number) => void)(normalizedPtr);
    }

    enhanced._wasmAccelerated = true;
    enhanced._wasmTimestamp = Date.now();
    return enhanced;
  } catch (error) {
    console.error('❌ WASM enhancement failed:', error);
    return message as Record<string, unknown>;
  }
}


/**
 * Vector similarity computation for RabbitMQ jobs
 */
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

  const algorithmMap: Record<string, number> = { cosine: 0, euclidean: 1, dot: 2, manhattan: 3 };

  try {
    const queryPtr = (wasmModule.instance.exports.__new as (size: number, id: number) => number)(vectorDim * 4, 0);
    const vectorsPtr = (wasmModule.instance.exports.__new as (size: number, id: number) => number)(
      vectorCount * vectorDim * 4,
      0
    );
    const resultsPtr = (wasmModule.instance.exports.__new as (size: number, id: number) => number)(vectorCount * 4, 0);

    floatView.set(queryVec, queryPtr / 4);

    for (let v = 0; v < vectorCount; v++) {
      const vector = new Float32Array(targetVectors[v]);
      floatView.set(vector, (vectorsPtr + v * vectorDim * 4) / 4);
    }

    (wasmModule.instance.exports.computeBatchSimilarity as (
      q: number, v: number, r: number, dim: number, count: number, algo, number
    ) => void)(
      queryPtr,
      vectorsPtr,
      resultsPtr,
      vectorDim,
      vectorCount,
      algorithmMap[algorithm]
    );

    const similarities = Array.from(new Float32Array(wasmMemory.buffer, resultsPtr, vectorCount));

    (wasmModule.instance.exports.__unpin as (ptr: number) => void)(queryPtr);
    (wasmModule.instance.exports.__unpin as (ptr: number) => void)(vectorsPtr);
    (wasmModule.instance.exports.__unpin as (ptr: number) => void)(resultsPtr);

    return similarities;
  } catch (error) {
    console.error('❌ WASM similarity computation failed:', error);
    throw error;
  }
}

/**
 * Register WASM-accelerated handlers with RabbitMQ worker
 */
export function registerWASMAcceleratedHandlers(worker: RabbitMQServiceWorker): void {
  console.log('🚀 Registering WASM-accelerated RabbitMQ handlers...');

  const vectorEmbeddingHandler = createWASMHandler(
    async (message: unknown) => {
      const msg = message as Record<string, unknown>;
      console.log(`🔨 WASM-accelerated embedding generation: ${msg.documentId}`);
      if (msg._wasmProcessed) {
        console.log('✅ Embeddings processed with WASM normalization');
        await new Promise((resolve) => setTimeout(resolve, 100));
        await worker.publishMessage('legal.chunks.store', {
          ...msg,
          stage: 'ready_for_storage',
        });
      }
    },
    { batchNormalization: true }
  );
  worker.registerHandler('legal.chunks.embed', vectorEmbeddingHandler);

  const similarityHandler = createWASMHandler(
    async (message: unknown) => {
      const msg = message as Record<string, unknown>;
      console.log(`🔍 WASM-accelerated similarity search: ${msg.queryId || 'unknown'}`);
      if (msg.queryVector && msg.candidateVectors) {
        const similarities = await computeVectorSimilarityWASM(
          msg.queryVector as number[],
          msg.candidateVectors as number[][],
          (msg.algorithm as 'cosine' | 'euclidean' | 'dot' | 'manhattan') || 'cosine'
        );
        await worker.publishMessage('legal.search.results', {
          ...msg,
          similarities,
          wasmAccelerated: true,
          processingTime: performance.now() - ((msg.timestamp as number) || 0),
        });
      }
    },
    { vectorSimilarity: true }
  );
  worker.registerHandler('legal.similarity.compute', similarityHandler);

  console.log('✅ WASM-accelerated handlers registered');
}

/**
 * Bridge status and health check
 */
export function getBridgeStatus(): { wasmReady: boolean; wasmModuleLoaded: boolean; timestamp: number; capabilities: string[];
} {
  return {
    wasmReady,
    wasmModuleLoaded: wasmModule !== null,
    timestamp: Date.now(),
    capabilities: wasmReady
      ? ['vector_normalization', 'batch_processing', 'similarity_computation', 'tensor_operations']
      : [],
  };
}




