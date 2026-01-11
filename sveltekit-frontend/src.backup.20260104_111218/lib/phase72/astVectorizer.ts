/**
 * Phase 72: AST Error Vectorization
 *
 * Wrapper for GPU-accelerated error embedding via native addon.
 * Falls back to Ollama embeddinggemma if addon unavailable.
 */

import path from 'node:path';
import fs from 'node:fs';

let nativeAddonAvailable = false;
let ASTVectorizerCtor: null = null;

interface NativeVectorizer {
 loadModel(modelPath: string): boolean;
 generateEmbedding(errorMessage: string): number[];
 generateBatch(errorMessages: string[]): number[][];
 getErrorCount(): number;
 exportErrors(): string;
}

/**
 * Attempt to load the native GPU addon.
 * Returns null if not built or missing dependencies.
 */
function tryLoadNativeAddon(): typeof ASTVectorizerCtor | null {
 if (ASTVectorizerCtor) return ASTVectorizerCtor;

 try {
 const addonPath = path.resolve(process.cwd(), 'build', 'Release', 'ast_error_vectorizer.node');

 if (!fs.existsSync(addonPath)) {
 console.warn(`[Phase72] Native addon not found at ${addonPath}. Using Ollama fallback.`);
 return null;
 }

 // eslint-disable-next-line @typescript-eslint/no-var-requires
 const addon = require(addonPath);

 if (!addon.ASTVectorizer) {
 console.warn('[Phase72] ASTVectorizer export missing from native addon');
 return null;
 }

 console.log('[Phase72] ✅ Native GPU vectorizer loaded successfully');
 ASTVectorizerCtor = addon.ASTVectorizer;
 nativeAddonAvailable = true;
 return ASTVectorizerCtor;
 } catch (error) {
 console.warn('[Phase72] Failed to load native addon:', error);
 return null;
 }
}

/**
 * Create native GPU vectorizer instance (if available).
 *
 * @param modelPath - Path to TorchScript (.pt) model file
 * @returns Vectorizer instance or null if unavailable
 */
export function createNativeVectorizer(modelPath: string): NativeVectorizer | null {
 const Ctor = tryLoadNativeAddon();
 if (!Ctor) return null;

 try {
 const instance = new Ctor();
 const ok = instance.loadModel(modelPath);

 if (!ok) {
 console.warn(`[Phase72] Failed to load model at: ${modelPath}`);
 return null;
 }

 console.log(`[Phase72] ✅ Model loaded: ${modelPath}`);
 return instance as NativeVectorizer;
 } catch (error) {
 console.error('[Phase72] Error creating native vectorizer:', error);
 return null;
 }
}

/**
 * Ollama fallback for embedding generation using embeddinggemma.
 */
async function generateEmbeddingViaOllama(text: string): Promise<number[]> {
 const ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
 const model = process.env.EMBEDDING_MODEL || 'embeddinggemma:latest';

 try {
 const response = await fetch(`${ollamaUrl}/api/embeddings`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ model, prompt: text }),
 });

 if (!response.ok) {
 throw new Error(`Ollama API error: ${response.status}`);
 }

 const data = await response.json();
 return data.embedding || [];
 } catch (error) {
 console.error('[Phase72] Ollama embedding failed:', error);
 return [];
 }
}

/**
 * Unified Phase 72 vectorization interface.
 * Automatically uses GPU addon if available, falls back to Ollama.
 */
export class Phase72Vectorizer {
 private nativeInstance: NativeVectorizer | null = null;
 private readonly useNative: boolean;

 constructor(options: { modelPath?: string; forceOllama?: boolean } = {}) {
 this.useNative = !options.forceOllama;

 if (this.useNative && options.modelPath) {
 this.nativeInstance = createNativeVectorizer(options.modelPath);
 }

 if (!this.nativeInstance) {
 console.log('[Phase72] Using Ollama embeddinggemma (GPU-accelerated if available)');
 }
 }

 /**
 * Generate embedding for a single error message.
 */
 async generateEmbedding(errorMessage: string): Promise<number[]> {
 if (this.nativeInstance) {
 try {
 return this.nativeInstance.generateEmbedding(errorMessage);
 } catch (error) {
 console.warn('[Phase72] Native embedding failed, using Ollama:', error);
 }
 }

 return generateEmbeddingViaOllama(errorMessage);
 }

 /**
 * Generate embeddings for multiple error messages (batch processing).
 */
 async generateBatch(errorMessages: string[]): Promise<number[][]> {
 if (this.nativeInstance) {
 try {
 return this.nativeInstance.generateBatch(errorMessages);
 } catch (error) {
 console.warn('[Phase72] Native batch failed, using Ollama:', error);
 }
 }

 // Fallback: sequential Ollama calls (can be parallelized)
 return Promise.all(errorMessages.map((msg) => this.generateEmbedding(msg)));
 }

 /**
 * Get error count from native addon (0 if using Ollama).
 */
 getErrorCount(): number {
 return this.nativeInstance?.getErrorCount() || 0;
 }

 /**
 * Export error log from native addon (empty string if using Ollama).
 */
 exportErrors(): string {
 return this.nativeInstance?.exportErrors() || '';
 }

 /**
 * Check if native GPU acceleration is active.
 */
 isUsingGPU(): boolean {
 return this.nativeInstance !== null;
 }
}

// Singleton instance (lazy-initialized)
let _defaultVectorizer: null = null;

/**
 * Get default Phase 72 vectorizer instance.
 * Uses GPU addon if available, otherwise Ollama embeddinggemma.
 */
export function getPhase72Vectorizer(): Phase72Vectorizer {
 if (!_defaultVectorizer) {
 // Try to load model from standard location (optional)
 const modelPath =
 process.env.PHASE72_MODEL_PATH ||
 path.join(process.cwd(), 'static', 'models', 'bert_error_encoder.pt');

 _defaultVectorizer = new Phase72Vectorizer({
 modelPath: fs.existsSync(modelPath) ? modelPath  | undefined,
 });
 }

 return _defaultVectorizer;
}

/**
 * Quick utility: vectorize a single error message.
 */
export async function vectorizeError(errorMessage: string): Promise<number[]> {
 return getPhase72Vectorizer().generateEmbedding(errorMessage);
}

/**
 * Quick utility: vectorize multiple error messages.
 */
export async function vectorizeErrors(errorMessages: string[]): Promise<number[][]> {
 return getPhase72Vectorizer().generateBatch(errorMessages);
}
