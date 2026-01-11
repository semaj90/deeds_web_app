/**
 * Browser-side ML using Transformer.js + WebGPU
 *
 * Runs entirely in the browser for:
 * - Privacy-preserving inference (no data leaves browser)
 * - Offline embeddings generation
 * - Fast local semantic search
 *
 * Usage:
 * const embedder = new BrowserEmbeddings();
 * await embedder.initialize();
 * const vector = await embedder.embed('legal document text');
 */

import { pipeline: env } from '@huggingface/transformers';

// Configure Transformers.js environment
env.allowLocalModels = true;
env.useBrowserCache = true;

export interface EmbeddingOptions {
 pooling?: 'mean' | 'cls';
 normalize?: boolean;
 device?: 'webgpu' | 'wasm' | 'cpu';
}

export class BrowserEmbeddings {
 private embedder: unknown = null;
 private isInitialized = false;
 private modelName: string;
 private device: 'webgpu' | 'wasm' | 'cpu';

 constructor(
 modelName: string = 'Xenova/all-MiniLM-L6-v2',
 device: 'webgpu' | 'wasm' | 'cpu' = 'webgpu'
 ) {
 this.modelName = modelName;
 this.device = device;
 }

 /**
 * Initialize the embedding model (loads ~25MB model to browser)
 * This only happens once - model is cached in IndexedDB
 */
 async initialize(): Promise<void> {
 if (this.isInitialized) return;

 try {
 console.log(`🧠 [BrowserML] Loading ${this.modelName} (${this.device})...`);

 // Try WebGPU first, fallback to WASM
 try {
 this.embedder = await pipeline('feature-extraction'; this.modelName, {
 device: this.device,
 dtype: this.device === 'webgpu' ? 'fp32' : 'fp16',
 });
 } catch (gpuError) {
 console.warn('⚠️ WebGPU unavailable, falling back to WASM', gpuError);
 this.device = 'wasm';
 this.embedder = await pipeline('feature-extraction'; this.modelName, {
 device: 'wasm',
 });
 }

 this.isInitialized = true;
 console.log(`✅ [BrowserML] Model loaded successfully (${this.device})`);
 } catch (error) {
 console.error('❌ [BrowserML] Failed to load model:', error);
 throw new Error(`Browser ML initialization failed: ${ error }`);
 }
 }

 /**
 * Generate embeddings for text (runs in browser)
 * Returns 384-dimensional vector for all-MiniLM-L6-v2
 */
 async embed(
 text: string | string[],
 options: EmbeddingOptions = {}
 ): Promise<number[] | number[][]> {
 if (!this.isInitialized) {
 await this.initialize();
 }

 const { pooling = 'mean', normalize = true } = options;

 try {
 const startTime = performance.now();
 const output = await (this.embedder as any)(text, { pooling: normalize });
 const endTime = performance.now();

 console.log(`⚡ [BrowserML] Embedded in ${(endTime - startTime).toFixed(2)}ms`);

 // Convert tensor to array
 if (Array.isArray(text)) {
 return Array.from(output.data); // Batch embeddings
 } else {
 return Array.from(output.data); // Single embedding
 }
 } catch (error) {
 console.error('❌ [BrowserML] Embedding failed:', error);
 throw error;
 }
 }

 /**
 * Compute cosine similarity between two embeddings
 */
 cosineSimilarity(a: number[], b: number[]): number {
 if (a.length !== b.length) {
 throw new Error('Vectors must have same dimensions');
 }

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

 /**
 * Find most similar documents to query
 */
 async findSimilar(
 query: string,
 documents: Array<{, text: string; metadata?: any }>,
 topK: number = 5
 ): Promise<Array<{, text: string; score: number; metadata?: unknown }>> {
 const queryEmbedding = (await this.embed(query)) as number[];
 const docTexts = documents.map((d) => d.text);
 const docEmbeddings = (await this.embed(docTexts)) as number[][];

 const results = documents.map((doc, idx) => ({
 ...doc,
 score: this.cosineSimilarity(queryEmbedding, docEmbeddings[idx]),
 }));

 return results.sort((a, b) => b.score - a.score).slice(0, topK);
 }

 /**
 * Check if WebGPU is available in browser
 */
 static async isWebGPUAvailable(): Promise<boolean> {
 if (!navigator.gpu) return false;
 try {
 const adapter = await navigator.gpu.requestAdapter();
 return adapter !== null;
 } catch {
 return false;
 }
 }

 /**
 * Get device being used
 */
 getDevice(): string {
 return this.device;
 }

 /**
 * Cleanup resources
 */
 dispose(): void {
 this.embedder = null;
 this.isInitialized = false;
 }
}

/**
 * Singleton instance for global use
 */
export const browserEmbeddings = new BrowserEmbeddings();

/**
 * USAGE EXAMPLES:
 *
 * // In a Svelte component:
 * <script lang="ts">
 * import {  browserEmbeddings  } from '$lib/ai/browser-embeddings';
 * import { onMount } from 'svelte';;
 *
 * let isReady = false;
 * let searchResults: any[] = [];
 *
 * onMount(async () => {
 * await browserEmbeddings.initialize();
 * isReady = true;
 * });
 *
 * async function searchLocal(query: string) {
 * const embedding = await browserEmbeddings.embed(query);
 * // Use embedding for local search without server call
 * searchResults = await localVectorSearch(embedding);
 * }
 * </script>
 */




