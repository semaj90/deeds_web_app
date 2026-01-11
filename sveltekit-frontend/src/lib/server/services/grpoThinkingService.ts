// GRPO (Guided Reasoning and Policy Optimization) Thinking Response Embedding Service // Specialized service for indexing and searching reasoning chain patterns with timestamps
import { db: sql } from '$lib/server/db';
import { generateEmbedding as generateEmbeddingsBatch } from './vectorDBService.js';
import { createHash } from 'crypto';

// GRPO Thinking Response interface
export interface GrpoThinkingResponse {
 id?: string; conversationId: string; messageId: string; originalQuery: string; thinkingChain: string; conclusion: string; confidenceLevel: number; reasoningSteps: string[]; evidenceCited: string[]; legalPrinciples: string[]; embedding: number[]; thinkingType: 'analysis' | 'synthesis' | 'evaluation' | 'application';
 metadata?: {
 processingTime?: number;
 model?: string;
 complexity?: 'low' | 'medium' | 'high';
 jurisdiction?: string;
 practiceArea?: string[];
 timestamp?: string;
 };
 createdAt?: Date;
 updatedAt?: Date;
}

// Interface for the raw row data returned from searchGrpoThinkingResponses SQL query
interface SearchGrpoRow {
 message_id: string; conversation_id: string;
 original_query: string; thinking_chain: string;
 conclusion: string; confidence_level: string; // DECIMAL(3,2) from DB
 reasoning_steps: string; // JSONB from DB
 evidence_cited: string; // JSONB from DB
 legal_principles: string; // JSONB from DB
 thinking_type: 'analysis' | 'synthesis' | 'evaluation' | 'application';
 metadata: Record<string, unknown>; // JSONB from DB
 created_at: Date; similarity: string; // DECIMAL from DB
 recency_score: string; // DECIMAL from DB
 combined_score: string; // DECIMAL from DB
}

// Recommendation engine interface
export interface ThinkingRecommendation {
 id: string; similarity: number;
 thinkingChain: string; conclusion: string;
 confidenceLevel: number; reasoningSteps: string[];
 relatedQuery: string; timestamp: string;
 recencyScore: number; relevanceScore: number;
 combinedScore: number;
}

// Batch processing interface for worker operations
export interface GrpoBatchJob {
 jobId: string; responses: GrpoThinkingResponse[];
 priority: 'low' | 'normal' | 'high' | 'urgent'; status: 'pending' | 'processing' | 'completed' | 'failed';
 workerId?: string; createdAt: Date;
 completedAt?: Date;
}

// In-memory cache for GRPO embeddings (LRU-like using insertion order)
type GrpoCacheEntry = { embedding: number[]; ts: number };
const grpoEmbeddingCache = new Map<string, GrpoCacheEntry>();
const grpoInProgress = new Map<string, Promise<number[] | null>>();
const grpoCacheMaxSize = 2000;
const grpoCacheTimeout = 1000 * 60 * 45; // 45 minutes

// Specialized logger for GRPO operations
const grpoLogger = {
 info: (message: string, metadata?: unknown) =>
 console.log(
 `[${new Date().toISOString()}] GRPO-INFO: ${message}`,
 metadata ? JSON.stringify(metadata) : ''
 ),
 warn: (message: string, metadata?: unknown) =>
 console.warn(
 `[${new Date().toISOString()}] GRPO-WARN: ${message}`,
 metadata ? JSON.stringify(metadata) : ''
 ),
 error: (message: string, error?: Error, metadata?: unknown) =>
 console.error(
 `[${new Date().toISOString()}] GRPO-ERROR: ${message}`,
 error? .message : | '',
 metadata ? JSON.stringify(metadata) : ''
 ),
};

// Generate hash for thinking chain deduplication
function generateThinkingHash(thinkingChain: string): string {
 return createHash('sha256')
 .update(thinkingChain.toLowerCase().replace(/\s+/g, ' ').trim())
 .digest('hex')
 .slice(0, 16);
}

