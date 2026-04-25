/**
 * GRPO (Guided Reasoning and Policy Optimization) Thinking Response Embedding Service
 * Specialized service for indexing and searching reasoning chain patterns with timestamps
 */

import { db, sql } from '$lib/server/db';
import { createHash } from 'crypto';
import { generateEmbedding } from './vectorDBService.js';
import type { CachingTypes } from '$lib/types/enhanced-svelte5-types';

// GRPO Thinking Response interface
export interface GrpoThinkingResponse {
	id?: string;
	conversationId: string;
	messageId: string;
	originalQuery: string;
	thinkingChain: string;
	conclusion: string;
	confidenceLevel: number;
	reasoningSteps: string[];
	evidenceCited: string[];
	legalPrinciples: string[];
	embedding?: number[];
	thinkingType: 'analysis' | 'synthesis' | 'evaluation' | 'application';
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
 message_id: string;
	conversation_id: string;
 original_query: string;
	thinking_chain: string;
 conclusion: string;
	confidence_level: string; // DECIMAL(3,2) from DB
 reasoning_steps: string; // JSONB from DB
 evidence_cited: string; // JSONB from DB
 legal_principles: string; // JSONB from DB
 thinking_type: 'analysis' | 'synthesis' | 'evaluation' | 'application';
 metadata: Record<string, unknown>; // JSONB from DB
 created_at: Date;
	similarity: string; // DECIMAL from DB
 recency_score: string; // DECIMAL from DB
 combined_score: string; // DECIMAL from DB
}

// Recommendation engine interface
export interface ThinkingRecommendation {
	id: string;
	similarity: number;
	thinkingChain: string;
	conclusion: string;
	confidenceLevel: number;
	reasoningSteps: string[];
	relatedQuery: string;
	timestamp: string;
	recencyScore: number;
	relevanceScore: number;
	combinedScore: number;
}

// Batch processing interface
export interface GrpoBatchJob {
	jobId: string;
	responses: GrpoThinkingResponse[];
	priority: 'low' | 'normal' | 'high' | 'urgent';
	status: 'pending' | 'processing' | 'completed' | 'failed';
	workerId?: string;
	createdAt: Date;
	completedAt?: Date;
}

// Trending pattern interface
export interface TrendingPattern {
	thinkingType: 'analysis' | 'synthesis' | 'evaluation' | 'application';
	pattern: string;
	frequency: number;
	avgConfidence: number;
	recentExamples: string[];
	trend: 'increasing' | 'stable' | 'decreasing';
}

// In-memory cache for GRPO embeddings
type GrpoCacheEntry = { embedding: number[];
	ts: number };
const grpoEmbeddingCache = new Map<string, GrpoCacheEntry>();
const grpoInProgress = new Map<string, Promise<number[] | null>>();
const grpoCacheMaxSize = 2000;
const grpoCacheTimeout = 1000 * 60 * 45; // 45 minutes

// Logger for GRPO operations
const grpoLogger = {
	info: (message: string, metadata?: unknown) =>
		console.log(`[${new Date().toISOString()}] GRPO-INFO: ${message}`, metadata ? JSON.stringify(metadata) : ''),
	warn: (message: string, metadata?: unknown) =>
		console.warn(`[${new Date().toISOString()}] GRPO-WARN: ${message}`, metadata ? JSON.stringify(metadata) : ''),
	error: (message: string, error?: Error, metadata?: unknown) =>
		console.error(`[${new Date().toISOString()}] GRPO-ERROR: ${message}`, error?.message ?? '', metadata ? JSON.stringify(metadata) : '')
};

// Generate hash for thinking chain deduplication
function generateThinkingHash(thinkingChain: string): string {
	return createHash('sha256')
		.update(thinkingChain.toLowerCase().replace(/\s+/g, ' ').trim())
		.digest('hex')
		.slice(0, 16);
}

/**
 * Generate GRPO embedding with caching
 */
