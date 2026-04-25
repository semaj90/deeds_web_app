/**
 * Gemma Embedding Service
 * Integrates with Ollama's Gemma embedding models for legal document vectorization
 * Prioritizes embeddinggemma:latest as per CLAUDE.md instructions
 */

import type { ProcessedLegalDocument, EnhancedDocumentChunk } from './document-processor.js';

export interface EmbeddingRequest {
  model: string;
  prompt: string;
  options?: {
    temperature?: number;
    num_predict?: number;
    top_k?: number;
    top_p?: number;
  };
}

export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  created_at: string;
  done: boolean;
}

export interface VectorizedDocument extends ProcessedLegalDocument {
  document_embedding: number[];
  chunks: VectorizedChunk[];
  embedding_model: string;
  embedding_created_at: string;
}

export interface VectorizedChunk extends EnhancedDocumentChunk {
  embedding: number[];
  embedding_model: string;
  cosine_similarity_threshold: number;
}

export interface EmbeddingBatch {
  documents: VectorizedDocument[];
  total_embeddings: number;
  processing_time_ms: number;
  model_used: string;
  batch_id: string;
}

export interface SimilarityResult {
  document_id: string;
  chunk_id: string;
  content: string;
  similarity_score: number;
  metadata: any;
  legal_concepts: string[];
}

export class GemmaEmbeddingService {
  private ollamaUrl: string;
  private primaryModel = 'embeddinggemma:latest'; // Primary model as per CLAUDE.md
  private fallbackModels = ['embeddinggemma', 'nomic-embed-text']; // Fallback models
  private currentModel: string;
  private batchSize = 50;
  private concurrencyLimit = 5;
  private requestTimeout = 30000; // 30 seconds

  constructor(ollamaUrl = 'http://localhost:11434') {
    this.ollamaUrl = ollamaUrl;
    this.currentModel = this.primaryModel;
  }

