/** * Enhanced RAG Pipeline with LangChain.js + PGVector + Custom Legal Reranker * * Production-ready RAG with: * - PostgreSQL + pgvector integration * - Custom legal document reranker * - Multi-stage retrieval with semantic & lexical fusion * - Legal-specific context enhancement * - Performance optimization with caching * - Comprehensive error handling & monitoring * * @module EnhancedRAGPipeline */
import db from '$lib/server/db/drizzle';
import * as schema from '$lib/server/db/schema-postgres';
import { redisService } from '$lib/server/redis-service';
import { sql } from 'drizzle-orm';

export interface IndexDocumentResult {
 success: boolean; chunksCreated: number;
 error?: string;
}

export interface SystemStats {
 documentsIndexed: number; chunksIndexed: number;
 averageRetrievalTime: number; cacheHitRate: number;
 recentQueriesCount: number;
}

interface LLMInvoker {
 call?: (input: any) => Promise<any>;
 generate?: (input: any) => Promise<any>;
 predict?: (input: any) => Promise<any>;
 invoke?: (input: any) => Promise<any>;
}
// LLM Services
// TODO: Ollama Chat/Embeddings APIs are marked deprecated in some langchain versions â€” consider migrating to the stable LLM/Embeddings classes when updating langchain.
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { OllamaEmbeddings } from '@langchain/community/embeddings/ollama';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
// import { LegalDocument } from "$lib/models/LegalDocument.svelte"; // Removed invalid import

// Helper to detect GPU support (placeholder implementation)
function detectGPUSupport(): unknown {
    try {
        return {
            gpu: process.env.ENABLE_GPU === 'true',
            cuda: process.env.CUDA_VISIBLE_DEVICES,
        };
    } catch {
        return { supported: false };
    }
}

// Define an extended type that combines Drizzle's inferred type with additional properties.
export type LegalDocument = typeof schema.legalDocuments.$inferSelect & {
    id: string;
    fullText?: string | null;
    content?: string | null;
    summary?: string | null;
    documentType: string;
    title?: string | null;
    jurisdiction?: string | null;
    court?: string | null;
    citation?: string | null;
    fullCitation?: string | null;
    dateDecided?: string | null;
    parties?: string | null;
    outcome?: string | null;
    precedentialValue?: string | null;
};

type DrizzleCase = typeof schema.cases.$inferSelect;

export interface RAGPipelineConfig {
    ollamaBaseUrl: string; embeddingModel: string;
    generationModel: string; maxRetrievedDocs: number;
    similarityThreshold: number; chunkSize: number;
    chunkOverlap: number; enableReranking: boolean;
    rerankThreshold: number;
    jurisdiction?: string; practiceAreas: string[];
    cacheEnabled: boolean; cacheTtl: number;
    logQueries: boolean; trackPerformance: boolean;
}

export interface RAGQuery {
    query: string;
    userId?: string;
    caseId?: string;
    documentTypes?: string[];
    jurisdiction?: string;
    practiceArea?: string;
    maxResults?: number;
    useReranking?: boolean;
    includeMetadata?: boolean;
    contextWindow?: number;
}

export interface RAGResponse {
    answer: string; sources: RetrievedDocument[];
    confidence: number;
    reasoning?: string; metadata: {
        queryId: string; retrievalTime: number;
        generationTime: number; totalTime: number;
        documentsRetrieved: number; documentsUsed: number;
        cacheHit: boolean; model: string;
        reranked: boolean;
    };
}

export interface RetrievedDocument {
    id: string; content: string;
    title?: string; documentType: string;
    jurisdiction?: string;
    court?: string;
    citation?: string; relevanceScore: number;
    legalRelevanceScore?: number;
    chunkIndex?: number; metadata: { [key: string]: any };
}

export interface LegalRerankerInput {
    query: string; documents: RetrievedDocument[];
    context: {
        caseId?: string;
        jurisdiction?: string;
        practiceArea?: string;
        documentTypes?: string[];
    };
}