export async function generateGrpoEmbedding(
	thinkingChain: string,
	useCache: boolean = true
): Promise<number[] | null> {
	const cacheKey = `grpo_${generateThinkingHash(thinkingChain)}`;

	// Check cache
	if (useCache) {
		const entry = grpoEmbeddingCache.get(cacheKey);
		if (entry) {
			grpoEmbeddingCache.delete(cacheKey);
			grpoEmbeddingCache.set(cacheKey, { ...entry, ts: Date.now() });
			grpoLogger.info('GRPO embedding cache hit', { cacheKey });
			return entry.embedding;
		}
	}

	// Check in-progress
	const inProg = grpoInProgress.get(cacheKey);
	if (inProg) {
		grpoLogger.info('Awaiting in-progress GRPO embedding', { cacheKey });
		return inProg;
	}

	// Generate new embedding
	const generatePromise = (async () => {
		try {
			const enhancedPrompt = `Legal reasoning chain: ${thinkingChain}`;
			const embedding = await generateEmbedding(enhancedPrompt);

			if (!embedding) {
				grpoLogger.warn('Failed to generate GRPO embedding', { thinkingChain: thinkingChain.slice(0, 100) });
				return null;
			}

			// Cache with size management
			if (useCache) {
				if (grpoEmbeddingCache.size >= grpoCacheMaxSize) {
					const firstKey = grpoEmbeddingCache.keys().next().value as string | undefined;
					if (firstKey) grpoEmbeddingCache.delete(firstKey);
				}
				grpoEmbeddingCache.set(cacheKey, { embedding, ts: Date.now() });
				grpoLogger.info('GRPO embedding cached', { cacheKey, embeddingLength: embedding.length });
			}
			return embedding;
		} catch (error) {
			grpoLogger.error('GRPO embedding generation failed', error instanceof Error ? error : undefined, { thinkingChain: thinkingChain.slice(0, 100) });
			return null;
		} finally {
			grpoInProgress.delete(cacheKey);
		}
	})();

	if (useCache) grpoInProgress.set(cacheKey, generatePromise);
	return generatePromise;
}

/**
 * Store GRPO thinking response
 */
