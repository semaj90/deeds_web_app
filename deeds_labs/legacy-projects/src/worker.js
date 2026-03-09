// src/worker.js
import { parentPort } from 'worker_threads';
import { performance } from 'perf_hooks';
// import { GPU } from 'gpu.js'; // Commented out to avoid native module issues
import initWasm from './wasm/simd_ops.js';

let wasm = null;
let gpu = null; // Disabled for now
let sharedBuffers = new Map();

async function loadEngines() {
  if (!wasm) {
    wasm = await initWasm();
    console.log('✅ Worker initialized with WebAssembly SIMD');
  }
  // GPU disabled to avoid native module issues
  // if (process.env.USE_GPU === 'true' && GPU.isGPUSupported) {
  //   gpu = new GPU({ mode: 'gpu' });
  //   console.log('⚡ GPU.js acceleration enabled');
  // }
}
await loadEngines();

function wasmDot(a, b) {
  const n = a.length;
  const bytes = n * 4;
  const ptrA = wasm._malloc(bytes);
  const ptrB = wasm._malloc(bytes);
  wasm.HEAPF32.set(a, ptrA / 4);
  wasm.HEAPF32.set(b, ptrB / 4);
  const result = wasm._vector_dot_product(ptrA, ptrB, n);
  wasm._free(ptrA);
  wasm._free(ptrB);
  return result;
}

function gpuDot(a, b) {
  const kernel = gpu.createKernel(function(x, y) {
    return x[this.thread.x] * y[this.thread.x];
  }).setOutput([a.length]);
  const partial = kernel(a, b);
  return partial.reduce((acc, v) => acc + v, 0);
}

// Shared memory operations
function searchSharedIndex(indexName, queryEmbedding, topK) {
  const buffer = sharedBuffers.get(indexName);
  if (!buffer) {
    throw new Error(`Shared index '${indexName}' not found`);
  }

  const embeddings = new Float32Array(buffer);
  const vectorSize = 384; // Assuming 384d embeddings
  const numVectors = embeddings.length / vectorSize;

  const results = [];

  for (let i = 0; i < numVectors; i++) {
    const start = i * vectorSize;
    const vector = embeddings.slice(start, start + vectorSize);
    const similarity = wasmDot(queryEmbedding, vector);
    results.push({ index: i, similarity });
  }

  // Sort by similarity (descending) and return top K
  return results
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

// Piscina handler function
const handler = async function({ id, type, data }) {
  const start = performance.now();

  try {
    let result;

    switch (type) {
      case 'init':
        // Worker initialization
        result = { initialized: true, gpu: !!gpu, wasm: !!wasm };
        break;

      case 'init_shared_index':
        // Initialize shared memory index
        sharedBuffers.set(data.name, data.buffer);
        result = { initialized: true, name: data.name };
        break;

      case 'dot_product':
        const arrA = new Float32Array(data.a);
        const arrB = new Float32Array(data.b);
        if (gpu) {
          result = gpuDot(Array.from(arrA), Array.from(arrB));
        } else {
          result = wasmDot(arrA, arrB);
        }
        break;

      case 'search_index':
        const queryEmbedding = new Float32Array(data.queryEmbedding);
        result = searchSharedIndex(data.indexName, queryEmbedding, data.topK);
        break;

      case 'process_embeddings':
        // Process batch of embeddings
        const embeddings = data.embeddings.map(emb => new Float32Array(emb));
        result = embeddings.map(emb => ({
          norm: Math.sqrt(wasmDot(emb, emb)),
          processed: true
        }));
        break;

      default:
        throw new Error(`Unknown task type: ${type}`);
    }

    const elapsed = performance.now() - start;
    return { id, result, elapsed, success: true };

  } catch (error) {
    const elapsed = performance.now() - start;
    return {
      id,
      error: error instanceof Error ? error.message : String(error),
      elapsed,
      success: false
    };
  }
}

// Legacy worker_threads support (for compatibility)
if (parentPort) {
  parentPort.on('message', async (message) => {
    const result = await handler(message);
    parentPort?.postMessage(result);
  });
}

export default handler;