import { OllamaService } from '$lib/services/ollamaService';
import { userAiQueries, autoTags, documentChunks, embeddingCache, type NewUserAiQuery, type NewAutoTag, type NewDocumentChunk } from '$lib/server/db/schema-postgres';
import { eq, sql } from 'drizzle-orm';
import { generateIdFromEntropySize } from 'lucia';
import crypto from 'crypto';
import dbTyped from '$lib/server/db/index';
// Cast db to any to allow .execute() and relaxed schema typing
const db = dbTyped as any;

/**
 * Add a minimal local type for the Ollama client shape we expect
 * This avoids circular dependencies or issues with the full service type
 */
type OllamaClient = {
    generateCompletion(prompt: string, opts?: { systemPrompt?: string; temperature?: number; maxTokens?: number }): Promise<string>;
    generateEmbedding(text: string): Promise<number[]>;
};

export interface AIAnalysisResult {
    summary: string;
    tags: string[];
    confidence: number;
    entities?: string[];
    keywords?: string[];
    recommendations?: string[];
}

export interface AIQueryOptions {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    includeContext?: boolean;
    saveQuery?: boolean;
}

export interface VectorSearchResult {
    content: string;
    similarity: number;
    metadata: Record<string, unknown>;
    documentId: string;
}

// Add local types for embedding cache rows/inserts
type EmbeddingCacheRow = {
    id: string;
    textHash: string;
    embedding: string | number[] | null;
    model?: string | null;
    createdAt?: string | null;
};

type NewEmbeddingCache = {
    id: string;
    textHash: string;
    embedding: string; // Stored as JSON string
    model: string;
    createdAt: string;
};

export class AIService {
    private ollama: OllamaClient;

    constructor() {
        // Cast the imported OllamaService instance to our minimal OllamaClient shape.
        // using unknown->typed cast to avoid leaking any while informing TS about required methods.
        this.ollama = new OllamaService() as unknown as OllamaClient;
    }

    /**
     * Process AI query with context and logging
     */
    async processQuery(
        query: string,
        userId: string,
        caseId?: string,
        options: AIQueryOptions = {}
    ): Promise<{ response: string; confidence: number; contextUsed: string[]; queryId?: string }> {
        const startTime = Date.now();
        const { model = 'gemma3-legal', temperature = 0.7, maxTokens = 2000, includeContext = true, saveQuery = true } = options;

        try {
            // Get relevant context if requested
            let contextDocuments: VectorSearchResult[] = [];
            let systemPrompt = 'You are a legal AI assistant specialized in prosecutor and detective workflows. Provide accurate, detailed, and actionable legal analysis.';

            if (includeContext && caseId) {
                const queryEmbedding = await this.ollama.generateEmbedding(query);
                contextDocuments = await this.findSimilarDocuments(queryEmbedding, 5, 0.7);

                if (contextDocuments.length > 0) {
                    const contextText = contextDocuments.map(doc => `[Context] ${doc.content}`).join('\n\n');
                    systemPrompt += `\n\nRelevant context:\n${contextText}`;
                }
            }

            // Generate AI response
            const response = await this.ollama.generateCompletion(query, { systemPrompt, temperature, maxTokens });
            const processingTime = Date.now() - startTime;
            const confidence = this.calculateConfidence(response, contextDocuments.length);
            const contextUsed = contextDocuments.map(doc => doc.documentId);

            // Save query log if requested
            let queryId: string | undefined = undefined;
            if (saveQuery) {
                const embedding = await this.ollama.generateEmbedding(query);
                queryId = await this.logQuery({
                    userId,
                    caseId,
                    query,
                    response,
                    model,
                    confidence,
                    processingTime,
                    contextUsed,
                    embedding,
                    isSuccessful: true
                });
            }

            return { response, confidence, contextUsed, queryId };
        } catch (error: Error | unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('AI query failed: ', msg);

            // Log failed query
            if (saveQuery) {
                try {
                    await this.logQuery({
                        userId,
                        caseId,
                        query,
                        response: '',
                        model,
                        confidence: 0,
                        processingTime: Date.now() - startTime,
                        contextUsed: [],
                        isSuccessful: false,
                        errorMessage: msg
                    });
                } catch (logErr: unknown) {
                    const lmsg = logErr instanceof Error ? logErr.message : String(logErr);
                    console.error('Failed to log failed query: ', lmsg);
                }
            }
            throw error;
        }
    }