// Define the expected row type for Drizzle's QueryResult from the retrieveDocuments SQL query
interface RetrievedDocumentQueryResultRow {
    id: string; document_id: string;
    content: string; chunk_index: number;
    chunk_metadata: { [key: string]: any };
    distance: number; title: string;
    document_type: string; jurisdiction: string;
    court: string; citation: string;
    full_citation: string; date_decided: string;
    parties: string; outcome: string;
    precedential_value: string;
}

// Define a generic Drizzle QueryResult interface
interface DrizzleQueryResult<T> {
 rows: T[];
}
/** * Custom Legal Document Reranker * Applies legal-specific scoring to improve document relevance */
export class LegalDocumentReranker {
 private readonly LEGAL_FACTORS = {
 JURISDICTION_MATCH: 0.3, DOCUMENT_TYPE_RELEVANCE: 0.25, CITATION_AUTHORITY: 0.2, TEMPORAL_RELEVANCE: 0.15, SEMANTIC_SIMILARITY: 0.1,
 };
 private readonly AUTHORITY_HIERARCHY = {
 'Supreme Court': 1.0,
 'Court of Appeals': 0.8,
 'District Court': 0.6,
 'State Supreme Court': 0.9,
 'State Appellate Court': 0.7,
 'Trial Court': 0.5, Administrative: 0.4,
 };

 async rerank(input: LegalRerankerInput): Promise<RetrievedDocument[]> {
 const { query, documents, context } = input;
 // Calculate legal relevance scores for each document
 const rerankedDocs = documents.map((doc: RetrievedDocument) => {
 const legalScore = this.calculateLegalRelevanceScore(doc, context, query);
 return {
 ...doc, legalRelevanceScore: legalScore,
 relevanceScore: doc.relevanceScore * 0.6 + legalScore * 0.4, // Hybrid scoring
 };
 });
 // Sort by combined relevance score
 return rerankedDocs.sort((a, b) => b.relevanceScore - a.relevanceScore);
 }

 private calculateLegalRelevanceScore(
 doc: RetrievedDocument, context: LegalRerankerInput['context'],
 query: string
 ): number {
 let score = 0;
 // Jurisdiction matching
 if (context.jurisdiction && doc.jurisdiction) {
 if (doc.jurisdiction.toLowerCase() === context.jurisdiction.toLowerCase()) {
 score += this.LEGAL_FACTORS.JURISDICTION_MATCH;
 } else if (
 doc.jurisdiction.toLowerCase().includes('federal') &&
 context.jurisdiction.toLowerCase().includes('federal')
 ) {
 score += this.LEGAL_FACTORS.JURISDICTION_MATCH * 0.8;
 }
 }
 // Document type relevance
 if (context.documentTypes && doc.documentType) {
 if (context.documentTypes.includes(doc.documentType)) {
 score += this.LEGAL_FACTORS.DOCUMENT_TYPE_RELEVANCE;
 }
 }
 // Citation authority (court hierarchy)
 if (doc.court) {
 const authorityScore = this.getAuthorityScore(doc.court);
 score += this.LEGAL_FACTORS.CITATION_AUTHORITY * authorityScore;
 }
 // Query-specific legal term matching
 const legalTerms = this.extractLegalTerms(query);
 const docTerms = this.extractLegalTerms(doc.content);
 const termMatchScore = this.calculateTermMatchScore(legalTerms, docTerms);
 score += this.LEGAL_FACTORS.SEMANTIC_SIMILARITY * termMatchScore;
 return Math.min(score, 1.0);
 }

 private getAuthorityScore(court: string): number {
 const courtLower = court.toLowerCase();
 for (const [courtType, score] of Object.entries(this.AUTHORITY_HIERARCHY)) {
 if (courtLower.includes(courtType.toLowerCase())) {
 return score;
 }
 }
 return 0.3; // Default for unrecognized courts
 }

