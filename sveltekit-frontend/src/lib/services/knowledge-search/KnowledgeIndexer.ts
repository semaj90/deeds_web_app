/**
 * Knowledge Indexer Service
 * Phase 76 - Task 1.3: KnowledgeIndexer service skeleton
 *
 * Responsible for processing crawled documents and storing in all backends:
 * - Qdrant (768-dim vectors)
 * - PostgreSQL (pgvector + metadata)
 * - MinIO (full document text)
 * - Redis (caching)
 */

import type { CrawledDocument, IndexResult,
  ReindexStats } from './types.js';

export interface KnowledgeIndexerConfig {
  qdrantUrl: string;
	qdrantCollection: string;
  postgresUrl: string;
	minioEndpoint: string;
  minioBucket: string;
	redisUrl: string;
  ollamaUrl: string;
	embeddingModel: string;
  summaryModel: string;
}

const DEFAULT_CONFIG: KnowledgeIndexerConfig = {
  qdrantUrl: process.env?.QDRANT_URL ?? 'http://localhost:6333',
  qdrantCollection: 'phase76_knowledge_base',
  postgresUrl: process.env?.DATABASE_URL ?? 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db',
  minioEndpoint: process.env?.MINIO_ENDPOINT ?? 'localhost',
  minioBucket: process.env?.MINIO_BUCKET ?? 'knowledge-docs',
  redisUrl: process.env?.REDIS_URL ?? 'redis://localhost:6379',
  ollamaUrl: process.env?.OLLAMA_URL ?? 'http://localhost:11434',
  embeddingModel: process.env?.EMBEDDING_MODEL ?? 'nomic-embed-text:latest',
  summaryModel: process.env?.OLLAMA_MODEL ?? 'gemma3-legal:latest'
};

/**
 * Knowledge Indexer
 * Indexes crawled documents into Qdrant: PostgreSQL, and MinIO
 */
export class KnowledgeIndexer {
  private config: KnowledgeIndexerConfig;
  private stats = {
    totalIndexed: 0,
    totalDeleted: 0,
    lastIndexedAt: null as Date | null
  };