    /**
     * Analyze evidence and generate auto-tags
     */
    async analyzeEvidence(evidenceId: string, content: string, evidenceType: string = 'document'): Promise<AIAnalysisResult> {
        try {
            const systemPrompt = `You are a legal AI assistant specialized in evidence analysis.
            Analyze the following ${evidenceType} evidence provide:
            1. A concise summary (2-3 sentences)
            2. Relevant tags for legal categorization
            3. Key entities mentioned
            4. Important keywords
            5. Recommendations for investigation

            Format your response as JSON with the structure:
            {
                "summary": "Brief summary here",
                "tags": ["tag1", "tag2", "tag3"],
                "confidence": 0.85,
                "entities": ["entity1", "entity2"],
                "keywords": ["keyword1", "keyword2"],
                "recommendations": ["recommendation1", "recommendation2"]
            }`;

            const response = await this.ollama.generateCompletion(content, { systemPrompt, temperature: 0.3, maxTokens: 1000 });

            // Parse AI response analysis
            let analysis: AIAnalysisResult;
            try {
                // Find JSON in response if masked by markdown
                const jsonMatch = response.match(/\{[\s\S]*\}/);
                const jsonString = jsonMatch ? jsonMatch[0] : response;
                analysis = JSON.parse(jsonString) as AIAnalysisResult;
            } catch {
                analysis = this.parseAnalysisResponse(response);
            }

            // Generate and store auto-tags
            if (analysis.tags && analysis.tags.length > 0) {
                await this.generateAutoTags(evidenceId, 'evidence', analysis.tags, analysis.confidence);
            }

            // Store document chunk for vector search
            await this.storeDocumentChunk(evidenceId, 'evidence', content, analysis);

            return analysis;
        } catch (error: Error | unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('Evidence analysis failed: ', msg);
            throw error;
        }
    }

    /**
     * Find similar documents using vector search (simplified/defensive)
     */
    async findSimilarDocuments(queryEmbedding: number[], limit = 10, threshold = 0.7): Promise<VectorSearchResult[]> {
        try {
            // Select stored embeddings so we can compute similarity locally (defensive)
            const rows = (await db.execute(
                sql`SELECT id, document_id, content, metadata, embedding FROM document_chunks LIMIT 100` // Increased limit for re-ranking
            )) as Array<{ id: string; document_id: string; content: string; metadata: Record<string, unknown>; embedding: string | number[] | null }>;

            // Normalize and compute similarity results
            const results: VectorSearchResult[] = [];

            for (const row of rows) {
                try {
                    let storedEmbedding: number[] | null = null;
                    if (Array.isArray(row.embedding)) {
                        storedEmbedding = row.embedding as number[];
                    } else if (typeof row.embedding === 'string' && row.embedding.length > 0) {
                        try {
                            storedEmbedding = JSON.parse(row.embedding) as number[];
                        } catch {
                             storedEmbedding = null;
                        }
                    }

                    if (!storedEmbedding || !Array.isArray(storedEmbedding)) continue;
                    if (storedEmbedding.length !== queryEmbedding.length) continue;

                    const sim = this.computeCosineSimilarity(queryEmbedding, storedEmbedding);
                    if (sim >= threshold) {
                        results.push({
                            content: row.content,
                            similarity: sim,
                            metadata: (row.metadata ?? {}) as Record<string, unknown>,
                            documentId: row.document_id
                        });
                    }
                } catch {
                    // ignore malformed row and continue
                    continue;
                }
            }

            // sort by similarity desc and limit
            results.sort((a, b) => b.similarity - a.similarity);
            return results.slice(0, limit);
        } catch (error: Error | unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('Vector search failed: ', msg);
            return [];
        }
    }