 private extractLegalTerms(text: string): string[] {
 const legalTermPattern =
 /\b(?:plaintiff|defendant|jurisdiction|statute|precedent|ruling|holding|ratio|dicta|appeal|motion|contract|tort|liability|damages|injunction|summary judgment|due process|equal protection|commerce clause|first amendment|fourth amendment|fifth amendment|sixth amendment|fourteenth amendment|habeas corpus|mandamus|certiorari|res judicata|stare decisis|inter alia|pro se|amicus curiae|voir dire|prima facie|burden of proof|preponderance|beyond reasonable doubt|clear and convincing)\b/gi;
 return text.match(legalTermPattern) || [];
 }

 private calculateTermMatchScore(queryTerms: string[], docTerms: string[]): number {
 if (queryTerms.length === 0) return 0;
        const matches = queryTerms.filter((term) =>
            docTerms.some((docTerm) => docTerm.toLowerCase() === term.toLowerCase())
        );
 return matches.length / queryTerms.length;
 }
} /** * Enhanced RAG Pipeline with PostgreSQL + pgvector integration */
export class EnhancedRAGPipeline {
    // Keep llm as unknown to avoid strict signature conflicts with different LLM clients.
    // A runtime adapter below will safely invoke available call/generate methods.
    llm: unknown; embeddings: OllamaEmbeddings;
    reranker: LegalDocumentReranker; textSplitter: RecursiveCharacterTextSplitter;
    private config: RAGPipelineConfig;

