/**
 * Gemma Embeddings Service with PostgreSQL pgvector Integration
 * High-performance embedding generation and vector indexing
 */
import { env } from '$env/dynamic/private';
import { createServiceConfig } from '$lib/config/redis-config';
import { db } from '$lib/server/db/connection';
import { createRedisInstance } from '$lib/server/redis';
import { getOllamaEndpoint } from '$lib/utils/ollama-endpoint';
import { createHash } from 'crypto';
import { sql } from 'drizzle-orm';

// Configuration
const OLLAMA_ENDPOINT = getOllamaEndpoint();
const GEMMA_EMBEDDING_MODEL = env?.GEMMA_EMBEDDING_MODEL ?? 'embedding-gemma:latest';
const EMBEDDING_DIMENSIONS = 512; // Gemma embeddings standard dimension (512-dim GPU-accelerated)

// Redis clients
const gemmaRedis = createRedisInstance(createServiceConfig('GEMMA_EMBEDDINGS'));

// Local Redis key helper
const gemmaEmbeddingKey = (textHash: string) => `gemma:embedding:${textHash}`;

export interface EmbeddingRequest {
    text: string;
    model?: string;
    normalize?: boolean;
    document_type?: 'legal_document' | 'evidence' | 'case' | 'note' | 'unknown';
    metadata?: Record<string, unknown>;
}

export interface EmbeddingResponse {
    success: boolean;
    embedding?: number[];
    dimensions?: number;
    model?: string;
    processing_time?: number;
    cached?: boolean;
    error?: string;
    text_hash?: string;
}

export interface VectorSearchRequest {
    query_text?: string;
    query_embedding?: number[];
    limit?: number;
    similarity_threshold?: number;
    document_types?: string[];
    filters?: Record<string, unknown>;
}

export interface VectorSearchResult {
    id: string;
    similarity: number;
    content: string;
    metadata: Record<string, unknown>;
    document_type: string;
    // Optional score/finalScore fields for unified interface compatibility
    score?: number;
    finalScore?: number;
    source?: string;
}

export interface VectorIndexStats {
    total_vectors: number;
    dimensions: number;
    index_size: string;
    avg_similarity: number;
    last_updated: Date;
}

class GemmaEmbeddingsService {
    private isInitialized = false;

    constructor() {
        this.initialize().catch(err => console.error('Gemma embeddings service init failed:', err));
    }