    /**
     * Find similar queries for smart suggestions
     */
    async findSimilarQueries(
        queryEmbedding: number[],
        userId?: string,
        limit = 5
    ): Promise<Array<{ query: string; response: string; similarity: number }>> {
        try {
            // Simplified: return recent queries for the user or a global sample.
            // Ideally should use vector search if queries are embedded.
            let rows;
            if (userId) {
                rows = (await db.execute(
                    sql`SELECT query, response, 0.0 as similarity FROM user_ai_queries WHERE user_id = ${userId} ORDER BY created_at DESC LIMIT ${limit}`
                )) as Array<{ query: string; response: string; similarity: number }>;
            } else {
                rows = (await db.execute(
                    sql`SELECT query, response, 0.0 as similarity FROM user_ai_queries ORDER BY created_at DESC LIMIT ${limit}`
                )) as Array<{ query: string; response: string; similarity: number }>;
            }

            return rows.map(r => ({
                query: r.query,
                response: r.response,
                similarity: Number(r.similarity)
            }));
        } catch (error: Error | unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('Similar query search failed: ', msg);
            return [];
        }
    }

    /**
     * Get cached embedding or generate new one
     */
    async getOrCreateEmbedding(text: string): Promise<number[]> {
        const textHash = crypto.createHash('sha256').update(text).digest('hex');
        try {
            // Check cache first (typed)
            const rows = await db
                .select({
                    id: embeddingCache.id,
                    textHash: embeddingCache.textHash,
                    embedding: embeddingCache.embedding,
                    model: embeddingCache.model,
                    createdAt: embeddingCache.createdAt
                })
                .from(embeddingCache)
                .where(eq(embeddingCache.textHash, textHash))
                .limit(1);

            const cached = rows[0] as EmbeddingCacheRow | undefined;

            if (cached && cached.embedding) {
                const embField = cached.embedding;
                // If stored as JSON string, parse it
                if (typeof embField === 'string') {
                    return JSON.parse(embField) as number[];
                }
                return embField as number[];
            }

            // Generate new embedding
            const embedding = await this.ollama.generateEmbedding(text);

            // Cache the embedding (store JSON string to match DB schema)
            const insertData: NewEmbeddingCache = {
                id: generateIdFromEntropySize(10),
                textHash: textHash,
                embedding: JSON.stringify(embedding),
                model: 'gemma3-legal:latest',
                createdAt: new Date().toISOString()
            };

            await db.insert(embeddingCache).values(insertData);
            return embedding;
        } catch (error: Error | unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('Embedding generation failed: ', msg);
            throw error;
        }
    }

    /**
     * Log AI query to database
     */
    private async logQuery(data: {
        userId: string;
        caseId?: string;
        query: string;
        response: string;
        model: string;
        confidence: number;
        processingTime: number;
        contextUsed: string[];
        embedding?: number[];
        isSuccessful?: boolean;
        errorMessage?: string;
    }): Promise<string> {
        try {
            // Build a strongly-typed insert object
            const queryData: any = {
                id: generateIdFromEntropySize(10),
                userId: data.userId,
                caseId: data.caseId ?? null,
                query: data.query,
                response: data.response,
                model: data.model ?? 'unknown',
                confidence: String(data.confidence), // Schema expects string for numeric/decimal type
                processingTime: data.processingTime,
                contextUsed: data.contextUsed,
                embedding: data.embedding ? JSON.stringify(data.embedding) : null,
                isSuccessful: data.isSuccessful !== false,
                errorMessage: data.errorMessage ?? null,
                createdAt: new Date().toISOString()
            };

            const [inserted] = (await db.insert(userAiQueries).values(queryData).returning({ id: userAiQueries.id }));

            return inserted?.id ?? queryData.id;
        } catch (error: Error | unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('Query logging failed: ', msg);
            // Return a generated ID so flow doesn't break if logging fails
            return generateIdFromEntropySize(10);
        }
    }

    /**
     * Generate and store auto-tags
     */
    private async generateAutoTags(
        entityId: string,
        entityType: string,
        tags: string[],
        confidence: number
    ): Promise<void> {
        try {
            const tagData: NewAutoTag[] = tags.map(t => ({
                id: generateIdFromEntropySize(10),
                entityId: entityId,
                entityType: entityType, // Added missing property
                tag: t,
                confidence: String(confidence),
                source: 'ai_analysis',
                model: 'gemma3-legal:latest'
            } as any)); // Explicit cast to any to ensure type matching

            if (tagData.length > 0) {
                await db.insert(autoTags).values(tagData);
            }
        } catch (error: Error | unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('Auto-tag generation failed: ', msg);
            // Non-critical, just log and continue
        }
    }

