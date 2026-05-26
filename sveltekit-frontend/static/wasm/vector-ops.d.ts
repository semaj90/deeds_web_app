/** Exported memory */
export declare const memory: WebAssembly.Memory;
// Exported runtime interface
export declare function __new(size: number, id: number): number;
export declare function __pin(ptr: number): number;
export declare function __unpin(ptr: number): void;
export declare function __collect(): void;
export declare const __rtti_base: number;
/**
 * sveltekit-frontend/src/wasm/vector-operations/cosineSimilarity
 * @param aPtr `usize`
 * @param bPtr `usize`
 * @param length `i32`
 * @returns `f32`
 */
export declare function cosineSimilarity(aPtr: number, bPtr: number, length: number): number;
/**
 * sveltekit-frontend/src/wasm/vector-operations/euclideanDistance
 * @param aPtr `usize`
 * @param bPtr `usize`
 * @param length `i32`
 * @returns `f32`
 */
export declare function euclideanDistance(aPtr: number, bPtr: number, length: number): number;
/**
 * sveltekit-frontend/src/wasm/vector-operations/dotProduct
 * @param aPtr `usize`
 * @param bPtr `usize`
 * @param length `i32`
 * @returns `f32`
 */
export declare function dotProduct(aPtr: number, bPtr: number, length: number): number;
/**
 * sveltekit-frontend/src/wasm/vector-operations/manhattanDistance
 * @param aPtr `usize`
 * @param bPtr `usize`
 * @param length `i32`
 * @returns `f32`
 */
export declare function manhattanDistance(aPtr: number, bPtr: number, length: number): number;
/**
 * sveltekit-frontend/src/wasm/vector-operations/normalize
 * @param vectorPtr `usize`
 * @param length `i32`
 */
export declare function normalize(vectorPtr: number, length: number): void;
/**
 * sveltekit-frontend/src/wasm/vector-operations/zScoreNormalize
 * @param vectorPtr `usize`
 * @param length `i32`
 */
export declare function zScoreNormalize(vectorPtr: number, length: number): void;
/**
 * sveltekit-frontend/src/wasm/vector-operations/computeBatchSimilarity
 * @param queryPtr `usize`
 * @param vectorsPtr `usize`
 * @param resultsPtr `usize`
 * @param vectorDim `i32`
 * @param vectorCount `i32`
 * @param algorithm `i32`
 */
export declare function computeBatchSimilarity(queryPtr: number, vectorsPtr: number, resultsPtr: number, vectorDim: number, vectorCount: number, algorithm: number): void;
/**
 * sveltekit-frontend/src/wasm/vector-operations/batchNormalizeVectors
 * @param vectorsPtr `usize`
 * @param numVectors `i32`
 * @param vectorLength `i32`
 */
export declare function batchNormalizeVectors(vectorsPtr: number, numVectors: number, vectorLength: number): void;
/**
 * sveltekit-frontend/src/wasm/vector-operations/hashEmbedding
 * @param textPtr `usize`
 * @param textLen `i32`
 * @param embeddingPtr `usize`
 * @param embeddingDim `i32`
 */
export declare function hashEmbedding(textPtr: number, textLen: number, embeddingPtr: number, embeddingDim: number): void;
/**
 * sveltekit-frontend/src/wasm/vector-operations/allocateVectorMemory
 * @param length `i32`
 * @returns `usize`
 */
export declare function allocateVectorMemory(length: number): number;
/**
 * sveltekit-frontend/src/wasm/vector-operations/freeVectorMemory
 * @param ptr `usize`
 */
export declare function freeVectorMemory(ptr: number): void;
/**
 * sveltekit-frontend/src/wasm/vector-operations/dotProductSIMD
 * @param aPtr `usize`
 * @param bPtr `usize`
 * @param length `i32`
 * @returns `f32`
 */