export async function storeGrpoThinkingResponse(response: GrpoThinkingResponse): Promise<void> {
	try {
		grpoLogger.info('Storing GRPO thinking response', {
			messageId: response.messageId,
			thinkingType: response.thinkingType
		});

		let embedding = response.embedding;
		if (!embedding || embedding.length === 0) {
			embedding = (await generateGrpoEmbedding(response.thinkingChain, true)) || undefined;
			if (!embedding) {
				grpoLogger.warn('Cannot store GRPO response without embedding', { messageId: response.messageId });
				return;
			}
		}

		const vectorString = `[${embedding.join(',')}]`;

		await db.execute(sql`
			INSERT INTO grpo_thinking_responses (
				conversation_id, message_id, original_query, thinking_chain, conclusion,
				confidence_level, reasoning_steps, evidence_cited, legal_principles,
				embedding, thinking_type, metadata, created_at, updated_at
			) VALUES (
				${response.conversationId},
	${response.messageId},
	${response.originalQuery},
	${response.thinkingChain},
	${response.conclusion},
	${response.confidenceLevel},
	${JSON.stringify(response.reasoningSteps)}::jsonb,
				${JSON.stringify(response.evidenceCited)}::jsonb,
				${JSON.stringify(response.legalPrinciples)}::jsonb,
				${vectorString}::vector, ${response.thinkingType},
	${JSON.stringify(response.metadata || {})}::jsonb, NOW(), NOW()
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
			messageId: response.messageId,
			embeddingLength: embedding.length
		});
	} catch (error) {
		grpoLogger.error('Failed to store GRPO thinking response', error instanceof Error ? error : undefined, { messageId: response.messageId });
		throw error;
	}
}

/**
 * Search GRPO thinking responses with similarity and recency scoring
 */
export async function searchGrpoThinkingResponses(
	query: string,
	options: {
		limit?: number;
		threshold?: number;
		thinkingType?: string;
		timeRange?: {
	from: Date; to: Date };
		includeRecentBias?: boolean;
		confidenceThreshold?: number;
	} = {}
): Promise<ThinkingRecommendation[]> {
	const { limit = 10, threshold = 0.7, thinkingType, confidenceThreshold = 0.5 } = options;

	try {
		grpoLogger.info('Searching GRPO thinking responses', { query: query.slice(0, 50), options });

		const queryEmbedding = await generateGrpoEmbedding(query, true);
		if (!queryEmbedding) {
			grpoLogger.warn('Cannot search without query embedding');
			return [];
		}

		const vectorString = `[${queryEmbedding.join(',')}]`;

		// Build query
		let queryStr = `
			SELECT
				message_id, conversation_id, original_query, thinking_chain,
				conclusion, confidence_level, reasoning_steps, thinking_type,
				metadata, created_at,
				1 - (embedding <=> '${vectorString}'::vector) as similarity
			FROM grpo_thinking_responses
			WHERE embedding IS NOT NULL
			AND 1 - (embedding <=> '${vectorString}'::vector) > ${threshold}
			AND confidence_level >= ${confidenceThreshold}
		`;

		if (thinkingType) {
			queryStr += ` AND thinking_type = '${thinkingType}'`;
		}

		queryStr += ` ORDER BY similarity DESC LIMIT ${limit}`;

		const results = await db.execute(queryStr);

		const recommendations: ThinkingRecommendation[] = (results as any[]).map((row: any) => ({
			id: row.message_id,
			similarity: parseFloat(row.similarity),
			thinkingChain: row.thinking_chain,
			conclusion: row.conclusion,
			confidenceLevel: parseFloat(row.confidence_level),
			reasoningSteps: typeof row.reasoning_steps === 'string' ? JSON.parse(row.reasoning_steps) : row.reasoning_steps,
			relatedQuery: row.original_query,
			timestamp: row.created_at?.toISOString() || '',
			recencyScore: 1.0,
			relevanceScore: parseFloat(row.similarity),
			combinedScore: parseFloat(row.similarity)
		}));

		grpoLogger.info('GRPO search completed', {
			resultsFound: recommendations.length,
			topScore: recommendations[0]?.combinedScore ?? 0
		});

		return recommendations;
	} catch (error) {
		grpoLogger.error('GRPO thinking search failed', error instanceof Error ? error : undefined, { query: query.slice(0, 50) });
		return [];
	}
}

/**
 * Process batch GRPO responses
 */
export async function processBatchGrpoResponses(job: GrpoBatchJob): Promise<void> {
	const startTime = Date.now();
	grpoLogger.info('Starting GRPO batch processing', {
		jobId: job.jobId,
		responseCount: job.responses.length,
		priority: job.priority
	});

	try {
		job.status = 'processing';
		job.workerId = `grpo-worker-${Date.now()}`;

		const batchSize = job.priority === 'urgent' ? 5 : 10;
		for (let i = 0; i < job.responses.length; i += batchSize) {
			const batch = job.responses.slice(i, i + batchSize);

			for (const response of batch) {
				try {
					await storeGrpoThinkingResponse(response);
				} catch (e) {
					grpoLogger.warn('Failed to store response in batch', { messageId: response.messageId });
				}
			}

			grpoLogger.info(`Processed batch ${Math.floor(i / batchSize) + 1}`, {
				jobId: job.jobId,
				batchSize: batch.length,
				totalProgress: Math.round(((i + batchSize) / job.responses.length) * 100)
			});
		}

		job.status = 'completed';
		job.completedAt = new Date();
		const processingTime = Date.now() - startTime;

		grpoLogger.info('GRPO batch processing completed', {
			jobId: job.jobId,
			responseCount: job.responses.length,
			processingTimeMs: processingTime,
			workerId: job.workerId
		});
	} catch (error) {
		job.status = 'failed';
		grpoLogger.error('GRPO batch processing failed', error instanceof Error ? error : undefined, {
			jobId: job.jobId,
			responseCount: job.responses.length
		});
		throw error;
	}
}

/**
 * Initialize GRPO thinking responses table
 */
export async function initializeGrpoThinkingTable(): Promise<void> {
	try {
		grpoLogger.info('Initializing GRPO thinking responses table');

		await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);

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
				embedding vector(768),
				thinking_type VARCHAR(50) NOT NULL DEFAULT 'analysis',
				metadata JSONB NOT NULL DEFAULT '{}',
				created_at TIMESTAMP DEFAULT NOW(),
				updated_at TIMESTAMP DEFAULT NOW()
			)
		`);

		await db.execute(sql`
			CREATE INDEX IF NOT EXISTS idx_grpo_thinking_vector_hnsw
			ON grpo_thinking_responses USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)
		`);

		await db.execute(sql`
			CREATE INDEX IF NOT EXISTS idx_grpo_thinking_conversation
			ON grpo_thinking_responses (conversation_id, created_at DESC)
		`);

		grpoLogger.info('GRPO thinking responses table initialized successfully');
	} catch (error) {
		grpoLogger.error('Failed to initialize GRPO thinking responses table', error instanceof Error ? error : undefined);
		throw error;
	}
}

// Clear cache periodically
setInterval(() => {
	if (grpoEmbeddingCache.size > 0) {
		grpoLogger.info(`Clearing GRPO embedding cache (${grpoEmbeddingCache.size} entries)`);
		grpoEmbeddingCache.clear();
	}
},
	grpoCacheTimeout);

// Export cache stats
export function getGrpoCacheStats() {
	return {
		size: grpoEmbeddingCache.size,
		maxSize: grpoCacheMaxSize,
		utilization: grpoEmbeddingCache.size / grpoCacheMaxSize,
		cacheTimeout: grpoCacheTimeout
	};
}

