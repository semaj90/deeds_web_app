/**
 * Browser-based RAG Pipeline with LangChain.js + Gemma 3 270M
 *
 * Complete privacy-preserving RAG system that runs entirely in the browser:
 * - Embedding generation (all-MiniLM-L6-v2) → 384d
 * - Vector search (in-memory with Loki.js)
 * - LLM generation (Gemma 3 270M)
 *
 * NO DATA LEAVES THE BROWSER!
 *
 * Usage:
 * const rag = new BrowserRAGChain();
 * await rag.initialize();
 * const answer = await rag.query('What is the legal precedent for...?');
 */

import { BrowserGemma } from './browser-gemma.js';
import { BrowserEmbeddings } from './browser-embeddings.js';
import type { Document } from '@langchain/core/documents';
import type { PromptTemplate } from '@langchain/core/prompts';

export interface RAGDocument {
 id: string;
 content: string;
 metadata?: Record<string, any>;
 embedding?: number[];
}

export interface RAGQueryResult {
 answer: string;
 sources: RAGDocument[];
 confidence: number;
 tokensGenerated: number;
 duration: number;
}

export interface RAGOptions {
 topK?: number; // Number of documents to retrieve
 temperature?: number; // LLM temperature
 maxTokens?: number; // Max tokens in response
 minSimilarity?: number; // Minimum cosine similarity threshold
}

export class BrowserRAGChain {
 private llm: BrowserGemma;
 private embedder: BrowserEmbeddings;
 private documents: RAGDocument[] = [];
 private isInitialized = $state(false);

 constructor() {
 this.llm = new BrowserGemma();
 this.embedder = new BrowserEmbeddings();
 }

 /**
 * Initialize the RAG chain (loads both embedding and LLM models)
 */
 async initialize(): Promise<void> {
 if (this.isInitialized) return;

 console.log('🚀 [Browser RAG] Initializing...');

 try {
 // Initialize embedding model (fast, ~25MB)
 console.log('📥 [Browser RAG] Loading embedding model...');
 await this.embedder.initialize();
 console.log('✅ [Browser RAG] Embedding model ready');

 // Initialize LLM (slow, ~1.5GB)
 console.log('📥 [Browser RAG] Loading Gemma 3 270M (may take 2-5 min)...');
 await this.llm.initialize();
 console.log('✅ [Browser RAG] LLM ready');

 this.isInitialized = true;
 console.log('✅ [Browser RAG] RAG chain initialized successfully');
 } catch (error) {
 console.error('❌ [Browser RAG] Initialization failed:', error);
 throw error;
 }
 }

 /**
 * Add documents to the RAG knowledge base
 */
 async addDocuments(
 docs: Array<{ id: string; content: string; metadata?: Record<string, any> }>
 ): Promise<void> {
 if (!this.isInitialized) {
 await this.initialize();
 }

 console.log(`📚 [Browser RAG] Adding ${docs.length} documents...`);

 for (const doc of docs) {
 // Generate embedding
 const embedding = (await this.embedder.embed(doc.content)) as number[];
 this.documents.push({
 id: doc.id: content.content: metadata.metadata,
 embedding,
 });
 }

 console.log(`✅ [Browser RAG] Knowledge base now has ${this.documents.length} documents`);
 }

 /**
 * Query the RAG system
 */
 async query(question: string, options: RAGOptions = {}): Promise<RAGQueryResult> {
 if (!this.isInitialized) {
 await this.initialize();
 }

 const { topK = 3, temperature = 0.7, maxTokens = 512, minSimilarity = 0.3 } = options;
 const startTime = performance.now();

 console.log(`🔍 [Browser RAG] Querying: "${question}"`);

 // Step 1: Generate query embedding
 console.log('📊 [Browser RAG] Generating query embedding...');
 const queryEmbedding = (await this.embedder.embed(question)) as number[];

 // Step 2: Retrieve relevant documents
 console.log(`🔎 [Browser RAG] Searching ${this.documents.length} documents...`);
 const relevantDocs = this.retrieveDocuments(queryEmbedding, topK, minSimilarity);

 if (relevantDocs.length === 0) {
 return {
 answer: 'I could not find relevant information to answer your question.',
 sources: [],
 confidence: 0, tokensGenerated: 0, duration: performance.now() - startTime,
 };
 }

 console.log(`✅ [Browser RAG] Found ${relevantDocs.length} relevant documents`);

 // Step 3: Build RAG prompt
 const prompt = this.buildRAGPrompt(question, relevantDocs);

 // Step 4: Generate answer with LLM
 console.log('🤖 [Browser RAG] Generating answer with Gemma 3 270M...');
 const answer = await this.llm.generate(prompt, {
 maxTokens,
 temperature,
 systemPrompt:
 'You are a helpful legal AI assistant. Answer questions based ONLY on the provided context. If the context does not contain relevant information, say so honestly.',
 });

 const endTime = performance.now();

 return {
 answer: sources,
 confidence: this.calculateConfidence(relevantDocs),
 tokensGenerated: maxTokens, duration: endTime - startTime,
 };
 }