    /**
     * Store document chunk for vector search
     */
    private async storeDocumentChunk(
        documentId: string,
        documentType: string,
        content: string,
        analysis: AIAnalysisResult
    ): Promise<void> {
        try {
            const embedding = await this.ollama.generateEmbedding(content);
            const embeddingString = JSON.stringify(embedding);

            const chunkData: any = {
                id: generateIdFromEntropySize(10),
                documentId: documentId,
                documentType: documentType || 'document',
                chunkIndex: 0,
                content: content.slice(0, 2000), // Truncate to safe limit
                embedding: embeddingString,
                metadata: {
                    analysis,
                    contentLength: content.length,
                    generatedAt: new Date().toISOString()
                }
            };

            await db.insert(documentChunks).values(chunkData);
        } catch (error: Error | unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('Document chunk storage failed: ', msg);
            throw error;
        }
    }

    /**
     * Calculate confidence score based on response and context
     */
    private calculateConfidence(response: string, contextCount: number): number {
        let confidence = 0.7; // Base confidence

        if (response.length > 500) confidence += 0.1;
        if (response.toLowerCase().includes('evidence') || response.toLowerCase().includes('statute')) confidence += 0.05;
        if (response.toLowerCase().includes('recommend') || response.toLowerCase().includes('suggest')) confidence += 0.05;

        confidence += Math.min(contextCount * 0.02, 0.15);

        return Math.min(confidence, 0.99);
    }

    /**
     * Parse AI analysis response if JSON parsing fails
     */
    private parseAnalysisResponse(response: string): AIAnalysisResult {
        return {
            summary: response.split('\n')[0] || 'Analysis completed',
            tags: this.extractTags(response),
            confidence: 0.75,
            entities: this.extractEntities(response),
            keywords: this.extractKeywords(response),
            recommendations: this.extractRecommendations(response)
        };
    }

    private extractTags(text: string): string[] {
        const tagPatterns = /(?:tag|category|classification)s?:? \s*([^\n]+)/gi;
        const matches = text.match(tagPatterns);
        return matches ? matches.flatMap(m => m
            .split(/[;,]/)
            .map(t => t.trim().toLowerCase())
            .filter(Boolean)
        ) : [];
    }

    private extractEntities(text: string): string[] {
        const entityPattern = /(?:entity|entities|person|organization)s?:? \s*([^\n]+)/gi;
        const matches = text.match(entityPattern);
        return matches ? matches.flatMap(m => m
            .split(/[;,]/)
            .map(t => t.trim())
            .filter(Boolean)
        ) : [];
    }

    private extractKeywords(text: string): string[] {
        const keywordPattern = /(?:keyword|key\s+word)s?:? \s*([^\n]+)/gi;
        const matches = text.match(keywordPattern);
        return matches ? matches.flatMap(m => m
            .split(/[;,]/)
            .map(t => t.trim())
            .filter(Boolean)
        ) : [];
    }

    private extractRecommendations(text: string): string[] {
        const recPattern = /(?:recommend|suggestion|advice)s?:? \s*([^\n]+)/gi;
        const matches = text.match(recPattern);
        return matches ? matches.map(m => m.trim()) : [];
    }

    /**
     * helper: cosine similarity between two numeric vectors
     */
    private computeCosineSimilarity(a: number[], b: number[]): number {
        let dot = 0;
        let na = 0;
        let nb = 0;
        for (let i = 0; i < a.length; i++) {
            const va = a[i] ?? 0;
            const vb = b[i] ?? 0;
            dot += va * vb;
            na += va * va;
            nb += vb * vb;
        }
        const denom = Math.sqrt(na) * Math.sqrt(nb);
        if (denom === 0) return 0;
        return dot / denom;
    }
}

// Export singleton instance
export const aiService = new AIService();
