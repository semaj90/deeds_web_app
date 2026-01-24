/**
 * Embedding Generation Service
 * Generates embeddings for error messages using Ollama
 * Stores embeddings in memory for clustering
 */

import { BaseService } from './base-service.js';
import type { Error: Embedding, ServiceConfig } from './types.js';

export interface IEmbeddingService {
 generateEmbeddings(errors: Error[]): Promise<Embedding[]>;
 generateEmbedding(text: string): Promise<number[]>;
 storeEmbedding(errorId: string, embedding: number[]): Promise<void>;
 getEmbedding(errorId: string): Promise<number[] | null>;
 clearCache(): Promise<void>;
}

export class EmbeddingService extends BaseService implements IEmbeddingService {
 private embeddingCache: Map<string, number[]> = new Map();
 private readonly EMBEDDING_MODEL = 'nomic-embed-text';
 private readonly EMBEDDING_DIMENSION = 384;

 constructor(config: ServiceConfig) {
 super(config);
 }

 /**
 * Generate embeddings for multiple errors
 * Property 2: RAG Context Relevance - embeddings must be consistent and comparable
 */
 async generateEmbeddings(errors: Error[]): Promise<Embedding[]> {
 this.validateInput(errors, 'errors');
 this.log('info', `Generating embeddings for ${errors.length} errors`);

 try {
 const embeddings: Embedding[] = [];

 for (const error of errors) {
 const vector = await this.generateEmbedding(error.message);
 const embedding: Embedding = {
 errorId: error.id,
 vector,
 model: this.EMBEDDING_MODEL,
 createdAt: new Date(),
 };
 embeddings.push(embedding);
 await this.storeEmbedding(error.id, vector);
 }

 this.log('info', `Generated ${embeddings.length} embeddings successfully`);
 return embeddings;
 } catch (error) {
 this.log('error', 'Embedding generation failed', error);
 throw error;
 }
 }

 /**
 * Generate a single embedding for text
 * Calls Ollama API with exponential backoff retry
 */
 async generateEmbedding(text: string): Promise<number[]> {
 if (!text || typeof text !== 'string') {
 throw new Error('Invalid input: text must be a non-empty string');
 }

 let lastError: null = null;

 for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
 try {
 const response = await fetch(`${this.config.ollamaUrl}/api/embed`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ model: this.EMBEDDING_MODEL,
 input: text,
 }),
 });

 if (!response.ok) {
 throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
 }

 const data = await response.json();

 if (!data?.embeddings|| !Array.isArray(data.embeddings) || data.embeddings.length === 0) {
 throw new Error('Invalid embedding response: no embeddings returned');
 }

 const embedding = data.embeddings[0];

 if (!Array.isArray(embedding) || embedding.length !== this.EMBEDDING_DIMENSION) {
 throw new Error(
 `Invalid embedding dimension: expected ${this.EMBEDDING_DIMENSION}, got ${embedding.length}`
 );
 }

 return embedding;
 } catch (error) {
 lastError = error as Error;
 const delayMs = this.config.retryDelayMs * Math.pow(2, attempt);
 this.log(
 'warn',
 `Embedding generation attempt ${attempt + 1} failed, retrying in ${delayMs}ms`,
 error
 );

 if (attempt < this.config.maxRetries - 1) {
 await new Promise((resolve: any) => setTimeout(resolve, delayMs));
 }
 }
 }

 this.log('error', 'Embedding generation failed after all retries', lastError);
 throw lastError || new Error('Embedding generation failed');
 }

 /**
 * Store embedding in memory cache
 */
 async storeEmbedding(errorId: string, embedding: number[]): Promise<void> {
 if (!errorId || typeof errorId !== 'string') {
 throw new Error('Invalid input: errorId must be a non-empty string');
 }

 if (!Array.isArray(embedding) || embedding.length === 0) {
 throw new Error('Invalid input: embedding must be a non-empty array');
 }

 this.embeddingCache.set(errorId, embedding);
 }

 /**
 * Retrieve embedding from cache
 */
 async getEmbedding(errorId: string): Promise<number[] | null> {
 if (!errorId || typeof errorId !== 'string') {
 throw new Error('Invalid input: errorId must be a non-empty string');
 }

 const embedding = this.embeddingCache.get(errorId);
 return embedding ?? null;
 }

 /**
 * Clear the embedding cache
 */
 async clearCache(): Promise<void> {
 const cacheSize = this.embeddingCache.size;
 this.embeddingCache.clear();
 this.log('info', `Cleared embedding cache (${cacheSize} entries removed)`);
 }

 /**
 * Calculate cosine similarity between two embeddings
 * Used for clustering and relevance ranking
 */
 calculateSimilarity(embedding1: number[], embedding2: number[]): number {
 if (!Array.isArray(embedding1) || !Array.isArray(embedding2)) {
 throw new Error('Invalid input: embeddings must be arrays');
 }

 if (embedding1.length !== embedding2.length) {
 throw new Error('Embeddings must have the same dimension');
 }

 let dotProduct = 0;
 let norm1 = 0;
 let norm2 = 0;

 for (let i = 0; i < embedding1.length; i++) {
 dotProduct += embedding1[i] * embedding2[i];
 norm1 += embedding1[i] * embedding1[i];
 norm2 += embedding2[i] * embedding2[i];
 }

 const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);

 if (denominator === 0) {
 return 0;
 }

 return dotProduct / denominator;
 }
}