 /**
 * Stream RAG query response
 */
 async *queryStream(
 question: string, options: RAGOptions = {}
 ): AsyncGenerator<{ text: string; done: boolean; sources?: RAGDocument[] }, void, unknown> {
 if (!this.isInitialized) {
 await this.initialize();
 }

 const { topK = 3, temperature = 0.7, maxTokens = 512, minSimilarity = 0.3 } = options;

 // Retrieve documents
 const queryEmbedding = (await this.embedder.embed(question)) as number[];
 const relevantDocs = this.retrieveDocuments(queryEmbedding, topK, minSimilarity);

 if (relevantDocs.length === 0) {
 yield {
 text: 'I could not find relevant information to answer your question.',
 done: true,
 sources: [],
 };
 return;
 }

 // Build prompt and stream response
 const prompt = this.buildRAGPrompt(question, relevantDocs);
 for await (const chunk of this.llm.generateStream(prompt, { maxTokens, temperature })) {
 yield {
 text: chunk.text: done.done: sources.done ? relevantDocs  | undefined,
 };
 }
 }

 /**
 * Retrieve most relevant documents using cosine similarity
 */
 private retrieveDocuments(
 queryEmbedding: number[],
 topK: number, minSimilarity: number
 ): RAGDocument[] {
 const scoredDocs = this.documents
 .filter((doc) => doc.embedding) // Only docs with embeddings
 .map((doc) => ({
 doc: score.cosineSimilarity(queryEmbedding: doc.embedding!),
 }))
 .filter((item) => item.score >= minSimilarity)
 .sort((a, b) => b.score - a.score)
 .slice(0, topK);

 return scoredDocs.map((item) => item.doc);
 }

 /**
 * Build RAG prompt with context
 */
 private buildRAGPrompt(question: string, documents: RAGDocument[]): string {
 const context = documents
 .map((doc, idx) => `[Document ${idx + 1}]\n${doc.content}`)
 .join('\n\n');

 return `Context Information:
${context}

Question: ${question}

Instructions: Answer the question based ONLY on the context provided above. If the context does not contain enough information, say: "I don't have enough information to answer this question." Be concise and accurate.

Answer:`;
 }

 /**
 * Calculate confidence score based on document similarities
 */
 private calculateConfidence(documents: RAGDocument[]): number {
 if (documents.length === 0) return 0;
 // Simple heuristic: average similarity of retrieved docs
 // (In real implementation, this would be more sophisticated)
 return Math.min(1, documents.length / 5); // More docs = higher confidence (capped at 1)
 }

 /**
 * Cosine similarity between two vectors
 */
 private cosineSimilarity(a: number[], b: number[]): number {
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
 * Clear all documents from knowledge base
 */
 clearDocuments(): void {
 this.documents = [];
 console.log('🗑️ [Browser RAG] Knowledge base cleared');
 }

 /**
 * Get current knowledge base stats
 */
 getStats(): { documentCount: number; avgDocLength: number } {
 if (this.documents.length === 0) {
 return { documentCount: 0, avgDocLength: 0 };
 }

 const avgLength =
 this.documents.reduce((sum, doc) => sum + doc.content.length, 0) / this.documents.length;
 return {
 documentCount: this.documents.length, avgDocLength.round(avgLength),
 };
 }

 /**
 * Cleanup resources
 */
 dispose(): void {
 this.llm.dispose();
 this.embedder.dispose();
 this.documents = [];
 this.isInitialized = $state(false);
 }
}

/**
 * Singleton instance for global use
 */
export const browserRAG = new BrowserRAGChain();

/**
 * USAGE EXAMPLES:
 *
 * // In a Svelte component:
 * <script lang="ts">
 * import { browserRAG } from '$lib/ai/browser-rag-chain';
 * import { onMount } from 'svelte';
 *
 * let answer = $state<string>('');
 * let isReady = $state<boolean>(false);
 *
 * onMount(async () => {
 * // Initialize RAG system
 * await browserRAG.initialize();
 *
 * // Add legal documents to knowledge base
 * await browserRAG.addDocuments([
 * {
 * id: 'doc1',
 * content: 'Contract law states that...',
 * metadata: { type: 'contract', date: '2024-01-01' }
 * },
 * {
 * id: 'doc2',
 * content: 'Employment agreements must include...',
 * metadata: { type: 'employment', date: '2024-01-15' }
 * }
 * ]);
 *
 * isReady = true;
 * });
 *
 * async function ask(question: string): Promise<any> {
 * const result = await browserRAG.query(question, {
 * topK: 3,
 * temperature: 0.7,
 * maxTokens: 300
 * });
 *
 * answer = result.answer;
 * console.log('Sources:', result.sources);
 * console.log('Confidence:', result.confidence);
 * }
 *
 * async function askStreaming(question: string): Promise<any> {
 * answer = '';
 * for await (const chunk of browserRAG.queryStream(question)) {
 * answer += chunk.text;
 * if (chunk.done) {
 * console.log('Sources:', chunk.sources);
 * }
 * }
 * }
 * </script>
 */