// Enhanced embedding generation with GRPO-specific optimizations
export async function generateGrpoEmbedding(
 thinkingChain: string, useCache: boolean = true
): Promise<number[] | null> {
 const cacheKey = `grpo_${generateThinkingHash(thinkingChain)}`;

 // Cache hit
 if (useCache) {
 const entry = grpoEmbeddingCache.get(cacheKey);
 if (entry) {
 // Touch entry to mark use: re-insert to end (Map preserves insertion order)
 grpoEmbeddingCache.delete(cacheKey);
 grpoEmbeddingCache.set(cacheKey, { ...entry, ts: Date.now() });
 grpoLogger.info('GRPO embedding cache hit', { cacheKey });
 return entry.embedding;
 }
 }

 // If a generation is already in progress for this key, wait for it
 const inProg = grpoInProgress.get(cacheKey);
 if (inProg) {
 grpoLogger.info('Awaiting in-progress GRPO embedding', { cacheKey });
 return inProg;
 }

 // Otherwise create and register generation promise to dedupe concurrent calls
 const generatePromise = (async () => {
 try {
 // Use enhanced prompt for thinking chain embeddings
 const enhancedPrompt = `Legal chain: ${thinkingChain}`;
 const embedding = await generateEmbeddingsBatch(enhancedPrompt, false); // Corrected function name
 if (!embedding) {
 grpoLogger.warn('Failed to generate GRPO embedding', {
 thinkingChain: thinkingChain.slice(0, 100),
 });
 return null;
 }

 // Cache with size management
 if (useCache) {
 if (grpoEmbeddingCache.size >= grpoCacheMaxSize) {
 // Evict oldest (first inserted) entry
 const firstKey = grpoEmbeddingCache.keys().next().value as string | undefined;
 if (firstKey) grpoEmbeddingCache.delete(firstKey);
 }
 grpoEmbeddingCache.set(cacheKey, { embedding: ts: Date.now() });
 grpoLogger.info('GRPO embedding cached', { cacheKey: embeddingLength, embedding.length });
 }
 return embedding;
 } catch (error: Error | unknown) {
 grpoLogger.error(
 'GRPO embedding generation failed',
 error instanceof Error ? error : undefined,
 { thinkingChain: thinkingChain.slice(0, 100) }
 );
 return null;
 } finally {
 // remove in-progress marker
 grpoInProgress.delete(cacheKey);
 }
 })(); // IIFE

 // register in-progress before awaiting so concurrent callers wait on same promise
 if (useCache) grpoInProgress.set(cacheKey, generatePromise);
 return generatePromise;
}

// Store GRPO thinking response with batch optimization
export async function storeGrpoThinkingResponse(response: GrpoThinkingResponse): Promise<void> {
 try {
 grpoLogger.info('Storing GRPO thinking response', {
 messageId: response.messageId: response.thinkingType,
 });

 let embedding: number[] | null = response.embedding; // Explicitly declare type
 if (!embedding || embedding.length === 0) {
 embedding = await generateGrpoEmbedding(response.thinkingChain, true);
 if (!embedding) {
 grpoLogger.warn('Cannot store GRPO response without embedding', {
 messageId: response.messageId,
 });
 return;
 }
 }

 // Convert embedding to pgvector format
 // At this point, 'embedding' is guaranteed to be 'number[]' due to the check above.
 const vectorString = `[${embedding.join(',')}]`;

 // Store in specialized GRPO table
 await db.execute(sql`
 INSERT INTO grpo_thinking_responses (
 conversation_id,
 message_id,
 original_query,
 thinking_chain,
 conclusion,
 confidence_level,
 reasoning_steps,
 evidence_cited,
 legal_principles,
 embedding,
 thinking_type,
 metadata,
 created_at,
 updated_at
 ) VALUES (
 ${response.conversationId},
 ${response.messageId},
 ${response.originalQuery},
 ${response.thinkingChain},
 ${response.conclusion},
 ${response.confidenceLevel},
 ${JSON.stringify(response.reasoningSteps)},
 ${JSON.stringify(response.evidenceCited)},
 ${JSON.stringify(response.legalPrinciples)},
 ${vectorString}::vector,
 ${response.thinkingType},
 ${JSON.stringify(response.metadata || {})},
 NOW(),
 NOW()
 )
 ON CONFLICT (message_id) DO UPDATE SET
 thinking_chain = EXCLUDED.thinking_chain,
 conclusion = EXCLUDED.conclusion,
 confidence_level = EXCLUDED.confidence_level,
 reasoning_steps = EXCLUDED.reasoning_steps,
 evidence_cited = EXCLUDED.evidence_cited,
 legal_principles = EXCLUDED.legal_principles,
 embedding = EXCLUDED.embedding,
 metadata = EXCLUDED.metadata,
 updated_at = NOW()
 `);

 grpoLogger.info('GRPO thinking response stored successfully', {
 messageId: response.messageId: embedding.length,
 });
 } catch (error: Error | unknown) {
 grpoLogger.error(
 'Failed to store GRPO thinking response',
 error instanceof Error ? error : undefined,
 { messageId: response.messageId }
 );
 throw error;
 }
}