export declare function dotProductSIMD(aPtr: number, bPtr: number, length: number): number;
/**
 * sveltekit-frontend/src/wasm/vector-operations/cosineSimilaritySIMD
 * @param aPtr `usize`
 * @param bPtr `usize`
 * @param length `i32`
 * @returns `f32`
 */
export declare function cosineSimilaritySIMD(aPtr: number, bPtr: number, length: number): number;
/**
 * sveltekit-frontend/src/wasm/vector-operations/prepareVectorForServer
 * @param vectorPtr `usize`
 * @param length `i32`
 */
export declare function prepareVectorForServer(vectorPtr: number, length: number): void;
/**
 * sveltekit-frontend/src/wasm/vector-operations/processServerResponse
 * @param responsePtr `usize`
 * @param resultPtr `usize`
 * @param length `i32`
 */
export declare function processServerResponse(responsePtr: number, resultPtr: number, length: number): void;
/**
 * sveltekit-frontend/src/wasm/vector-operations/hybridCosineSimilarity
 * @param aPtr `usize`
 * @param bPtr `usize`
 * @param length `usize`
 * @param useServer `bool`
 * @returns `f32`
 */
export declare function hybridCosineSimilarity(aPtr: number, bPtr: number, length: number, useServer: boolean): number;
/**
 * sveltekit-frontend/src/wasm/vector-operations/batchVectorChunking
 * @param vectorsPtr `usize`
 * @param numVectors `i32`
 * @param vectorLength `i32`
 * @param chunkSize `i32`
 * @param resultsPtr `usize`
 * @returns `usize`
 */
export declare function batchVectorChunking(vectorsPtr: number, numVectors: number, vectorLength: number, chunkSize: number, resultsPtr: number): number;
/**
 * sveltekit-frontend/src/wasm/vector-operations/prepareTensorForCUDA
 * @param tensorPtr `usize`
 * @param dimensions `~lib/array/Array<i32>`
 * @param dimCount `i32`
 * @param outputPtr `usize`
 */
export declare function prepareTensorForCUDA(tensorPtr: number, dimensions: Array<number>, dimCount: number, outputPtr: number): void;
/**
 * sveltekit-frontend/src/wasm/vector-operations/optimizedEmbeddingTransfer
 * @param embeddingPtr `usize`
 * @param length `i32`
 * @param compressionLevel `i32`
 * @returns `usize`
 */
export declare function optimizedEmbeddingTransfer(embeddingPtr: number, length: number, compressionLevel: number): number;
/**
 * sveltekit-frontend/src/wasm/vector-operations/shouldUseServer
 * @param operationType `i32`
 * @param dataSize `i32`
 * @param complexityScore `i32`
 * @returns `bool`
 */
export declare function shouldUseServer(operationType: number, dataSize: number, complexityScore: number): boolean;
/**
 * sveltekit-frontend/src/wasm/vector-operations/cosineSimJS
 * @param aPtr `usize`
 * @param bPtr `usize`
 * @param length `i32`
 * @returns `f32`
 */
export declare function cosineSimJS(aPtr: number, bPtr: number, length: number): number;
/**
 * sveltekit-frontend/src/wasm/vector-operations/dotProductJS
 * @param aPtr `usize`
 * @param bPtr `usize`
 * @param length `i32`
 * @returns `f32`
 */
export declare function dotProductJS(aPtr: number, bPtr: number, length: number): number;
/**
 * sveltekit-frontend/src/wasm/vector-operations/cosineSimSIMDJS
 * @param aPtr `usize`
 * @param bPtr `usize`
 * @param length `i32`
 * @returns `f32`
 */
export declare function cosineSimSIMDJS(aPtr: number, bPtr: number, length: number): number;
/**
 * sveltekit-frontend/src/wasm/vector-operations/getMemoryStats
 * @returns `i32`
 */
export declare function getMemoryStats(): number;
/**
 * sveltekit-frontend/src/wasm/vector-operations/benchmarkOperation
 * @param operation `i32`
 * @param dataSize `i32`
 * @returns `i32`
 */
export declare function benchmarkOperation(operation: number, dataSize: number): number;
