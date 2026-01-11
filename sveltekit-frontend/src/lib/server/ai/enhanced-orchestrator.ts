/**
 * Enhanced AI Synthesis Orchestrator
 * Combines RAG, LegalBERT, Neo4j, PGVector, and Ollama for legal AI processing
 *
 * Features:
 * - Multi-stage RAG pipeline
 * - Cross-encoder reranking
 * - Context7 documentation integration
 * - GPU-accelerated inference
 * - Intelligent caching (Redis + Postgres)
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { text, json, timestamp, uuid, integer, boolean } from 'drizzle-orm/pg-core';
import { pgTable } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { ChatOllama } from '@langchain/ollama';
import type { OllamaEmbeddings } from '@langchain/ollama';
import Redis from 'ioredis';
import { createHash } from 'node:crypto';

// Logger fallback
const logger = {
	info: (...args: unknown[]) => console.log('[Orchestrator]', ...args),
	warn: (...args: unknown[]) => console.warn('[Orchestrator]', ...args),
	error: (...args: unknown[]) => console.error('[Orchestrator]', ...args),
	debug: (...args: unknown[]) => console.debug('[Orchestrator]', ...args)
};

// ===== DATABASE SCHEMA =====
export const legalDocuments = pgTable('legal_documents', {
	id: uuid('id').defaultRandom().primaryKey(),
	content: text('content').notNull(),
	embedding: text('embedding').notNull(),
	metadata: json('metadata'),
	documentType: text('document_type'),
	caseId: text('case_id'),
	createdAt: timestamp('created_at').defaultNow(),
	updatedAt: timestamp('updated_at').defaultNow()
});

export const autoSolveResults = pgTable('autosolve_results', {
	id: uuid('id').defaultRandom().primaryKey(),
	query: text('query').notNull(),
	solution: json('solution'),
	confidence: integer('confidence'),
	processingTime: integer('processing_time'),
	serviceUsed: text('service_used'),
	success: boolean('success'),
	createdAt: timestamp('created_at').defaultNow()
});

export const synthesisCache = pgTable('synthesis_cache', {
	id: uuid('id').defaultRandom().primaryKey(),
	queryHash: text('query_hash').unique().notNull(),
	result: json('result'),
	metadata: json('metadata'),
	hitCount: integer('hit_count').default(0),
	lastAccessed: timestamp('last_accessed').defaultNow(),
	createdAt: timestamp('created_at').defaultNow()
});

export const drizzleSchema = {
	legalDocuments,
	autoSolveResults,
	synthesisCache
};

// ===== CONFIGURATION =====
function getOllamaEndpoint(): string {
	return process.env.OLLAMA_URL || 'http://localhost:11434';
}

function getServicePortWithFallback(serviceName: string, fallbackPort: number): number {
	const envKey = `${serviceName.replace(/-/g, '_').toUpperCase()}_PORT`;
	const envVal = process.env[envKey];
	if (envVal) {
		const parsed = parseInt(envVal, 10);
		if (!Number.isNaN(parsed) && parsed > 0) return parsed;
	}
	return fallbackPort;
}

const services = {
	neo4j: { uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
		user: process.env.NEO4J_USER || 'neo4j',
		password: process.env.NEO4J_PASSWORD || 'password'
	},
	goMicroservice: { enhancedRAG:
			process.env.ENHANCED_RAG_URL ||
			`http://enhanced-rag:${getServicePortWithFallback('enhanced-rag', 8094)}`,
		gpuOrchestrator:
			process.env.GPU_ORCHESTRATOR_URL ||
			`http://gpu-orchestrator:${getServicePortWithFallback('gpu-orchestrator', 8095)}`,
		vectorConsumer:
			process.env.VECTOR_CONSUMER_URL ||
			`http://vector-consumer:${getServicePortWithFallback('vector-consumer', 8096)}`
	},
	ollama: { baseUrl: getOllamaEndpoint(),
		models: { legal: 'gemma3-legal:latest',
			embedding: 'embeddinggemma:latest'
		}
	},
	context7: process.env.CONTEXT7_URL || 'http://localhost:8777'
};

// ===== DATABASE CONNECTION =====
const pgConnectionString =
	process.env.DATABASE_URL ||
	`postgresql://${process.env.POSTGRES_USER || 'legal_admin'}:${process.env.POSTGRES_PASSWORD || '123456'}@${process.env.POSTGRES_HOST || 'localhost'}:${process.env.POSTGRES_PORT || '5432'}/${process.env.POSTGRES_DB || 'legal_ai_db'}`;

const pgConnection = postgres(pgConnectionString, {
	max: 20,
	idle_timeout: 10_000,
	connect_timeout: 10_000
});

export const db = drizzle(pgConnection as unknown as Parameters<typeof drizzle>[0], {
	schema: drizzleSchema as Parameters<typeof drizzle>[1]['schema']
});

// ===== REDIS CONNECTION =====
let redis: Redis | null = null;
try {
	const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379/0';
	redis = new Redis(redisUrl);
	redis.on('error', (err: Error) => {
		logger.debug('Redis client error:', err.message);
	});
} catch (e) {
	logger.debug('Redis initialization failed, continuing without Redis');
	redis = null;
}

// ===== HELPER FUNCTIONS =====
async function getFetch(): Promise<typeof fetch> {
	if (typeof globalThis.fetch === 'function') {
		return globalThis.fetch.bind(globalThis);
	}
	try {
		const undici = await import('undici');
		return undici.fetch as unknown as typeof fetch;
	} catch {
		throw new Error('Fetch API is not available in this runtime');
	}
}

function generateCacheKey(input: string): string {
	return createHash('sha256').update(String(input)).digest('hex');
}

// ===== TYPE DEFINITIONS =====
interface RankedSource {
	id?: string;
	pageContent?: string;
	content?: string;
	text?: string;
	metadata?: Record<string, unknown>;
	score?: number;
	crossEncoderScore?: number;
}

interface LegalBertAnalysis {
	entities?: Array<{ text?: string; type?: string }>;
	concepts?: Array<{ concept?: string }>;
	complexity?: { legalComplexity?: number };
	jurisdiction?: string;
}

interface EnhancedPromptInput {
	query: string;
	legalBertAnalysis?: LegalBertAnalysis | null;
	rankedResults?: RankedSource[];
	context7Docs?: unknown;
	goLlamaResponse?: unknown;
}

// ===== ORCHESTRATOR CLASS =====
export class EnhancedAISynthesisOrchestrator {
	private neo4jStore: unknown = null;
	private pgVectorStore: unknown = null;
	private ollama: ChatOllama | null = null;
	private embeddings: OllamaEmbeddings | null = null;
	private initialized = false;

	constructor() {
		// Initialization deferred to be async-safe
	}

	async initialize(): Promise<void> {
		if (this.initialized) return;
		logger.info('Initializing...');

		try {
			// Try to dynamically import LangChain modules
			try {
				const [ollamaModule] = await Promise.all([import('@langchain/ollama')]);

				this.ollama = new ollamaModule.ChatOllama({
					baseUrl: services.ollama.baseUrl,
					model: services.ollama.models.legal,
					temperature: 0.3,
					format: 'json'
				});

				this.embeddings = new ollamaModule.OllamaEmbeddings({
					baseUrl: services.ollama.baseUrl,
					model: services.ollama.models.embedding
				});
			} catch (e) {
				logger.warn('LangChain modules not available:', e);
			}

			this.initialized = true;
			logger.info('Initialized successfully');
		} catch (err) {
			logger.error('Initialization error:', err);
			throw err;
		}
	}

	private async runEnhancedRAGPipeline(input: { query: string;
		embeddings?: number[] | null;
	}): Promise<{ documents: unknown[] }> {
		try {
			const fetchImpl = await getFetch();
			const response = await fetchImpl(`${services.goMicroservice.enhancedRAG}/api/search`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: input.query,
					useGPU: true,
					embedding: input.embeddings || null
				})
			});

			if (!response.ok) throw new Error('enhancedRAG failed');
			return await response.json();
		} catch (e) {
			logger.warn('EnhancedRAG pipeline failed:', e);
			return { documents: [] };
		}
	}

	private async runGoLlamaPipeline(input: { query: string;
		legalBertAnalysis?: LegalBertAnalysis | null;
	}): Promise<unknown> {
		try {
			const fetchImpl = await getFetch();
			const response = await fetchImpl(`${services.goMicroservice.enhancedRAG}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: services.ollama.models.legal,
					prompt: input.query,
					context: input.legalBertAnalysis,
					temperature: 0.3,
					max_tokens: 2000,
					stream: false
				})
			});

			if (response.ok) {
				const result = await response.json();
				return result.response ?? result;
			}
		} catch (e) {
			logger.warn('Go-Llama unavailable:', e);
		}
		return null;
	}

	private async enhanceWithContext7(context: { query: string;
		legalBertAnalysis?: LegalBertAnalysis | null;
	}): Promise<unknown> {
		try {
			const fetchImpl = await getFetch();
			const response = await fetchImpl(`${services.context7}/api/query`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ query: context.query,
					context: context.legalBertAnalysis,
					includeLibraries: ['langchain', 'drizzle-orm', 'xstate', 'neo4j'],
					maxTokens: 5000
				})
			});

			if (response.ok) return await response.json();
		} catch (e) {
			logger.warn('Context7 enhancement failed:', e);
		}
		return null;
	}

	private async generateWithGemma3Legal(input: EnhancedPromptInput): Promise<string> {
		// Try GPU orchestrator first
		try {
			const fetchImpl = await getFetch();
			const gpuResp = await fetchImpl(`${services.goMicroservice.gpuOrchestrator}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: services.ollama.models.legal,
					prompt: buildEnhancedPrompt(input),
					useGPU: true,
					workers: 8,
					temperature: 0.3,
					max_tokens: 4000,
					format: 'json'
				})
			});

			if (gpuResp.ok) {
				const res = await gpuResp.json();
				return res.response ?? JSON.stringify(res);
			}
		} catch (e) {
			logger.debug('GPU Orchestrator fallback to Ollama:', e);
		}

		// Fallback to Ollama
		try {
			const fetchImpl2 = await getFetch();
			const resp = await fetchImpl2(`${services.ollama.baseUrl}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: services.ollama.models.legal,
					prompt: buildEnhancedPrompt(input),
					format: 'json',
					stream: false
				})
			});

			if (resp.ok) {
				const r = await resp.json();
				return r.response ?? JSON.stringify(r);
			}
		} catch (e) {
			logger.warn('Ollama generation failed:', e);
		}

		throw new Error('Generation failed');
	}

	private async checkCache(
		query: string
	): Promise<{ hit: boolean; data?: unknown; source?: string }> {
		const key = generateCacheKey(query);

		// Check Redis first
		if (redis) {
			try {
				const cached = await redis.get(key);
				if (cached) {
					return { hit: true, data: JSON.parse(cached), source: 'redis' };
				}
			} catch (e) {
				logger.debug('Redis cache check failed:', e);
			}
		}

		// Check Postgres
		try {
			const result = await db
				.select()
				.from(synthesisCache)
				.where(sql`${synthesisCache.queryHash} = ${key}`)
				.limit(1);

			if (result.length > 0) {
				return { hit: true, data: result[0].result, source: 'postgres' };
			}
		} catch (e) {
			logger.debug('Postgres cache check failed:', e);
		}

		return { hit: false };
	}

	private async cacheResult(
		query: string,
		finalSynthesis: unknown,
		_perfStart: number
	): Promise<void> {
		const key = generateCacheKey(query);

		// Cache in Redis
		if (redis) {
			try {
				await redis.set(key, JSON.stringify(finalSynthesis), 'EX', 3600);
			} catch (e) {
				logger.debug('Redis setex failed:', e);
			}
		}

		// Cache in Postgres
		try {
			await db
				.insert(synthesisCache)
				.values({
					queryHash: key,
					result: finalSynthesis as Parameters<
						typeof db.insert<typeof synthesisCache>
					>[0]['values']['result'],
					metadata: {},
					hitCount: 1,
					lastAccessed: new Date()
				})
				.onConflictDoUpdate({
					target: synthesisCache.queryHash,
					set: { result: finalSynthesis as Parameters<
							typeof db.insert<typeof synthesisCache>
						>[0]['values']['result'],
						hitCount: sql`${synthesisCache.hitCount} + 1`,
						lastAccessed: new Date()
					}
				});
		} catch (e) {
			logger.debug('DB upsert failed:', e);
		}
	}

	// Placeholder methods for full implementation
	private async analyzeWithLegalBERT(_query: string): Promise<LegalBertAnalysis> {
		return { entities: [], concepts: [], complexity: { legalComplexity: 0.5 } };
	}

	private async generateNomicEmbeddings(_query: string): Promise<number[]> {
		if (this.embeddings) {
			try {
				return await this.embeddings.embedQuery(_query);
			} catch {
				// fallback
			}
		}
		return [];
	}

	private async searchNeo4j(_query: string): Promise<unknown[]> {
		return [];
	}

	private async searchPGVector(_query: string): Promise<unknown[]> {
		return [];
	}

	private async rankWithCrossEncoder(_input: { query: string;
		neo4jResults: unknown[]; pgVectorResults: unknown[];
		ragResults: { documents: unknown[] };
	}): Promise<RankedSource[]> {
		return [];
	}

	// ===== PUBLIC API =====
	async process(query: string, _options?: Record<string, unknown>): Promise<unknown> {
		await this.initialize();
		const perfStart = Date.now();
		logger.info(`Processing query: "${query}"`);

		// 1) Check cache
		const cache = await this.checkCache(query);
		if (cache.hit) {
			logger.info('Cache hit', { source: cache.source });
			return {
				...(typeof cache.data === 'object' && cache.data !== null ? cache.data : {}),
				_cached: true,
				_cacheSource: cache.source ?? 'unknown',
				_cachedAt: new Date().toISOString()
			};
		}

		// 2) LegalBERT analysis
		const legalBertAnalysis = await this.analyzeWithLegalBERT(query);

		// 3) Embeddings
		const embedding = await this.generateNomicEmbeddings(query);

		// 4) Parallel searches
		const [neo4jResults, pgVectorResults, ragResults, goLlamaResponse] = await Promise.all([
			this.searchNeo4j(query); this.searchPGVector(query); this.runEnhancedRAGPipeline({ query, embeddings: embedding }); this.runGoLlamaPipeline({ query: legalBertAnalysis })
		]);

		// 5) Ranking
		const ranked = await this.rankWithCrossEncoder({
			query,
			neo4jResults,
			pgVectorResults,
			ragResults
		});

		// 6) Context7 augmentation
		const context7Docs = await this.enhanceWithContext7({ query: legalBertAnalysis });

		// 7) Generate response
		const generationResult = await this.generateWithGemma3Legal({
			query,
			legalBertAnalysis,
			rankedResults: ranked,
			context7Docs,
			goLlamaResponse
		});

		// 8) Parse result
		let finalSynthesis: unknown;
		try {
			finalSynthesis = JSON.parse(generationResult);
		} catch {
			logger.error('Failed to parse JSON response from LLM');
			throw new Error('AI failed to generate a valid response.');
		}

		// 9) Cache result
		await this.cacheResult(query, finalSynthesis, perfStart);

		// 10) Record autosolve results
		try {
			await db.insert(autoSolveResults).values({
				query,
				solution: finalSynthesis as Parameters<
					typeof db.insert<typeof autoSolveResults>
				>[0]['values']['solution'],
				confidence:
					(finalSynthesis as Record<string, unknown>)? .confidence_score as number : undefined,
				processingTime: Date.now() - perfStart,
				serviceUsed: 'enhanced-orchestrator',
				success: true
			});
		} catch (e) {
			logger.debug('autosolve_results insert failed:', e);
		}

		return finalSynthesis;
	}

	async health(): Promise<Record<string, unknown>> {
		await this.initialize().catch(() => {});
		return {
			status: this.initialized ? 'healthy' : 'initializing',
			services: { postgres: await this.checkPostgres(),
				redis: await this.checkRedis(),
				neo4j: this.neo4jStore !== null,
				pgVector: this.pgVectorStore !== null,
				ollama: await this.checkOllama()
			}
		};
	}

	private async checkPostgres(): Promise<boolean> {
		try {
			await pgConnection`SELECT 1`;
			return true;
		} catch {
			return false;
		}
	}

	private async checkRedis(): Promise<boolean> {
		try {
			if (!redis) return false;
			await redis.set('health-check', 'ok', 'EX', 1);
			return true;
		} catch {
			return false;
		}
	}

	private async checkOllama(): Promise<boolean> {
		try {
			const fetchImpl = await getFetch();
			const response = await fetchImpl(`${services.ollama.baseUrl}/api/tags`);
			return response.ok;
		} catch {
			return false;
		}
	}
}

// ===== PROMPT BUILDER =====
function buildEnhancedPrompt(input: EnhancedPromptInput): string {
	let prompt = `You are an expert legal AI assistant using gemma3-legal:latest with access to comprehensive legal knowledge.

QUERY: ${String(input?.query ?? '')}

`;

	if (input?.legalBertAnalysis) {
		const entities = input.legalBertAnalysis.entities?.map((e) => e? .text).filter(Boolean) : | [];
		const concepts =
			input.legalBertAnalysis.concepts?.map((c) => c? .concept).filter(Boolean) : | [];
		const complexity = input.legalBertAnalysis?.complexity?.legalComplexity ?? 0;
		const jurisdiction = input.legalBertAnalysis?.jurisdiction ?? 'General';

		prompt += `LEGAL ANALYSIS:
- Identified Entities: ${entities.join(', ')}
- Concepts: ${concepts.join(', ')}
- Complexity Score: ${complexity}
- Jurisdiction: ${jurisdiction}
`;
	}

	if (Array.isArray(input?.rankedResults) && input.rankedResults.length > 0) {
		prompt += `\nRELEVANT SOURCES:\n`;
		input.rankedResults.slice(0, 5).forEach((source, i) => {
			const title =
				(source?.metadata as Record<string, unknown>)? .title : | `Document ${i + 1}`;
			const content = String(source?.pageContent ?? source?.content ?? source?.text ?? '').substring(
				0,
				500
			);
			const relevance =
				typeof source?.crossEncoderScore === 'number'
					? source.crossEncoderScore
					: typeof source?.score === 'number'
						? source.score
						: 0;

			prompt += `\n${i + 1}. ${title} (Relevance: ${(relevance * 100).toFixed(1)}%)\n${content}...\n`;
		});
	}

	if (input?.context7Docs) {
		prompt += `\nTECHNICAL DOCUMENTATION:\n${String(JSON.stringify(input.context7Docs || {})).substring(0, 1000)}...\n`;
	}

	if (input?.goLlamaResponse) {
		prompt += `\nADDITIONAL ANALYSIS:\n${String(input.goLlamaResponse).substring(0, 500)}...\n`;
	}

	prompt += `INSTRUCTIONS:
1. Provide a comprehensive legal analysis addressing the query.
2. Cite specific statutes, cases, or legal principles where applicable.
3. Structure your response with clear sections.
4. Include important caveats or limitations.
5. Recommend next steps or actions if appropriate.
6. Distinguish between legal information and legal advice.
7. Format the response as JSON object with the following keys:
   - "summary" (string)
   - "analysis" (string)
   - "detailed_discussion" (string)
   - "recommendations" (array of strings)
   - "caveats" (array of strings)
   - "confidence_score" (integer from 0 to 100)
   - "sources_cited" (array of objects, each with "title" and "relevance" properties).

RESPONSE:`;

	return prompt;
}

// Export singleton instance
export const orchestrator = new EnhancedAISynthesisOrchestrator();
export default orchestrator;