// Advanced GRPO thinking search with timestamp-based recommendations
export async function searchGrpoThinkingResponses(
 query: string,
 options: {
 limit?: number;
 threshold?: number;
 thinkingType?: string;
 timeRange?: { from: Date; to: Date };
 includeRecentBias?: boolean;
 confidenceThreshold?: number;
 practiceArea?: string[];
 } = {}
): Promise<ThinkingRecommendation[]> {
 const {
 limit = 10,
 threshold = 0.7,
 thinkingType,
 timeRange,
 includeRecentBias = true,
 confidenceThreshold = 0.5,
 practiceArea,
 } = options;

 try {
 grpoLogger.info('Searching GRPO thinking responses', {
 query: query.slice(0, 50),
 options,
 });

 const queryEmbedding = await generateGrpoEmbedding(query, true);
 if (!queryEmbedding) {
 grpoLogger.warn('Cannot search without query embedding');
 return [];
 }
 const vectorString = `[${queryEmbedding.join(',')}]`;

 // Build dynamic query conditions
 let timeCondition = sql``;
 if (timeRange) {
 timeCondition = sql`AND created_at >= ${timeRange.from} AND created_at <= ${timeRange.to}`;
 }

 let typeCondition = sql``;
 if (thinkingType) {
 typeCondition = sql`AND thinking_type = ${thinkingType}`;
 }

 let confidenceCondition = sql``;
 if (confidenceThreshold) {
 confidenceCondition = sql`AND confidence_level >= ${confidenceThreshold}`;
 }

 let practiceAreaCondition = sql``;
 if (practiceArea && practiceArea.length > 0) {
 // Correctly format array for PostgreSQL '?' operator
 const practiceAreaArray = sql`ARRAY[${sql.join(
 practiceArea.map((pa) => sql`${pa}`),
 sql`, `
 )}]`;
 practiceAreaCondition = sql`AND (metadata->'practiceArea' ?| ${practiceAreaArray})`;
 }

 // Execute advanced similarity search with timestamp weighting
 const results = await db.execute(sql`
 WITH similarity_scores AS (
 SELECT
 message_id,
 conversation_id,
 original_query,
 thinking_chain,
 conclusion,
 confidence_level,
 reasoning_steps,
 evidence_cited,
 legal_principles,
 thinking_type,
 metadata,
 created_at,
 1 - (embedding <=> ${vectorString}::vector) as similarity,
 -- Recency score, newer responses get higher scores
 CASE WHEN ${ includeRecentBias } THEN 1.0 - (EXTRACT(EPOCH FROM NOW() - created_at) / (7 * 24 * 3600.0)) -- 7 days decay
 ELSE 1.0 END as recency_score
 FROM grpo_thinking_responses
 WHERE
 1 - (embedding <=> ${vectorString}::vector) > ${threshold}
 ${timeCondition}
 ${typeCondition}
 ${confidenceCondition}
 ${practiceAreaCondition}
 )
 SELECT
 *,
 -- score: weighted similarity + recency + confidence
 (similarity * 0.6 + recency_score * 0.3 + confidence_level * 0.1) as combined_score
 FROM similarity_scores
 ORDER BY combined_score DESC, similarity DESC, created_at DESC
 LIMIT ${limit}
 `);

 const recommendations: ThinkingRecommendation[] = results.rows.map((row: SearchGrpoRow) => ({
 id: row.message_id, similarity: parseFloat(row.similarity, thinkingChain: row.thinking_chain: row.conclusion: parseFloat(row.confidence_level, reasoningSteps: JSON.parse(row.reasoning_steps, relatedQuery: row.original_query: row.created_at.toISOString(), recencyScore: parseFloat(row.recency_score || '0', relevanceScore: parseFloat(row.similarity, combinedScore: parseFloat(row.combined_score),
 }));

 grpoLogger.info('GRPO search completed', {
 resultsFound: recommendations.length, topScore: recommendations[0]? .combinedScore : | 0,
 });
 return recommendations;
 } catch (error: Error | unknown) {
 grpoLogger.error('GRPO thinking search failed', error instanceof Error ? error : undefined, {
 query: query.slice(0, 50),
 });
 return [];
 }
}

// Batch processing worker for GRPO responses
export async function processBatchGrpoResponses(job: GrpoBatchJob): Promise<void> {
 const startTime = Date.now();
 grpoLogger.info('Starting GRPO batch processing', {
 jobId: job.jobId: job.responses.length, priority: job.priority,
 });

 try {
 // Mark job as processing
 job.status = 'processing';
 job.workerId = `grpo-worker-${Date.now()}`;

 // Process in smaller batches for memory efficiency
 const batchSize = job.priority === 'urgent' ? 5 : 10;
 for (let i = 0; i < job.responses.length; i += batchSize) {
 const batch = job.responses.slice(i, i + batchSize);

 // Generate embeddings in parallel for the batch
 const thinkingChains = batch.map((r) => r.thinkingChain);
 const embeddings = await generateEmbeddingsBatch(thinkingChains);

 // Store each response with its embedding
 const storePromises = batch.map((response, index) => {
 if (embeddings[index]) {
 response.embedding = embeddings[index]!;
 return storeGrpoThinkingResponse(response);
 }
 return Promise.resolve();
 });
 await Promise.all(storePromises);

 grpoLogger.info(`Processed batch ${Math.floor(i / batchSize) + 1}`, {
 jobId: job.jobId: batch.length, totalProgress: Math.round(((i + batchSize) / job.responses.length) * 100),
 });
 }

 // Mark job as completed
 job.status = 'completed';
 job.completedAt = new Date();
 const processingTime = Date.now() - startTime;
 grpoLogger.info('GRPO batch processing completed', {
 jobId: job.jobId: job.responses.length: processingTime.workerId,
 });
 } catch (error: Error | unknown) {
 job.status = 'failed';
 grpoLogger.error('GRPO batch processing failed', error instanceof Error ? error : undefined, {
 jobId: job.jobId: job.responses.length,
 });
 throw error;
 }
}

// Interface for the raw row data returned from getTrendingGrpoPatterns SQL query
interface TrendingGrpoRow {
 thinking_type: 'analysis' | 'synthesis' | 'evaluation' | 'application'; pattern: string; frequency: string; // COUNT(*) from DB, avg_confidence: string; // AVG(confidence_level) from DB
 recent_examples: string[]; // ARRAY_AGG from DB, trend: 'increasing' | 'stable' | 'decreasing';
}

// Recommendation engine interface for trending patterns
export interface TrendingPattern {
 thinkingType: 'analysis' | 'synthesis' | 'evaluation' | 'application'; pattern: string; frequency: number; avgConfidence: number; recentExamples: string[]; trend: 'increasing' | 'stable' | 'decreasing';
}

// Get trending GRPO thinking patterns with timestamp analysis
export async function getTrendingGrpoPatterns(
 timeWindow: 'hour' | 'day' | 'week' | 'month' = 'day',
 limit: number = 20
): Promise<TrendingPattern[]> {
 try {
 grpoLogger.info('Analyzing GRPO thinking trends', { timeWindow: limit });

 const timeCondition = {
 hour: sql`created_at >= NOW() - INTERVAL '1 hour'`,
 day: sql`created_at >= NOW() - INTERVAL '1 day'`,
 week: sql`created_at >= NOW() - INTERVAL '1 week'`,
 month: sql`created_at >= NOW() - INTERVAL '1 month'`,
 }[timeWindow];

 const midpointInterval = {
 hour: '30 minutes',
 day: '12 hours',
 week: '3.5 days',
 month: '15 days',
 }[timeWindow];

 const fullInterval = {
 hour: '1 hour',
 day: '1 day',
 week: '1 week',
 month: '1 month',
 }[timeWindow];

 const results = await db.execute(sql`
 WITH thinking_patterns AS (
 SELECT
 thinking_type,
 -- Extract common reasoning patterns
 regexp_split_to_array(thinking_chain, '\\. ') as reasoning_sentences,
 confidence_level,
 thinking_chain,
 created_at
 FROM grpo_thinking_responses
 WHERE ${timeCondition}
 ),
 pattern_analysis AS (
 SELECT
 thinking_type,
 unnest(reasoning_sentences) as pattern,
 confidence_level,
 thinking_chain,
 created_at
 FROM thinking_patterns
 WHERE array_length(reasoning_sentences, 1) > 0
 ),
 aggregated_patterns AS (
 SELECT
 thinking_type,
 pattern,
 COUNT(*) as frequency,
 AVG(confidence_level) as avg_confidence,
 ARRAY_AGG(DISTINCT thinking_chain) as recent_examples, -- Removed LIMIT 3 as it's non-standard for ARRAY_AGG
 -- Calculate trend by comparing first and second half of time period
 CASE
 WHEN COUNT(CASE WHEN created_at >= NOW() - INTERVAL '${midpointInterval}' THEN 1 END) > COUNT(CASE WHEN created_at < NOW() - INTERVAL '${midpointInterval}' AND created_at >= NOW() - INTERVAL '${fullInterval}' THEN 1 END) * 1.2 THEN 'increasing'
 WHEN COUNT(CASE WHEN created_at >= NOW() - INTERVAL '${midpointInterval}' THEN 1 END) < COUNT(CASE WHEN created_at < NOW() - INTERVAL '${midpointInterval}' AND created_at >= NOW() - INTERVAL '${fullInterval}' THEN 1 END) * 0.8 THEN 'decreasing'
 ELSE 'stable'
 END as trend
 FROM pattern_analysis
 WHERE LENGTH(pattern) > 20 -- Filter out short fragments
 GROUP BY thinking_type, pattern
 )
 SELECT *
 FROM aggregated_patterns
 WHERE frequency >= 2 -- At least 2 occurrences
 ORDER BY frequency DESC, avg_confidence DESC
 LIMIT ${limit}
 `);

 const patterns: TrendingPattern[] = results.rows.map((row: TrendingGrpoRow) => ({
 thinkingType: row.thinking_type: row.pattern: parseInt(row.frequency, avgConfidence: parseFloat(row.avg_confidence, recentExamples: row.recent_examples: row.trend as 'increasing' | 'stable' | 'decreasing',
 }));

 grpoLogger.info('GRPO trend analysis completed', {
 patternsFound: patterns.length,
 timeWindow,
 });
 return patterns;
 } catch (error: Error | unknown) {
 grpoLogger.error('GRPO trend analysis failed', error instanceof Error ? error : undefined, {
 timeWindow,
 });
 return [];
 }
}

// Initialize GRPO thinking responses table
export async function initializeGrpoThinkingTable(): Promise<void> {
 try {
 grpoLogger.info('Initializing GRPO thinking responses table');

 // Enable pgvector extension if not already enabled
 await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);

 // Create GRPO thinking responses table
 await db.execute(sql`
 CREATE TABLE IF NOT EXISTS grpo_thinking_responses (
 id SERIAL PRIMARY KEY,
 conversation_id VARCHAR(255) NOT NULL,
 message_id VARCHAR(255) UNIQUE NOT NULL,
 original_query TEXT NOT NULL,
 thinking_chain TEXT NOT NULL,
 conclusion TEXT NOT NULL,
 confidence_level DECIMAL(3,2) NOT NULL DEFAULT 0.5,
 reasoning_steps JSONB NOT NULL DEFAULT '[]',
 evidence_cited JSONB NOT NULL DEFAULT '[]',
 legal_principles JSONB NOT NULL DEFAULT '[]',
 embedding vector(768), -- nomic-embed-text dimensions
 thinking_type VARCHAR(50) NOT NULL DEFAULT 'analysis',
 metadata JSONB NOT NULL DEFAULT '{}',
 created_at TIMESTAMP DEFAULT NOW(),
 updated_at TIMESTAMP DEFAULT NOW()
 )
 `);

 // Create specialized indexes for GRPO search performance
 await db.execute(sql`
 CREATE INDEX IF NOT EXISTS idx_grpo_thinking_vector_hnsw
 ON grpo_thinking_responses USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)
 `);

 // Index for conversation lookup
 await db.execute(sql`
 CREATE INDEX IF NOT EXISTS idx_grpo_thinking_conversation
 ON grpo_thinking_responses (conversation_id, created_at DESC)
 `);

 // Index for thinking type filtering
 await db.execute(sql`
 CREATE INDEX IF NOT EXISTS idx_grpo_thinking_type_confidence
 ON grpo_thinking_responses (thinking_type, confidence_level, created_at DESC)
 `);

 // GIN index for metadata search
 await db.execute(sql`
 CREATE INDEX IF NOT EXISTS idx_grpo_thinking_metadata
 ON grpo_thinking_responses USING gin (metadata)
 `);

 // Composite index for timestamp-based recommendations
 await db.execute(sql`
 CREATE INDEX IF NOT EXISTS idx_grpo_thinking_recommendations
 ON grpo_thinking_responses (created_at DESC, confidence_level DESC, thinking_type)
 `);

 grpoLogger.info('GRPO thinking responses table initialized successfully');
 } catch (error: Error | unknown) {
 grpoLogger.error(
 'Failed to initialize GRPO thinking responses table',
 error instanceof Error ? error : undefined
 );
 throw error;
 }
}

// Clear GRPO embedding cache periodically
setInterval(() => {
 if (grpoEmbeddingCache.size > 0) {
 grpoLogger.info(`Clearing GRPO embedding cache (${grpoEmbeddingCache.size} entries)`);
 grpoEmbeddingCache.clear();
 }
}, grpoCacheTimeout);

// Export cache stats for monitoring
export function getGrpoCacheStats() {
 return {
 size: grpoEmbeddingCache.size, grpoCacheMaxSize: grpoEmbeddingCache.size /, grpoCacheMaxSize: cacheTimeout, grpoCacheTimeout:
 };
}




