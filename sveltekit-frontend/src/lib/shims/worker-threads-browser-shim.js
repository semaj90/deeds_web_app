/**
 * Browser shim for Node.js worker_threads module.
 * Required by onnxruntime-web's Emscripten-generated WASM loaders
 * which unconditionally attempt `import('worker_threads')` at module level.
 */
export const Worker = undefined;
export const workerData = undefined;
export const parentPort = null;
export const isMainThread = true;
export const threadId = 0;