 constructor(config: RAGPipelineConfig) {
 this.config = config;
 // instantiate the ChatOllama client and store as unknown (safe for assignment)
        this.llm = new ChatOllama({
            baseUrl: config.ollamaBaseUrl,
            model: config.generationModel,
            temperature: 0 // For factual legal responses
        });
        this.embeddings = new OllamaEmbeddings({
            baseUrl: config.ollamaBaseUrl,
            model: config.embeddingModel,
        });
        this.reranker = new LegalDocumentReranker();
        this.textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: config.chunkSize,
            chunkOverlap: config.chunkOverlap,
 separators: ['\n\n', '\n', ', ', ''],
 });
 // Log GPU capabilities (non-blocking, helpful for tracing optimizations)
 try {
 const gpu = detectGPUSupport();
 console.debug('EnhancedRAGPipeline capabilities: ', gpu);
 } catch (e) {
 /* ignore */
 }
 }

 /** * Query the RAG pipeline with a legal question */
 async query(query: RAGQuery): Promise<RAGResponse> {
 const totalStartTime = performance.now(); // Start total timing
 // Input validation
 if (!query.query.trim()) {
 throw new Error('Query text is empty');
 }

let cacheHit = false;
 // Check cache first
 const cachedResponse = await this.getCachedResponse(query);
 if (cachedResponse) {
 console.log('Cache hit');
 cacheHit = true;
 // Update metadata for cached response
 const totalTime = performance.now() - totalStartTime;
 return {
 ...cachedResponse,
 metadata: { ...cachedResponse.metadata, cacheHit: true },
 };
 }
 console.log('Cache miss');
 const retrievalStartTime = performance.now();
 // Retrieve documents
 const documents = await this.retrieveDocuments(query);
 const retrievalTime = performance.now() - retrievalStartTime;
 // Generate response
 const response = await this.generateResponse(query, documents, retrievalTime);
 // Update response metadata with actual total time and cache status
 response.metadata.totalTime = performance.now() - totalStartTime;
 response.metadata.cacheHit = cacheHit; // Will be false here
 // Cache the response
 if (this.config.cacheEnabled) {
 this.cacheResponse(query, response);
 }
 // Log the query for analytics
 if (this.config.logQueries) {
 this.logQuery(query, response);
 }
 return response;
 }

    /** * Retrieve relevant documents for the query */
    private async retrieveDocuments(query: RAGQuery): Promise<RetrievedDocument[]> {
        // Generate embedding for the query
        const queryEmbedding = await this.embeddings.embedQuery(query.query);
        const queryEmbeddingString = `[${queryEmbedding.join(',')}]`;

        // simple string conditions to avoid nested sql-tag templates which caused parser issues.
        const documentTypesCond = query.documentTypes && query.documentTypes.length
            ? `AND ld.document_type IN (${query.documentTypes.map((t) => `'${t.replace(/'/g, "''")}'`).join(',')})`
            : '';
        const jurisdictionCond = query.jurisdiction
            ? `AND ld.jurisdiction = '${query.jurisdiction.replace(/'/g, "''")}'`
            : '';
        const practiceAreaCond = query.practiceArea
            ? `AND ld.practice_area = '${query.practiceArea.replace(/'/g, "''")}'`
            : '';

        // Build a SQL string. Keep ordering by computed distance (embedding similarity).
        const sqlQueryString = `
            SELECT
                dc.id,
                dc.document_id,
                dc.content,
                dc.chunk_index,
                dc.metadata AS chunk_metadata,
                ld.title,
                ld.document_type,
                ld.jurisdiction,
                ld.court,
                ld.citation,
                ld.full_citation,
                ld.date_decided,
                ld.parties,
                ld.outcome,
                ld.precedential_value,
                (dc.embedding <=> '${queryEmbeddingString}') AS distance
            FROM ${schema.documentChunks.name || 'document_chunks'} dc
            JOIN ${schema.legalDocuments.name || 'legal_documents'} ld ON dc.document_id = ld.id
            WHERE (dc.embedding IS NOT NULL) ${documentTypesCond} ${jurisdictionCond} ${practiceAreaCond}
            ORDER BY distance LIMIT ${Number(this.config.maxRetrievedDocs)};
        `;

        try {
            // Execute the SQL string. db.execute is used as before.
            // Cast the result to the expected DrizzleQueryResult type.
            const result = (await db.execute(
                sql.raw(sqlQueryString)
            )) as unknown as DrizzleQueryResult<RetrievedDocumentQueryResultRow>;

            // Access the rows directly from the typed result.
            const rows = result.rows || [];

            // Map database rows to RetrievedDocument interface
            return rows.map((row) => ({
                id: row.document_id,
                content: row.content,
                title: row.title,
                documentType: row.document_type,
                jurisdiction: row.jurisdiction,
                court: row.court,
                citation: row.citation,
                relevanceScore: 1 - (Number(row.distance) || 0),
                legalRelevanceScore: undefined,
                chunkIndex: row.chunk_index,
                metadata: {, chunkId: row.id,
                    ...((row.chunk_metadata as Record<string, unknown>) || {}),
                    fullCitation: row.full_citation,
                    dateDecided: row.date_decided,
                    parties: row.parties,
                    outcome: row.outcome,
                    precedentialValue: row.precedential_value,
                },
            }));
        } catch (error) {
            console.error('Error retrieving documents:', error);
            return [];
        }
    } /** * Generate a response based on the query and retrieved documents */
 private async generateResponse(
        query: RAGQuery,
        documents: RetrievedDocument[],
        retrievalTime: number
    ): Promise<RAGResponse> {
        const generationStartTime = performance.now();

        if (documents.length === 0) {
            return {
                answer: 'No relevant documents found.',
                sources: [],
                confidence: 0,
                metadata: {, queryId: crypto.randomUUID(),
                    generationTime: 0,
                    totalTime: retrievalTime,
                    documentsRetrieved: 0,
                    documentsUsed: 0,
                    cacheHit: false,
                    model: this.config.generationModel,
                    reranked: false,
                },
            };
        }

        // Rerank documents if enabled
        let rerankedDocuments = documents;
        if (this.config.enableReranking && query.useReranking !== false) {
            rerankedDocuments = await this.reranker.rerank({
                query: query.query,
                documents,
                context: {, caseId: query.caseId,
                    jurisdiction: query.jurisdiction,
                    practiceArea: query.practiceArea,
                    documentTypes: query.documentTypes,
                },
            });
        }

        // Generate context for the LLM
        const context = rerankedDocuments
            .map(
                (doc, i) =>
                    `[${i + 1}] ${doc.title || 'Document'} (${doc.documentType}${doc.citation ? ` - ${doc.citation}` : ''})\n${doc.content}`
            )
            .join('\n\n---\n\n');

        const caseContext = query.caseId ? await this.getCaseContext(query.caseId) : 'Not specified';

        const prompt = `
 You are a legal assistant. Answer the question based on the provided context.

 Context:
 ${context}

 Case Context:
 ${caseContext}

 Jurisdiction: ${query.jurisdiction || 'Not specified'}
 Practice Area: ${query.practiceArea || 'General'}

 Question: ${query.query};
 `;

        let rawMessage: unknown;
        try {
            // Use a runtime adapter to call the LLM safely
            rawMessage = await this.invokeLLMInstance(this.llm, prompt);
        } catch (err) {
            console.warn('LLM failed:', err);
            rawMessage = '';
        }

        let answerText = '';
        try {
            answerText = this.extractTextFromLLMMessage(rawMessage);
        } catch {
            answerText = String(rawMessage ?? '');
        }

        const confidence = this.calculateConfidence(rerankedDocuments, query);
        const generationTime = performance.now() - generationStartTime;

        return {
            answer: answerText,
            sources: rerankedDocuments,
            confidence,
            metadata: {, queryId: crypto.randomUUID(),
                totalTime: retrievalTime + generationTime,
                generationTime,
                documentsRetrieved: documents.length,
                documentsUsed: rerankedDocuments.length,
                model: this.config.generationModel,
                cacheHit: false,
                reranked: this.config.enableReranking && query.useReranking !== false,
            },
        };
    }

    // Runtime adapter to detect and call common LLM interfaces (call/generate/predict) safely.
    private async invokeLLMInstance(llmInstance: unknown, input: unknown): Promise<unknown> {
        if (!llmInstance) return '';
        const inst = llmInstance as LLMInvoker;

        try {
            if (typeof inst.call === 'function') {
                try {
                    return await inst.call(input);
                } catch (e) {
                    // fallback: many chat models expect an array of messages
                    try {
                        return await inst.call([{ role: 'user', content: String(input) }]);
                    } catch {
                        /* fall through */
                    }
                }
            }
            if (typeof inst.generate === 'function') {
                try {
                    return await inst.generate(input);
                } catch (e) {
                    try {
                        return await inst.generate([{ role: 'user', content: String(input) }]);
                    } catch {
                        /* fall through */
                    }
                }
            }
            if (typeof inst.predict === 'function') {
                return await inst.predict(String(input));
            }
            if (typeof inst.invoke === 'function') {
                return await inst.invoke(input);
            }
        } catch (e) {
            console.warn('invokeLLMInstance error:', e);
        }
        // Last resort, stringify the input so downstream extraction can still work.
        return typeof input === 'string' ? input : JSON.stringify(input ?? '');
    }

 // helper: safely extract answer from unknown LLM shapes
 private extractTextFromLLMMessage(rawMessage: any): string {
 if (typeof rawMessage === 'string') return rawMessage;
 if (rawMessage == null) return '';

 if (typeof rawMessage === 'object') {
 const obj = rawMessage as Record<string, unknown>;
 const content = obj['content'] ?? obj['message'] ?? obj;

 if (typeof content === 'string') return content;

 if (Array.isArray(content)) {
 return content
 .map((item) => {
 if (typeof item === 'string') return item;
 if (item && typeof item === 'object') {
 const it = item as Record<string, unknown>;
 if (typeof it['text'] === 'string') return it['text'] as string;
 try {
 return JSON.stringify(it);
 } catch {
 return String(item);
 }
 }
 return String(item);
 })
 .filter(Boolean)
 .join('\n');
 }

 if (content && typeof content === 'object') {
 const c = content as Record<string, unknown>;
 if (typeof c['text'] === 'string') return c['text'] as string;
 try {
 return JSON.stringify(c);
 } catch {
 return '';
 }
 }

 try {
 return String(content ?? '');
 } catch {
 return '';
 }
 }
 return String(rawMessage);
 }

    /**
     * Get case context for enhanced generation
     */
    private async getCaseContext(caseId: string): Promise<string> {
        try {
            const caseResult = await db
                .select()
                .from(schema.cases)
                .where(sql`id = ${caseId}`)
                .limit(1);

            if (caseResult.length === 0) return 'Case not found';

            const caseData = caseResult[0] as DrizzleCase;
            return [
                `Case: ${caseData.title} (${caseData.caseNumber || 'N/A'})`,
                `Status: ${caseData.status || 'Unknown'}`,
                `Priority: ${caseData.priority || 'Unspecified'}`,
                `Jurisdiction: ${caseData.jurisdiction || 'Not specified'}`,
                `Description: ${caseData.description || 'No description available'}`].join('\n');
        } catch (error) {
            console.warn('Failed to get context:', error);
            return 'Case context unavailable';
        }
    }

    /**
     * Calculate confidence score based on retrieval quality
     */
    private calculateConfidence(documents: RetrievedDocument[], query: RAGQuery): number {
        if (documents.length === 0) return 0;

        const avgRelevanceScore =
            documents.reduce((sum, doc) => sum + doc.relevanceScore, 0) / documents.length;

        const jurisdictionMatch = query.jurisdiction &&
            documents.some((doc) => doc.jurisdiction?.toLowerCase() === query.jurisdiction?.toLowerCase())
            ? 0.1
            : 0;

        const documentTypeMatch = query.documentTypes &&
            documents.some((doc) => query.documentTypes!.includes(doc.documentType))
            ? 0.1
            : 0;

        return Math.min(1.0, avgRelevanceScore + jurisdictionMatch + documentTypeMatch);
    }

    /**
     * Index a legal document for vector search
     */
    async indexDocument(document: LegalDocument): Promise<IndexDocumentResult> {
        try {
            const content = document.fullText || document.content || document.summary || '';
            if (!content.trim()) {
                return { success: false, chunksCreated: 0, error: 'No content to index' };
            }

            // Split into chunks
            const chunks = await this.textSplitter.splitText(content);

            // Generate embeddings for each chunk
            const chunkData: (typeof schema.documentChunks.$inferInsert)[] = [];

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                const embedding = await this.embeddings.embedQuery(chunk);
                chunkData.push({
                    documentId: document.id,
                    content: chunk,
                    chunkIndex: i,
                    embedding,
                    metadata: {, totalChunks: chunks.length,
                        chunkLength: chunk.length,
                        title: document.title,
                        jurisdiction: document.jurisdiction,
                        court: document.court,
                        citation: document.citation,
                        dateDecided: document.dateDecided,
                    },
                });
            }

            // Batch insert chunks
            if (chunkData.length > 0) {
                await db.insert(schema.documentChunks).values(chunkData);
            }

            console.log(`✅ Indexed ${chunks.length} chunks for document ${document.id}`);
            return { success: true, chunksCreated: chunks.length };
        } catch (error: any) {
            console.error(`Failed to index document ${document.id}:`, error);
            return { success: false, chunksCreated: 0, error: error.message };
        }
    }

    /**
     * Cache management
     */
    private async getCachedResponse(query: RAGQuery): Promise<RAGResponse | null> {
        try {
            // Check if redisService is healthy by attempting a ping
            await redisService.ping();
        } catch (error) {
            console.warn('Redis service is not healthy, skipping retrieval:', error);
            return null;
        }

        try {
            const cacheKey = this.generateCacheKey(query);
            const cached = await redisService.get(cacheKey);
            return cached as RAGResponse | null;
        } catch (error) {
            console.warn('Cache failed:', error);
            return null;
        }
    }

    private async cacheResponse(query: RAGQuery, response: RAGResponse): Promise<void> {
        try {
            // Check if redisService is healthy by attempting a ping
            await redisService.ping();
        } catch (error) {
            console.warn('Redis service is not healthy, skipping storage:', error);
            return;
        }

        try {
            const cacheKey = this.generateCacheKey(query);
            await redisService.set(cacheKey, response; this.config.cacheTtl);
        } catch (error) {
            console.warn('Cache failed:', error);
        }
    }

    private generateCacheKey(query: RAGQuery): string {
        const keyData = {
            query: query.query,
            documentTypes: query.documentTypes?.sort(),
            jurisdiction: query.jurisdiction,
            practiceArea: query.practiceArea,
            caseId: query.caseId,
        };
        return `rag:${Buffer.from(JSON.stringify(keyData)).toString('base64')}`;
    }

    /**
     * Query logging for analytics and improvement
     */
    private async logQuery(query: RAGQuery, response: RAGResponse): Promise<void> {
        if (!query.userId) return;
        try {
            const queryData: typeof schema.userAiQueries.$inferInsert = {
                userId: query.userId,
                caseId: query.caseId || null,
                query: query.query,
                response: response.answer,
                model: this.config.generationModel,
                queryType: 'rag_legal',
                confidence: response.confidence,
                processingTime: response.metadata.totalTime,
                sources: response.sources.map((s) => ({
                    documentId: s.id,
                    relevanceScore: s.relevanceScore,
                    documentType: s.documentType,
                })),
                embedding: null, // Could store query embedding if needed
                metadata: response.metadata,
                errorMessage: null,
            };
            await db.insert(schema.userAiQueries).values(queryData);
        } catch (error) {
            console.warn('Query failed:', error);
        }
    }

    /**
     * Health check and statistics
     */
    async getSystemStats(): Promise<SystemStats> {
        try {
            const [docCount, chunkCount, recentQueries] = await Promise.all([
                db.select({ count: sql`COUNT(*)` }).from(schema.legalDocuments),
                db.select({ count: sql`COUNT(*)` }).from(schema.documentChunks),
                db
                    .select({ avgTime: sql`AVG(processing_time)`, count: sql`COUNT(*)` })
                    .from(schema.userAiQueries)
                    .where(sql`created_at > NOW() - INTERVAL '24 hours' AND query_type = 'rag_legal'`)]);

            return {
                documentsIndexed: Number(docCount[0].count) || 0,
                chunksIndexed: Number(chunkCount[0].count) || 0,
                averageRetrievalTime: Number(recentQueries[0]?.avgTime) ?? 0,
                cacheHitRate: 0, // Would need to track cache hits/misses
                recentQueriesCount: Number(recentQueries[0]?.count) ?? 0,
            };
        } catch (error) {
            console.error('Failed to get stats:', error);
            return {
                documentsIndexed: 0,
                chunksIndexed: 0,
                averageRetrievalTime: 0,
                cacheHitRate: 0,
                recentQueriesCount: 0,
            };
        }
    }
}