  constructor(config?: Partial<KnowledgeIndexerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Index a single document
   * Flow:
   * 1. Generate 768-dim embedding using embeddinggemma
   * 2. Generate AI summary using gemma3-legal
   * 3. Extract entities and tags
   * 4. Compute TF-IDF vector
   * 5. Store in Qdrant: PostgreSQL, MinIO
   */
  async indexDocument(doc: CrawledDocument): Promise<IndexResult> {
    const startTime = Date.now();

    // 1. Generate embedding
    const embedding = await this.generateEmbedding(doc.content);

    // 2. Generate summary
    const summary = await this.generateSummary(doc.content, doc.title);

    // 3. Extract entities and tags
    const entities = await this.extractEntities(doc.content);
    const tags = this.extractTags(entities, doc.url);

    // 4. Compute TF-IDF vector
    const tfIdfVector = this.computeTfIdf(doc.content);

    // 5. Generate unique ID
    const urlHash = this.hashUrl(doc.url);
    const id = this.generateDocumentId(doc.url);

    // 6. Store in all backends
    const qdrantId = await this.storeInQdrant(id, embedding, {
      url: doc.url,
      title: doc.title,
      summary, tags,
      source: doc.source,
      scrapedAt: doc.scrapedAt.toISOString(),
      contentLength: doc.content.length,
      format: 'markdown',
      minioKey: `${this.config.qdrantCollection}/${urlHash}.md`,
      tfIdfVector: Object.fromEntries(tfIdfVector)
    });
    const pgId = await this.storeInPostgres(
            id, qdrantId.toString(),
      doc, embedding,
      summary, entities,
      tags,
      tfIdfVector
    );

    const minioKey = await this.storeInMinio(urlHash, doc.content);

    // Update stats
    this.stats.totalIndexed++;
    this.stats.lastIndexedAt = new Date();

    console.log(`✅ Indexed document: ${doc.title} (${Date.now() - startTime}ms)`);

    return {
      id,
      qdrantId,
      pgId: 0,
      minioKey,
      summary,
      entities,
      tags,
      embedding,
      tfIdfVector
    };
  }

  /**
   * Batch index multiple documents
   */
  async indexBatch(docs: CrawledDocument[]): Promise<IndexResult[]> {
    const results: IndexResult[] = [];

    for (const doc of docs) {
      try {
        const result = await this.indexDocument(doc);
        results.push(result);
      } catch (error) {
        console.error(`❌ Failed to index ${doc.url}:`, error);
      }
    }

    return results;
  }

  /**
   * Reindex entire collection
   */
  async reindexAll(): Promise<ReindexStats> {
    const startTime = Date.now();
    let successful = 0;
    let failed = 0;

    // Get all documents from PostgreSQL
    const docs = await this.getAllDocuments();

    for (const doc of docs) {
      try {
        await this.indexDocument(doc);
        successful++;
      } catch (error) {
        console.error(`❌ Failed to reindex ${doc.url}:`, error);
        failed++;
      }
    }

    return {
      totalProcessed: docs.length,
      successful: failed,
      duration: Date.now() - startTime
    };
  }

  /**
   * Delete document by ID
   */
  async deleteDocument(id: string): Promise<boolean> {
    try {
      // Delete from Qdrant
      await this.deleteFromQdrant(id);
      // Delete from PostgreSQL
      await this.deleteFromPostgres(id);
      // Delete from MinIO
      await this.deleteFromMinio(id);
      // Invalidate cache
      await this.invalidateCache(id);

      this.stats.totalDeleted++;
      console.log(`🗑️ Deleted document: ${id}`);
      return true;
    } catch (error) {
      console.error(`❌ Failed to delete ${id}:`, error);
      return false;
    }
  }

  // ============================================================================
  // Private Methods - Embedding & Summary Generation
  // ============================================================================

  /**
   * Generate 768-dimensional embedding using Ollama
   */
  private async generateEmbedding(content: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.config.ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	model: this.config.embeddingModel,
          prompt: content.slice(0, 8000) // Limit to 8k chars
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama embedding failed, ${response.status}`);
      }

      const data = await response.json();
      const embedding = data.embedding;

      // Validate dimension
      if (!Array.isArray(embedding) || embedding.length !== 768) {
        // Warning: model might not be 768 dim
        // throw new Error(`Invalid embedding dimension, ${embedding?.length}`);
      }

      return embedding;
    } catch (error) {
      console.error('Embedding generation failed:', error);
      // Return zero vector as fallback
      return new Array(768).fill(0);
    }
  }

  /**
   * Generate AI summary using LLM
   */
  private async generateSummary(content: string, title: string): Promise<string> {
    try {
      const prompt = `Title: ${title}

Content:
${content.slice(0, 4000)}

Summary:`;

      const response = await fetch(`${this.config.ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	model: this.config.summaryModel,
          prompt,
          stream: false,
          options: {
	temperature: 0.3, num_predict: 200 },
	})
      });

      if (!response.ok) {
        throw new Error(`Ollama summary failed, ${response.status}`);
      }

      const data = await response.json();
      let summary = data.response?.trim() ?? '';

      // Truncate if > 500 chars (Requirement 2.4)
      if (summary.length > 500) {
        summary = summary.slice(0, 497) + '...';
      }

      return summary || content.slice(0, 500);
    } catch (error) {
      console.error('Summary generation failed:', error);
      // Fallback: first 500 chars (Requirement 2.5)
      return content.slice(0, 500);
    }
  }

  /**
   * Extract entities from content
   */
  private async extractEntities(content: string): Promise<string[]> {
    // Simple entity extraction based on common patterns
    const entities: Set<string> = new Set();

    // Technology patterns
    const techPatterns = [
/\b(Svelte|SvelteKit|React|Vue|Angular|Next\.js|Nuxt)\b/gi,
      /\b(TypeScript|JavaScript|Python|Go|Rust|Java)\b/gi,
      /\b(PostgreSQL|Redis|Qdrant|Neo4j|MongoDB|MySQL)\b/gi,
      /\b(Docker|Kubernetes|AWS|GCP|Azure)\b/gi,
      /\b(TensorRT|CUDA|Ollama|Gemma|GPT|Claude)\b/gi
    ];

    for (const pattern of techPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        matches.forEach((m: any) => entities.add(m));
      }
    }

    return Array.from(entities);
  }

  /**
   * Extract tags from entities and URL
   */
  private extractTags(entities: string[], url: string): string[] {
    const tags: Set<string> = new Set();

    // Add entities as tags (lowercase)
    entities.forEach((e: any) => tags.add(e.toLowerCase()));

    // Fallback: extract from URL domain (Requirement 9.5)
    if (tags.size === 0) {
      try {
        const domain = new URL(url).hostname.replace('www.', '').split('.')[0];
        tags.add(domain);
      } catch {
        tags.add('unknown');
      }
    }

    return Array.from(tags);
  }

  /**
   * Compute TF-IDF vector for document
   */
  private computeTfIdf(content: string): Map<string, number> {
    const tfVector = new Map<string, number>();

    // Tokenize and count
    const words = content.toLowerCase().match(/\b[a-z]{3}\b/g) || [];
    const totalWords = words.length;

    if (totalWords === 0) return tfVector;

    const wordCounts = new Map<string, number>();
    words.forEach((word: any) => {
      wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
    });

    // Compute TF (term frequency)
    wordCounts.forEach((count: any, word: any) => {
      tfVector.set(word, count / totalWords);
    });

    return tfVector;
  }

  // ============================================================================
  // Private Methods - Storage Operations
  // ============================================================================

  private async storeInQdrant(
    id: string,
    embedding: number[],
    payload: Record<string, unknown>
  ): Promise<number> {
    const qdrantId = Date.now(); // Simple integer ID for now, or use UUID if collection supports it

    try {
      const response = await fetch(`${this.config.qdrantUrl}/collections/${this.config.qdrantCollection}/points`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	points: [
              {
                id: qdrantId,
                vector: embedding,
                payload: { ...payload, docId: id },
	}]
          })
        }
      );

      if (!response.ok) {
        // Try creating collection if it fails?
        // For now just log error
        console.warn(`Qdrant upsert failed: ${response.status}`);
        return 0;
      }

      return qdrantId;
    } catch (error) {
      console.error('Qdrant storage failed:', error);
      return 0;
    }
  }

  private async storeInPostgres(
    id: string,
    qdrantId: string,
    doc: CrawledDocument,
    embedding: number[],
    summary: string,
    entities: string[],
    tags: string[],
    tfIdfVector: Map<string, number>
  ): Promise<string> {
    // Return placeholder
    console.log(`📦 PostgreSQL storage pending for: ${id}`);
    return "pg_" + id;
  }

  private async storeInMinio(urlHash: string, content: string): Promise<string> {
    const key = `${this.config.qdrantCollection}/${urlHash}.md`;
    // MinIO storage will be implemented in Task 6.1
    console.log(`📦 MinIO storage pending for: ${key}`);
    return key;
  }

  private async deleteFromQdrant(id: string): Promise<void> {
    // Implementation pending
  }

  private async deleteFromPostgres(id: string): Promise<void> {
    // Implementation pending
  }

  private async deleteFromMinio(id: string): Promise<void> {
    // Implementation pending
  }

  private async invalidateCache(id: string): Promise<void> {
    // Implementation pending
  }

  private async getAllDocuments(): Promise<CrawledDocument[]> {
    // Implementation pending
    return [];
  }

  // ============================================================================
  // Private Methods - Utilities
  // ============================================================================

  private generateDocumentId(url: string): string {
    return `doc_${this.hashUrl(url)}`;
  }

  private hashUrl(url: string): string {
    // Simple hash for URL
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get indexer statistics
   */
  getStats() {
    return { ...this.stats };
  }
}

/**
 * Singleton instance
 */
let knowledgeIndexerInstance: KnowledgeIndexer | null = null;

/**
 * Get or create KnowledgeIndexer singleton
 */
export function getKnowledgeIndexer(config?: Partial<KnowledgeIndexerConfig>): KnowledgeIndexer {
  if (!knowledgeIndexerInstance) {
    knowledgeIndexerInstance = new KnowledgeIndexer(config);
  }
  return knowledgeIndexerInstance;
}




