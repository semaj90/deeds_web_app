async function instantiate(module, imports = {}) {
  const adaptedImports = {
    env: Object.setPrototypeOf({
      abort(message, fileName, lineNumber, columnNumber) {
        // ~lib/builtins/abort(~lib/string/String | null?, ~lib/string/String | null?, u32?, u32?) => void
        message = __liftString(message >>> 0);
        fileName = __liftString(fileName >>> 0);
        lineNumber = lineNumber >>> 0;
        columnNumber = columnNumber >>> 0;
        (() => {
          // @external.js
          throw Error(`${message} in ${fileName}:${lineNumber}:${columnNumber}`);
        })();
      },
    }, Object.assign(Object.create(globalThis), imports.env || {})),
  };
  const { exports } = await WebAssembly.instantiate(module, adaptedImports);
  const memory = exports.memory || imports.env.memory;
  const adaptedExports = Object.setPrototypeOf({
    allocateVectorMemory(length) {
      // sveltekit-frontend/src/wasm/vector-operations/allocateVectorMemory(i32) => usize
      return exports.allocateVectorMemory(length) >>> 0;
    },
    hybridCosineSimilarity(aPtr, bPtr, length, useServer) {
      // sveltekit-frontend/src/wasm/vector-operations/hybridCosineSimilarity(usize, usize, usize, bool) => f32
      useServer = useServer ? 1 : 0;
      return exports.hybridCosineSimilarity(aPtr, bPtr, length, useServer);
    },
    batchVectorChunking(vectorsPtr, numVectors, vectorLength, chunkSize, resultsPtr) {
      // sveltekit-frontend/src/wasm/vector-operations/batchVectorChunking(usize, i32, i32, i32, usize) => usize
      return exports.batchVectorChunking(vectorsPtr, numVectors, vectorLength, chunkSize, resultsPtr) >>> 0;
    },
    prepareTensorForCUDA(tensorPtr, dimensions, dimCount, outputPtr) {
      // sveltekit-frontend/src/wasm/vector-operations/prepareTensorForCUDA(usize, ~lib/array/Array<i32>, i32, usize) => void
      dimensions = __lowerArray(__setU32, 4, 2, dimensions) || __notnull();
      exports.prepareTensorForCUDA(tensorPtr, dimensions, dimCount, outputPtr);
    },
    optimizedEmbeddingTransfer(embeddingPtr, length, compressionLevel) {
      // sveltekit-frontend/src/wasm/vector-operations/optimizedEmbeddingTransfer(usize, i32, i32) => usize
      return exports.optimizedEmbeddingTransfer(embeddingPtr, length, compressionLevel) >>> 0;
    },
    shouldUseServer(operationType, dataSize, complexityScore) {
      // sveltekit-frontend/src/wasm/vector-operations/shouldUseServer(i32, i32, i32) => bool
      return exports.shouldUseServer(operationType, dataSize, complexityScore) != 0;
    },
  }, exports);
  function __liftString(pointer) {
    if (!pointer) return null;
    const
      end = pointer + new Uint32Array(memory.buffer)[pointer - 4 >>> 2] >>> 1,
      memoryU16 = new Uint16Array(memory.buffer);
    let
      start = pointer >>> 1,
      string = "";
    while (end - start > 1024) string += String.fromCharCode(...memoryU16.subarray(start, start += 1024));
    return string + String.fromCharCode(...memoryU16.subarray(start, end));
  }
  function __lowerArray(lowerElement, id, align, values) {
    if (values == null) return 0;
    const
      length = values.length,
      buffer = exports.__pin(exports.__new(length << align, 1)) >>> 0,
      header = exports.__pin(exports.__new(16, id)) >>> 0;
    __setU32(header + 0, buffer);
    __dataview.setUint32(header + 4, buffer, true);
    __dataview.setUint32(header + 8, length << align, true);
    __dataview.setUint32(header + 12, length, true);
    for (let i = 0; i < length; ++i) lowerElement(buffer + (i << align >>> 0), values[i]);
    exports.__unpin(buffer);
    exports.__unpin(header);
    return header;
  }
  function __notnull() {
    throw TypeError("value must not be null");
  }
  let __dataview = new DataView(memory.buffer);
  function __setU32(pointer, value) {
    try {
      __dataview.setUint32(pointer, value, true);
    } catch {
      __dataview = new DataView(memory.buffer);
      __dataview.setUint32(pointer, value, true);
    }
  }
  return adaptedExports;
}
export const {
  memory,
  __new,
  __pin,
  __unpin,
  __collect,
  __rtti_base,
  cosineSimilarity,
  euclideanDistance,
  dotProduct,
  manhattanDistance,
  normalize,
  zScoreNormalize,
  computeBatchSimilarity,
  batchNormalizeVectors,
  hashEmbedding,
  allocateVectorMemory,
  freeVectorMemory,
  dotProductSIMD,
  cosineSimilaritySIMD,
  prepareVectorForServer,
  processServerResponse,
  hybridCosineSimilarity,
  batchVectorChunking,
  prepareTensorForCUDA,
  optimizedEmbeddingTransfer,
  shouldUseServer,
  cosineSimJS,
  dotProductJS,
  cosineSimSIMDJS,
  getMemoryStats,
  benchmarkOperation,
} = await (async url => instantiate(
  await (async () => {
    const isNodeOrBun = typeof process != "undefined" && process.versions != null && (process.versions.node != null || process.versions.bun != null);
    if (isNodeOrBun) { return globalThis.WebAssembly.compile(await (await import("node:fs/promises")).readFile(url)); }
    else { return await globalThis.WebAssembly.compileStreaming(globalThis.fetch(url)); }
  })(), {
  }
))(new URL("vector-ops.wasm", import.meta.url));