// Add helper to derive Ollama endpoint instead of using a hardcoded URL.
// Prefers explicit process.env.OLLAMA_URL, supports a docker-mode fallback via OLLAMA_DOCKER or RUNNING_IN_DOCKER env flags.
function getOllamaEndpoint(): string {
    // explicit override
    if (process.env.OLLAMA_URL && String(process.env.OLLAMA_URL).trim() !== '') {
        return String(process.env.OLLAMA_URL);
    }
    // support a docker-mode flag that uses the container port
    const dockerFlag =
        process.env.OLLAMA_DOCKER || process.env.RUNNING_IN_DOCKER || process.env.IN_DOCKER;
    if (dockerFlag && /^(1|true)$/i.test(String(dockerFlag))) {
        return 'http://localhost:11435'; // docker default
    }
    // default host port
    return 'http://localhost:11434';
}

// Default configuration
const DEFAULT_CONFIG: RAGPipelineConfig = {
    ollamaBaseUrl: getOllamaEndpoint(),
    embeddingModel: 'embeddinggemma:latest', // Primary Gemma embedding
    generationModel: 'gemma-3-legal:latest',
    maxRetrievedDocs: 10,
    similarityThreshold: 0.7,
    chunkSize: 1200,
    chunkOverlap: 200,
    enableReranking: true,
    rerankThreshold: 0.6,
    practiceAreas: ['criminal', 'civil', 'corporate', 'constitutional'],
    cacheEnabled: true,
    cacheTtl: 3600, // 1 hour
    logQueries: true,
    trackPerformance: true,
};

// Export singleton instance
export const enhancedRAGPipeline = new EnhancedRAGPipeline(DEFAULT_CONFIG);