    /**
     * Initialize the service and ensure database tables exist
     */
    private async initialize(): Promise<void> {
        if (this.isInitialized) return;

        try {
            // Ensure pgvector extension is enabled
            await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);

            // Create embeddings table if not exists
            await db.execute(sql`
                CREATE TABLE IF NOT EXISTS embeddings (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    text_hash VARCHAR(64) UNIQUE NOT NULL,
                    content TEXT NOT NULL,
                    embedding vector(${sql.raw(EMBEDDING_DIMENSIONS.toString())}) NOT NULL,
                    model VARCHAR(100) NOT NULL DEFAULT ${GEMMA_EMBEDDING_MODEL},
                    document_type VARCHAR(50),
                    metadata JSONB DEFAULT '{}',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            `);

            // Create optimized indexes for vector search
            await db.execute(sql`
                CREATE INDEX IF NOT EXISTS idx_embeddings_vector_cosine
                ON embeddings USING hnsw (embedding vector_cosine_ops)
                WITH (m = 16, ef_construction = 64)
            `);

            await db.execute(sql`
                CREATE INDEX IF NOT EXISTS idx_embeddings_vector_l2
                ON embeddings USING hnsw (embedding vector_l2_ops)
                WITH (m = 16, ef_construction = 64)
            `);

            await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_embeddings_text_hash ON embeddings (text_hash)`);
            await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_embeddings_document_type ON embeddings (document_type)`);
            await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_embeddings_metadata_gin ON embeddings USING gin (metadata)`);
            await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_embeddings_created_at ON embeddings (created_at DESC)`);

            // Update function for timestamp
            await db.execute(sql`
                CREATE OR REPLACE FUNCTION update_embeddings_updated_at()
                RETURNS TRIGGER AS $$
                BEGIN
                    NEW.updated_at = NOW();
                    RETURN NEW;
                END;
                $$ language 'plpgsql'
            `);

            // Drop trigger first to ensure idempotence
            await db.execute(sql`DROP TRIGGER IF EXISTS trigger_update_embeddings_updated_at ON embeddings`);
            await db.execute(sql`
                CREATE TRIGGER trigger_update_embeddings_updated_at
                BEFORE UPDATE ON embeddings
                FOR EACH ROW
                EXECUTE FUNCTION update_embeddings_updated_at()
            `);

            this.isInitialized = true;
            console.log('✅ Gemma embeddings service initialized with pgvector support');
        } catch (error) {
            console.error('❌ Failed to initialize Gemma embeddings service:', error);
            // Don't throw from async void method, just log
        }
    }

    /**
     * Generate embeddings using Gemma model
     */
    async generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingResponse> {
        const startTime = Date.now();
        try {
            // Generate text hash for caching
            const textHash = this.generateTextHash(request.text);

            // Check Redis cache first
            const cached = await this.getCachedEmbedding(textHash);
            if (cached) {
                return {
                    ...cached,
                    cached: true,
                    processing_time: Date.now() - startTime,
                    text_hash: textHash
                };
            }

            // Check PostgreSQL for existing embedding
            const existing = await this.getExistingEmbedding(textHash);
            if (existing) {
                // Cache in Redis for faster future access
                await this.cacheEmbedding(textHash, existing);
                return {
                    ...existing,
                    cached: true,
                    processing_time: Date.now() - startTime,
                    text_hash: textHash
                };
            }

            // Generate new embedding using Ollama/Gemma
            const embedding = await this.generateGemmaEmbedding(request.text, request.model);

            const response: EmbeddingResponse = {
                success: true,
                embedding,
                dimensions: EMBEDDING_DIMENSIONS,
                model: request.model || GEMMA_EMBEDDING_MODEL,
                processing_time: Date.now() - startTime,
                cached: false,
                text_hash: textHash
            };

            // Store in PostgreSQL
            await this.storeEmbedding(textHash, request.text, embedding, request);

            // Cache in Redis
            await this.cacheEmbedding(textHash, response);

            return response;
        } catch (error: any) {
            return {
                success: false,
                error: error.message || 'Embedding generation failed',
                processing_time: Date.now() - startTime
            };
        }
    }

    /**
     * Perform vector similarity search
     */
    async vectorSearch(request: VectorSearchRequest): Promise<VectorSearchResult[]> {
        try {
            const limit = request.limit ?? 10;
            const threshold = request.similarity_threshold ?? 0.7;

            // Ensure query capability from either text or embedding
            let queryVec = request.query_embedding;
            if (!queryVec && request.query_text) {
                const gen = await this.generateGemmaEmbedding(request.query_text);
                queryVec = gen;
            }

            if (!queryVec) {
                throw new Error("No query embedding or text provided");
            }

            // Format vector for pgvector
            const embeddingVector = `[${queryVec.join(',')}]`;

            // Build the query
            let query = sql`
                SELECT
                    id,
                    content,
                    metadata,
                    document_type,
                    1 - (embedding <=> ${sql.raw(`'${embeddingVector}'::vector`)}) as similarity
                FROM embeddings
                WHERE 1 - (embedding <=> ${sql.raw(`'${embeddingVector}'::vector`)}) > ${threshold}
            `;

            // Add document type filter
            if (request.document_types && request.document_types.length > 0) {
                query = sql`${query} AND document_type = ANY(${request.document_types})`;
            }

            // Add metadata filters
            if (request.filters) {
                for (const [key, value] of Object.entries(request.filters)) {
                    // Use generic JSON path operator ->> for string comparison
                    // For more complex types, this might need refinement
                    query = sql`${query} AND metadata->>${key} = ${String(value)}`;
                }
            }

            query = sql`${query} ORDER BY similarity DESC LIMIT ${limit}`;

            const results = await db.execute(query);

            return results.map((row: any) => ({
                id: row.id,
                similarity: parseFloat(row.similarity),
                content: row.content,
                metadata: row.metadata || {},
                document_type: row.document_type ?? 'unknown',
                source: 'pgvector'
            }));
        } catch (error) {
            console.error('Vector search failed:', error);
            return [];
        }
    }

    /**
     * Get vector index statistics
     */
    async getIndexStats(): Promise<VectorIndexStats> {
        try {
            const stats = await db.execute(sql`
                SELECT
                    COUNT(*) as total_vectors,
                    pg_size_pretty(pg_total_relation_size('embeddings')) as index_size,
                    MAX(created_at) as last_updated
                FROM embeddings
            `);

            const avgSimilarity = await db.execute(sql`
                SELECT AVG(1 - (e1.embedding <=> e2.embedding)) as avg_similarity
                FROM embeddings e1
                CROSS JOIN embeddings e2
                WHERE e1.id != e2.id
                LIMIT 1000
            `);

            const row = stats[0] as { total_vectors: string, index_size: string, last_updated: string };
            const avgRow = avgSimilarity[0] as { avg_similarity: string };

            return {
                total_vectors: parseInt(row.total_vectors || '0'),
                dimensions: EMBEDDING_DIMENSIONS,
                index_size: row.index_size || '0 bytes',
                avg_similarity: parseFloat(avgRow.avg_similarity || '0'),
                last_updated: row.last_updated ? new Date(row.last_updated) : new Date()
            };
        } catch (error) {
            console.error('Failed to get index stats:', error);
            return {
                total_vectors: 0,
                dimensions: EMBEDDING_DIMENSIONS,
                index_size: '0 bytes',
                avg_similarity: 0,
                last_updated: new Date()
            };
        }
    }

    /**
     * Batch process embeddings for multiple texts
     */
    async batchGenerateEmbeddings(
        texts: string[],
        options: { document_type?: EmbeddingRequest['document_type'], metadata?: Record<string, unknown>, model?: string } = {}
    ): Promise<EmbeddingResponse[]> {
        const results: EmbeddingResponse[] = [];
        // Process in batches of 10 to avoid overwhelming the model
        const batchSize = 10;

        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, i + batchSize);
            const batchPromises = batch.map(text =>
                this.generateEmbedding({
                    text,
                    document_type: options.document_type,
                    metadata: options.metadata,
                    model: options.model
                })
            );

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);

            // Small delay between batches to prevent rate limiting
            if (i + batchSize < texts.length) {
                await new Promise(resolve => setTimeout(resolve, 200)); // 200ms pause
            }
        }

        return results;
    }

    /**
     * Generate embedding using Ollama/Gemma
     */
    private async generateGemmaEmbedding(text: string, model?: string): Promise<number[]> {
        const payload = {
            model: model || GEMMA_EMBEDDING_MODEL,
            prompt: text
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        try {
            const response = await fetch(`${OLLAMA_ENDPOINT}/api/embeddings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error(`Ollama embeddings API error: ${response.status}`);
            }

            const data = await response.json();
            if (!data?.embedding || !Array.isArray(data.embedding)) {
                throw new Error('Invalid embedding response from Ollama');
            }

            return data.embedding;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Generate hash for text content
     */
    private generateTextHash(text: string): string {
        return createHash('sha256').update(text).digest('hex').substring(0, 64);
    }

    /**
     * Get cached embedding from Redis
     */
    private async getCachedEmbedding(textHash: string): Promise<EmbeddingResponse | null> {
        try {
            const cached = await gemmaRedis.get(gemmaEmbeddingKey(textHash));
            return cached ? JSON.parse(cached) : null;
        } catch (error) {
            console.warn('Failed to get cached embedding:', error);
            return null;
        }
    }

    /**
     * Cache embedding in Redis
     */
    private async cacheEmbedding(textHash: string, response: EmbeddingResponse): Promise<void> {
        try {
            await gemmaRedis.setex(
                gemmaEmbeddingKey(textHash),
                172800, // 48 hours TTL
                JSON.stringify(response)
            );
        } catch (error) {
            // Non-critical, just log warning
            console.warn('Failed to cache embedding:', error);
        }
    }

    /**
     * Get existing embedding from PostgreSQL
     */
    private async getExistingEmbedding(textHash: string): Promise<EmbeddingResponse | null> {
        try {
            const result = await db.execute(sql`
                SELECT embedding, model, document_type, metadata
                FROM embeddings
                WHERE text_hash = ${textHash}
                LIMIT 1
            `) as any;

            if (result.length === 0) return null;

            const row = (result.rows ? result.rows[0] : result[0]) as { embedding: string, model: string, document_type: string, metadata: Record<string, unknown> };
            if (!row) return null;

            // pgvector returns vector as string string format "[1,2,3...]"
            let embedding: number[] = [];
            if (typeof row.embedding === 'string') {
                 embedding = JSON.parse(row.embedding);
            } else if (Array.isArray(row.embedding)) {
                 embedding = row.embedding;
            }

            return {
                success: true,
                embedding: embedding,
                dimensions: EMBEDDING_DIMENSIONS,
                model: row.model,
                text_hash: textHash,
                // document_type and metadata available if needed
            };
        } catch (error) {
            console.warn('Failed to get existing embedding from DB:', error);
            return null;
        }
    }

    /**
     * Store embedding in PostgreSQL
     */
    private async storeEmbedding(
        textHash: string,
        content: string,
        embedding: number[],
        request: EmbeddingRequest
    ): Promise<void> {
        try {
            const embeddingVector = `[${embedding.join(',')}]`;

            await db.execute(sql`
                INSERT INTO embeddings (
                    text_hash,
                    content,
                    embedding,
                    model,
                    document_type,
                    metadata
                ) VALUES (
                    ${textHash},
                    ${content},
                    ${sql.raw(`'${embeddingVector}'::vector`)},
                    ${request.model || GEMMA_EMBEDDING_MODEL},
                    ${request.document_type || 'unknown'},
                    ${JSON.stringify(request.metadata || {})}
                )
                ON CONFLICT (text_hash)
                DO UPDATE SET
                    embedding = EXCLUDED.embedding,
                    model = EXCLUDED.model,
                    document_type = EXCLUDED.document_type,
                    metadata = EXCLUDED.metadata,
                    updated_at = NOW()
            `);
        } catch (error) {
            console.error('Failed to store embedding:', error);
            // We throw here because storage failure might be critical depending on strictness
            throw error;
        }
    }

    /**
     * Optimize vector indexes for better performance
     */
    async optimizeIndexes(): Promise<void> {
        try {
            // Reindex for better performance
            await db.execute(sql`REINDEX INDEX idx_embeddings_vector_cosine`);
            await db.execute(sql`REINDEX INDEX idx_embeddings_vector_l2`);

            // Update table statistics
            await db.execute(sql`ANALYZE embeddings`);
            console.log('✅ Vector indexes optimized successfully');
        } catch (error) {
            console.error('❌ Failed to optimize indexes:', error);
        }
    }

    async cleanup(): Promise<void> {
        // Redis instances managed globally
    }
}

// Export singleton instance
export const gemmaEmbeddingsService = new GemmaEmbeddingsService();
export default gemmaEmbeddingsService;