  /**
   * Initialize service and verify model availability
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing Gemma Embedding Service...');

    // Try primary model first
    if (await this.isModelAvailable(this.primaryModel)) {
      this.currentModel = this.primaryModel;
      console.log(`✅ Using primary model: ${this.primaryModel}`);
      return;
    }

    // Try fallback models
    for (const model of this.fallbackModels) {
      if (await this.isModelAvailable(model)) {
        this.currentModel = model;
        console.log(`⚠️ Using fallback model: ${model} (${this.primaryModel} not available)`);
        return;
      }
    }

    throw new Error(`❌ No Gemma embedding models available. Tried: ${[this.primaryModel, ...this.fallbackModels].join(', ')}`);
  }

  /**
   * Check if model is available in Ollama
   */
  private async isModelAvailable(model: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.ollamaUrl}/api/show`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: model })
      });
      return response.ok;
    } catch (error) {
      console.log(`Model ${model} not available:`, error.message);
      return false;
    }
  }

  /**
   * Generate embedding for single text
   */
  async generateEmbedding(text: string, model?: string): Promise<number[]> {
    const useModel = model || this.currentModel;

    try {
      const response = await fetch(`${this.ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: useModel,
          prompt: text
        }),
        signal: AbortSignal.timeout(this.requestTimeout)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result: EmbeddingResponse = await response.json();

      if (!result.embedding || !Array.isArray(result.embedding)) {
        throw new Error('Invalid embedding response format');
      }

      return result.embedding;
    } catch (error) {
      console.error(`❌ Error generating embedding with ${useModel}:`, error);

      // Try fallback if primary model failed
      if (useModel === this.primaryModel && this.fallbackModels.length > 0) {
        console.log(`🔄 Retrying with fallback model...`);
        return this.generateEmbedding(text, this.fallbackModels[0]);
      }

      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batches
   */
  async generateEmbeddingBatch(
    texts: string[],
    onProgress?: (completed: number, total: number) => void
  ): Promise<number[][]> {
    console.log(`🔄 Generating ${texts.length} embeddings in batches of ${this.batchSize}...`);

    const embeddings: number[][] = [];
    const batches = this.chunkArray(texts, this.batchSize);
    let completed = 0;

    for (const batch of batches) {
      const batchPromises = batch.map(async (text) => {
        try {
          const embedding = await this.generateEmbedding(text);
          completed++;
          if (onProgress) onProgress(completed, texts.length);
          return embedding;
        } catch (error) {
          console.error('❌ Failed to generate embedding for text:', error);
          completed++;
          if (onProgress) onProgress(completed, texts.length);
          return null;
        }
      });

  // Process batch with concurrency limit
  const batchEmbeddings = await this.processConcurrently(batchPromises, this.concurrencyLimit);
  // Append non-null embeddings from this batch
  embeddings.push(...(batchEmbeddings.filter((emb) => emb !== null) as any[]));

      // Add delay between batches to avoid overwhelming the server
      if (batches.indexOf(batch) < batches.length - 1) {
        await this.delay(100);
      }
    }

    console.log(`✅ Generated ${embeddings.length}/${texts.length} embeddings`);
    return embeddings;
  }

  /**
   * Vectorize legal documents with embeddings
   */
  async vectorizeDocuments(
    documents: ProcessedLegalDocument[],
    options: {
      includeDocumentEmbedding?: boolean;
      includeChunkEmbeddings?: boolean;
      onProgress?: (completed: number, total: number) => void;
    } = {}
  ): Promise<EmbeddingBatch> {
    const startTime = Date.now();
    const batchId = this.generateBatchId();

    console.log(`🔄 Vectorizing ${documents.length} documents...`);

    const vectorizedDocs: VectorizedDocument[] = [];
    let totalEmbeddings = 0;
    let completed = 0;

    const { includeDocumentEmbedding = true, includeChunkEmbeddings = true, onProgress } = options;

    for (const doc of documents) {
      try {
        const vectorizedDoc: VectorizedDocument = {
          ...doc,
          document_embedding: [],
          chunks: [],
          embedding_model: this.currentModel,
          embedding_created_at: new Date().toISOString()
        };

        // Generate document-level embedding
        if (includeDocumentEmbedding) {
          const docText = `${doc.title}\n\n${doc.content.substring(0, 2000)}`; // Limit content
          vectorizedDoc.document_embedding = await this.generateEmbedding(docText);
          totalEmbeddings++;
        }

        // Generate chunk embeddings
        if (includeChunkEmbeddings) {
          const vectorizedChunks: VectorizedChunk[] = [];

          for (const chunk of doc.chunks) {
            try {
              const chunkEmbedding = await this.generateEmbedding(chunk.content);

              vectorizedChunks.push({
                ...(chunk as EnhancedDocumentChunk),
                embedding: chunkEmbedding,
                embedding_model: this.currentModel,
                cosine_similarity_threshold: 0.7 // Default threshold
              } as any);

              totalEmbeddings++;
            } catch (error) {
              console.error(`❌ Failed to vectorize chunk ${chunk.id}:`, error);
            }
          }

          vectorizedDoc.chunks = vectorizedChunks;
        }

  vectorizedDocs.push(vectorizedDoc as any);
        completed++;

        if (onProgress) {
          onProgress(completed, documents.length);
        }

        console.log(`✅ Vectorized: ${doc.title.substring(0, 50)}... (${totalEmbeddings} embeddings)`);

      } catch (error) {
        console.error(`❌ Error vectorizing document ${doc.id}:`, error);
        completed++;
        if (onProgress) onProgress(completed, documents.length);
      }
    }

    const processingTime = Date.now() - startTime;

    console.log(`🎯 Vectorization complete: ${vectorizedDocs.length} documents, ${totalEmbeddings} embeddings in ${processingTime}ms`);

    return {
      documents: vectorizedDocs,
      total_embeddings: totalEmbeddings,
      processing_time_ms: processingTime,
      model_used: this.currentModel,
      batch_id: batchId
    };
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  calculateCosineSimilarity(embeddingA: number[], embeddingB: number[]): number {
    if (embeddingA.length !== embeddingB.length) {
      throw new Error('Embeddings must have the same dimensions');
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < embeddingA.length; i++) {
      dotProduct += embeddingA[i] * embeddingB[i];
      magnitudeA += embeddingA[i] ** 2;
      magnitudeB += embeddingB[i] ** 2;
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Find similar chunks to a query embedding
   */
  async findSimilarChunks(
    queryEmbedding: number[],
    documents: VectorizedDocument[],
    options: {
      topK?: number;
      minSimilarity?: number;
      legalAreaFilter?: string;
      documentTypeFilter?: string;
    } = {}
  ): Promise<SimilarityResult[]> {
    const { topK = 10, minSimilarity = 0.5, legalAreaFilter, documentTypeFilter } = options;

    const results: SimilarityResult[] = [];

    for (const doc of documents) {
      // Apply filters
      if (legalAreaFilter && doc.metadata.legal_area !== legalAreaFilter) continue;
      if (documentTypeFilter && doc.metadata.document_type !== documentTypeFilter) continue;

      for (const chunk of doc.chunks) {
        if (!chunk.embedding) continue;

        const similarity = this.calculateCosineSimilarity(queryEmbedding, chunk.embedding);

        if (similarity >= minSimilarity) {
          results.push({
            document_id: doc.id,
            chunk_id: chunk.id,
            content: chunk.content,
            similarity_score: similarity,
            metadata: {
              document_title: doc.title,
              legal_area: doc.metadata.legal_area,
              document_type: doc.metadata.document_type,
              chunk_metadata: chunk.metadata
            },
            legal_concepts: chunk.legal_concepts || []
          } as any);
        }
      }
    }

    // Sort by similarity score (highest first) and take topK
    return results
      .sort((a, b) => b.similarity_score - a.similarity_score)
      .slice(0, topK);
  }

  /**
   * Semantic search with query text
   */
  async semanticSearch(
    query: string,
    documents: VectorizedDocument[],
    options: {
      topK?: number;
      minSimilarity?: number;
      legalAreaFilter?: string;
      documentTypeFilter?: string;
    } = {}
  ): Promise<SimilarityResult[]> {
    console.log(`🔍 Performing semantic search: "${query.substring(0, 50)}..."`);

    // Generate embedding for query
    const queryEmbedding = await this.generateEmbedding(query);

    // Find similar chunks
    const results = await this.findSimilarChunks(queryEmbedding, documents, options);

    console.log(`🎯 Found ${results.length} similar chunks`);
    return results;
  }

  /**
   * Utility methods
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  private async processConcurrently<T>(
    promises: Promise<T>[],
    concurrencyLimit: number
  ): Promise<T[]> {
    const results: T[] = [];
    const executing: Promise<void>[] = [];

    for (const promise of promises) {
      const execute = promise.then((result) => {
        results.push(result as any);
      });

      executing.push(execute as Promise<void>);

      if (executing.length >= concurrencyLimit) {
        await Promise.race(executing);
        executing.splice(executing.findIndex(p => p === execute), 1);
      }
    }

    await Promise.all(executing);
    return results;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private generateBatchId(): string {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get current model info
   */
  getModelInfo(): { primary: string; current: string; fallbacks: string[] } {
    return {
      primary: this.primaryModel,
      current: this.currentModel,
      fallbacks: this.fallbackModels
    };
  }

  /**
   * Switch to different model
   */
  async switchModel(modelName: string): Promise<boolean> {
    if (await this.isModelAvailable(modelName)) {
      this.currentModel = modelName;
      console.log(`✅ Switched to model: ${modelName}`);
      return true;
    } else {
      console.error(`❌ Model ${modelName} not available`);
      return false;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    model: string;
    ollamaUrl: string;
    available_models: string[];
  }> {
    try {
      const availableModels: string[] = [];

      // Check all models
      for (const model of [this.primaryModel, ...this.fallbackModels]) {
        if (await this.isModelAvailable(model)) {
          availableModels.push(model);
        }
      }

      // Test embedding generation
      await this.generateEmbedding('test embedding');

      return {
        status: 'healthy',
        model: this.currentModel,
        ollamaUrl: this.ollamaUrl,
        available_models: availableModels
      };
    } catch (error) {
      console.error('Gemma Embedding Service health check failed:', error);
      return {
        status: 'unhealthy',
        model: this.currentModel,
        ollamaUrl: this.ollamaUrl,
        available_models: []
      };
    }
  }
}

// Export singleton
export const gemmaEmbeddingService = new GemmaEmbeddingService();
export default gemmaEmbeddingService;
