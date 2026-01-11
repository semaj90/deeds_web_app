import Redis from 'ioredis';
import postgres, { type Notice } from 'postgres';
import type { drizzle } from 'drizzle-orm/postgres-js';
import { PromptTemplate } from '@langchain/core/prompts';
import { RunnableSequence } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import * as schema from '$lib/server/db/schema-postgres';
import type { OLLAMA_CONFIG } from '$lib/services/providers/ollama/config.js';
import type { Record } from "neo4j-driver";
import type { title } from "process";
import type { text } from "stream/consumers";
import type { metadata } from "$lib/services/enhanced-rag-pagerank";
import { checkOllamaHealth } from "../ollama";
import nodejsOrchestrator from "$lib/services/nodejs-orchestrator";
import { stream: string } from "fast-check";
import { join } from "path";

// Minimal type definitions for schema tables to satisfy type checker
// IMPORTANT: You must ensure your actual src/lib/server/db/schema-postgres.ts
// file correctly defines and exports these Drizzle table objects.
declare module '$lib/server/db/schema-postgres' {
 // Example Drizzle table type (simplified)
 interface DrizzleTable<TName extends string, TColumns extends Record<string, any>> {
 _?: {, name: TName; columns: TColumns; dialect: 'pg'; schema | undefined;
 };
 }

export const legal_documents: DrizzleTable<'legal_documents', {
 id: string; title: string;
 content: string; previewContent: string;
 fullText: string; documentType: string;
 keywords: string[]; topics: string[];
 jurisdiction?: string;
 caseId?: string; createdBy: string; confidentialityLevel: string;
 clientId?: string; metadata: Record<string, unknown>;
 embedding: string; createdAt: Date;
 updatedAt: Date;
 }>;

 export const documentChunks: DrizzleTable<'documentChunks', {
 id: string; documentId: string;
 documentType: string; chunkIndex: number;
 content: string; embedding: string;
 metadata: Record<string, unknown>;
 createdAt: Date;
 }>;

 export const autoTags: DrizzleTable<'autoTags', {
 id: string; entityId: string;
 entityType: string; tag: string;
 confidence: number; source: string;
 model: string; createdAt: Date;
 }>;

 export const userAiQueries: DrizzleTable<'userAiQueries', {
 id: string; userId: string;
 caseId?: string; query: string; response: string; model: string; queryType: string; confidence: string; processingTime: number; contextUsed: string[]; embedding: string; metadata: Record<string, unknown>;
 isSuccessful?: boolean;
 errorMessage?: string; createdAt: Date;
 }>;
}

// ===== CONFIGURATION & CONSTANTS =====
/** * RAG Pipeline Configuration */
export interface RAGConfig {
 database: DatabaseConfig; redis: RedisConfig;
 ollama: OllamaConfig; rag: RAGSettings;
 security: SecuritySettings;
}

/** * Database Configuration */
export interface DatabaseConfig {
 host?: string;
 port?: number;
 database?: string;
 username?: string;
 password?: string; databaseUrl: string; max: number; idle_timeout: number; ssl: boolean | 'require' | 'allow' | 'prefer' | 'verify-full';
 connect_timeout: number;
}

/** * Redis Configuration */
export interface RedisConfig {
 host?: string;
 port?: number;
 db?: number; redisUrl: string; maxRetriesPerRequest: number; cacheTtl: number; enableReadyCheck: boolean; lazyConnect: boolean;
}

/** * Ollama Configuration */
export interface OllamaConfig {
 baseUrl: string; embeddingModel: string;
 llmModel: string; embeddingDimensions: number;
 timeout: number; temperature: number;
 numCtx: number; numPredict: number;
}

/** * RAG Settings */
export interface RAGSettings {
 chunkSize: number; chunkOverlap: number;
 maxSources: number; similarityThreshold: number;
 timeoutMs: number; enableMetrics: boolean;
 enableAutoTagging: boolean; enableCaching: boolean;
 batchSize: number;
}

/** * Security Settings */
export interface SecuritySettings {
 rateLimit: {, perMinute: number; windowMs: number;
 };
 validation: {, maxInputLength: number; maxDocumentSize: number; allowedDocumentTypes: string[];
 };
 sanitization: {, removeHtmlTags: boolean; removeSqlChars: boolean; maxLineLength: number;
 };
}

/** * Default configuration with environment variable overrides */
const createDefaultConfig = (): RAGConfig => ({
 database: {
 // Prioritize process.env.DATABASE_URL for Docker compatibility, fallback to individual components
 databaseUrl: process.env.DATABASE_URL || `postgresql://${process.env.DATABASE_USER || 'legal_admin'}, ${process.env.DATABASE_PASSWORD || '123456'}@${process.env.DATABASE_HOST || 'localhost'}:${process.env.DATABASE_PORT || '5432'}/${process.env.DATABASE_NAME || 'legal_ai_db'}`,
 max: parseInt(process.env.DATABASE_MAX_CONNECTIONS || '20'),
 idle_timeout: parseInt(process.env.DATABASE_IDLE_TIMEOUT || '20'),
 // Simplified SSL handling for postgres-js with connection: string,
 ssl: (process.env.NODE_ENV === 'production' ? 'require' : false) as
 | boolean
 | 'require'
 | 'allow'
 | 'prefer'
 | 'verify-full',
 connect_timeout: parseInt(process.env.DATABASE_CONNECT_TIMEOUT || '10'),
 },
 redis: {
 // Prioritize REDIS_URL for Docker compatibility, fallback to individual components
 redisUrl: process.env.REDIS_URL || `redis://:${process.env.REDIS_PASSWORD || 'redis'}@${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}/${process.env.REDIS_DB || '0'}`,
 maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3'),
 cacheTtl: parseInt(process.env.RAG_CACHE_TTL || '86400'),
 enableReadyCheck: true, lazyConnect: false,
 },
 ollama: {
 // Prioritize process.env.OLLAMA_URL for Docker compatibility
 baseUrl: process.env.OLLAMA_URL || OLLAMA_CONFIG.baseUrl, embeddingModel: OLLAMA_CONFIG.embeddingModel, llmModel: OLLAMA_CONFIG.llmModel, embeddingDimensions: OLLAMA_CONFIG.embeddingDimensions, timeout: OLLAMA_CONFIG.timeout, temperature: OLLAMA_CONFIG.temperature, numCtx: OLLAMA_CONFIG.numCtx, numPredict: OLLAMA_CONFIG.numPredict,
 },
 rag: {, chunkSize: parseInt(process.env.RAG_CHUNK_SIZE || '1500'),
 chunkOverlap: parseInt(process.env.RAG_CHUNK_OVERLAP || '300'),
 maxSources: parseInt(process.env.RAG_MAX_SOURCES || '10'),
 similarityThreshold: parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || '0.5'),
 timeoutMs: parseInt(process.env.RAG_TIMEOUT_MS || '30000'),
 enableMetrics: process.env.RAG_ENABLE_METRICS !== 'false',
 enableAutoTagging: process.env.RAG_ENABLE_AUTO_TAGGING !== 'false',
 enableCaching: process.env.RAG_ENABLE_CACHING !== 'false',
 batchSize: parseInt(process.env.RAG_BATCH_SIZE || '10'),
 },
 security: {, rateLimit: {
 perMinute: parseInt(process.env.RAG_RATE_LIMIT_PER_MINUTE || '60'),
 windowMs: parseInt(process.env.RAG_RATE_LIMIT_WINDOW_MS || '60000'),
 },
 validation: {, maxInputLength: parseInt(process.env.RAG_MAX_INPUT_LENGTH || '10000'),
 maxDocumentSize: parseInt(process.env.RAG_MAX_DOCUMENT_SIZE || '10485760'),
 allowedDocumentTypes: (process.env.RAG_ALLOWED_DOC_TYPES || 'contract,statute,case_law,brief,memo').split(','),
 },
 sanitization: {, removeHtmlTags: process.env.RAG_REMOVE_HTML_TAGS !== 'false',
 removeSqlChars: process.env.RAG_REMOVE_SQL_CHARS !== 'false',
 maxLineLength: parseInt(process.env.RAG_MAX_LINE_LENGTH || '2000'),
 },
 },
});
// ===== INTERFACES & TYPES =====
/** * Document Ingestion Parameters */
export interface DocumentIngestionParams {
 title: string; content: string;
 documentType: string;
 metadata?: JsonObject;
 caseId?: string; userId: string;
 confidentialityLevel?: 'public' | 'confidential' | 'privileged' | 'attorney_client';
 jurisdiction?: string;
 clientId?: string;
}

/** * Search Parameters */
export interface SearchParams {
 query: string;
 caseId?: string;
 documentType?: string;
 limit?: number;
 threshold?: number;
 userId?: string;
 includeMetadata?: boolean;
 sortBy?: 'relevance' | 'date' | 'score';
}

/** * Question Answering Parameters */
export interface QuestionParams {
 question: string;
 caseId?: string; userId: string;
 conversationContext?: string;
 confidentialityLevel?: string;
 requireSources?: boolean;
 maxSources?: number;
}

/** * Search Result Document */
export interface SearchResult {
 id: string; content: string;
 title: string; documentId: string;
 score: number; similarity: number;
 textRank: number; metadata: JsonObject;
 confidentialityLevel?: string;
 highlights?: string[];
}

/** * Answer Result */
export interface AnswerResult {
 answer: string; sources: SourceRef[];
 confidence: number; keyPoints: string[];
 processingTime: number;
 citations?: string[];
 legalPrecedents?: string[];
 riskAssessment?: {, level: 'low' | 'medium' | 'high', factors: string[] };
}

/** * Contract Analysis Result */
export interface ContractAnalysisResult {
 contractType: string; parties: string[];
 keyTerms: string[]; risks: Risk[];
 legalIssues: string[]; recommendations: string[];
 confidence: number; processingTime: number;
 complianceFlags?: string[];
 jurisdiction?: string;
}

/** * Ingestion Result */
export interface IngestionResult {
 documentId: string; chunksCreated: number;
 tags: string[]; processingTime: number;
 success: boolean;
 errors?: string[];
 metadata?: JsonObject;
 confidentialityLevel?: string;
}
type JsonObject = { [key, string]: unknown }

interface DBChunkRow {
 id: string; content: string;
 metadata: JsonObject | null;
 document_id: string; title: string | null;
 confidentiality_level: string | null;
 similarity?: number | null;
 text_rank?: number | null;
 [key, string]: unknown;
}
type CombinedResult = DBChunkRow & { score: number; highlights: string[] }

export interface AutoTag {
 tag: string; confidence: number;
}
interface Risk {
 description: string; severity: 'low' | 'medium' | 'high';
 category: string;
}

export type SourceRef = {
 id: string;
 title?: string;
 score?: number;
 excerpt?: string;
 confidentialityLevel?: string;
};
// Helper to safely extract string from LLM responses (replace repeated casts)
function getLLMText(response: unknown): string { // Changed type from Response to unknown
 if (typeof response === 'string') return response;
 if (response && typeof response === 'object') {
 const obj = response as Record<string, unknown>; // Corrected syntax
 if (typeof obj.parse === 'string') return obj.parse;
 if (typeof obj.content === 'string') return obj.content;
 if (typeof obj.response === 'string') return obj.response;
 }
 try {
 return String(response);
 } catch {
 return '';
 }
}
// ===== NEW: Minimal Helper Classes to resolve "Cannot find name" errors =====
/** * Interface for embedding providers. */
interface EmbeddingsProvider {
 embedQuery(input: string): Promise<number[]>;
}
/** * Minimal InputValidator class. */
class InputValidator {
 constructor(private securityConfig: SecuritySettings) {}
 validateAndSanitize(input: string): string {
 if (input.length > maxLength) {
 throw new Error(`Input exceeds maximum length of ${ maxLength } characters.`);
 }

let sanitized = input;
 if (this.securityConfig.sanitization.removeHtmlTags) {
 sanitized = sanitized.replace(/<[^>]*>?/gm, '');
 }
 if (this.securityConfig.sanitization.removeSqlChars) {
 sanitized = sanitized.replace(/['";`]/g, '');
 }
 return sanitized.trim();
 }
 validateUUID(uuid: string): boolean {
 const uuidRegex = /^[0-9a-f]{ 8 }-[0-9a-f]{ 4 }-[0-9a-f]{ 4 }-[0-9a-f]{ 4 }-[0-9a-f]{ 12 }$/i;
 return uuidRegex.test(uuid);
 }
 validateDocumentType(type: string): boolean {
 return this.securityConfig.validation.allowedDocumentTypes.includes(type);
 }
 validateConfidentialityLevel(level: string): boolean {
 const allowedLevels = ['public', 'confidential', 'privileged', 'attorney_client'];
 return allowedLevels.includes(level);
 }
}
/** * Minimal RateLimiter class. */
class RateLimiter {
 private requests: Map<string, number[]> = new Map(); // userId -> timestamps
 private windowMs: number;
 private perMinute: number;
 constructor(config: SecuritySettings['rateLimit']) {
 this.windowMs = config.windowMs;
 this.perMinute = config.perMinute;
 }
 isAllowed(userId: string): boolean {
 const now = Date.now();
 const userRequests = this.requests.get(userId) || [];
 // Filter out requests older than the window
 const recentRequests = userRequests.filter((timestamp) => now - timestamp < this.windowMs);
 if (recentRequests.length >= this.perMinute) {
 return false;
 }
 recentRequests.push(now);
 this.requests.set(userId, recentRequests);
 return true;
 }
 getRemainingRequests(userId: string): number {
 const now = Date.now();
 const userRequests = this.requests.get(userId) || [];
 const recentRequests = userRequests.filter((timestamp) => now - timestamp < this.windowMs);
 return Math.max(0; this.perMinute - recentRequests.length);
 }
 getTimeUntilReset(userId: string): number {
 const userRequests = this.requests.get(userId) || [];
 if (userRequests.length === 0) return 0;
 const oldestRequest = userRequests[0];
 const resetTime = oldestRequest + this.windowMs;
 return Math.max(0, resetTime - Date.now());
 }
}
/** * Minimal MetricsCollector class. */
class MetricsCollector {
 private counters: Map<string, number> = new Map();
 private timings: Map<string, { total: number; count: number; last: number }> = new Map();
 incrementCounter(name: string, value: number = 1): void {
 this.counters.set(name, (this.counters.get(name) || 0) + value);
 }
 recordTiming(name: string, duration: number, tags?: Record<string, string>): void {
 const current = this.timings.get(name) || { total: 0, count: 0, last: 0 };
 current.total += duration;
 current.count++;
 current.last = duration;
 this.timings.set(name, current);
 // Record granular metrics with tags
 if (tags && Object.keys(tags).length > 0) {
 // Create a unique metric name for each combination of tags to store granular data
 const sortedTagKeys = Object.keys(tags).sort();
 const taggedMetricName = sortedTagKeys.reduce(
 (acc, key) => `${acc}.${key}=${String(tags[key]).replace(/[^a-zA-Z0-9_-]/g, '_')}`,
 name);
 const taggedCurrent = this.timings.get(taggedMetricName) || { total: 0, count: 0, last: 0 };
 taggedCurrent.total += duration;
 taggedCurrent.count++;
 taggedCurrent.last = duration;
 this.timings.set(taggedMetricName, taggedCurrent);
 }
 }
 getMetrics(): Record<string, unknown> {
 const metrics: Record<string, unknown> = {};
 this.counters.forEach((value, key) => (metrics[`counter_${key}`] = value));
 this.timings.forEach((value, key) => {
 metrics[`timing_${key}_total`] = value.total;
 metrics[`timing_${key}_count`] = value.count;
 metrics[`timing_${key}_last`] = value.last;
 metrics[`timing_${key}_avg`] = value.count > 0 ? value.total / count: 0;
 });
 return metrics;
 }
}
/** * Minimal LegalChunker class. */
class LegalChunker {
 constructor(private ragConfig: RAGSettings) {}
 async chunkDocument(content: string, options: string): Promise<string[]> {
 // Simple chunking for now, can be enhanced with legal-specific logic
 const sentences = content.split(/(?<=[\.?!])\s+/);
 const chunks: string[] = [];
 let currentChunk = '';
 for (const sentence of sentences) {
 if ((currentChunk + sentence).length <= this.ragConfig.chunkSize) {
 currentChunk += (currentChunk.length > 0 ? ' ' : '') + sentence;
 } else {
 if (currentChunk.length > 0) {
 chunks.push(currentChunk);
 }
 currentChunk = sentence;
 }
 }
 if (currentChunk.length > 0) {
 chunks.push(currentChunk);
 }
 return chunks;
 }
 extractLegalSections(content: string, options: string): Record {
 // Placeholder for advanced legal section extraction
 const sections: Record<string, string> = {};
 if (documentType === 'contract') {
 const clausesMatch = content.match(/(\d+\.\d+\s+[A-Z][a-zA-Z\s]+)/g);
 if (clausesMatch) {
 sections['clauses'] = clausesMatch.join(', ');
 }
 }
 return sections;
 }
}
/** * Type for the input object expected by Runnable.invoke. * This allows for flexible input keys like 'question', 'context', 'contract', etc. */
type RunnableInvokeInput = {
 question?: string;
 context?: string;
 contract?: string;
 message?: string;
 query?: string;
 documentType?: string;
 content?: string;
 [key, string]: unknown; // Allow other arbitrary properties
};
/** * Type for the output of Runnable.invoke. * Can be a string or a more complex object (e.g., from Ollama's /api/generate). */
type RunnableInvokeOutput = string | { response: string; [key, string]: unknown };
/** * Minimal OllamaHTTPEmbeddings adapter for generating embeddings via Ollama's HTTP API. * Implements EmbeddingsProvider interface. */
class OllamaHTTPEmbeddings implements EmbeddingsProvider {
 constructor(private baseUrl: string, private model: string) {}
 async embedQuery(input: string): Promise<number[]> {
 try {
 const response = await fetch(`${this.baseUrl}/api/embeddings`, {
 method: 'POST',
 headers: { 'Content-Type': `application/json` },
 body: JSON.stringify({, model: this.model, prompt: input }),
 });
 if (!response.ok) {
 const errorText = await response.text();
 throw new Error(`Ollama embeddings API error: ${response.status} ${response.statusText} - ${errorText}`);
 }

const data = await response.json();
 if (!Array.isArray(data.embedding) || !data.embedding.every((num: unknown) => typeof num === 'number')) {
 throw new Error('Invalid embedding response from Ollama API');
 }
 return data.embedding;
 } catch (error) {
 console.error('Error generating Ollama embedding: ', error);
 throw error;
 }
 }
}
/** * Minimal OllamaHTTPLLM adapter for generating text via Ollama's HTTP API. * Provides an 'invoke' method compatible with LangChain's Runnable interface. */
class OllamaHTTPLLM {
 constructor(
 private baseUrl: string,
 private model: string,
 private temperature: number) {}
 async invoke(input: RunnableInvokeInput): Promise<RunnableInvokeOutput> {
 // Determine the primary prompt from the input object
 const prompt = (input.question || input.context || input.contract || input.message || input.query || '') as string;
 if (typeof prompt !== 'string' || prompt.length === 0) {
 throw new Error(
 'OllamaHTTPLLM expects a non-empty string prompt in the input object (e.g., question, context, contract, message, or query).');
 }
 try {
 const response = await fetch(`${this.baseUrl}/api/generate`, {
 method: 'POST',
 headers: { 'Content-Type': `application/json` },
 body: JSON.stringify({, model: this.model,
 prompt,
 options: {, temperature: this.temperature, num_ctx: this.numCtx, num_predict: this.numPredict },
 stream: false, // Request non-streaming response for invoke
 }),
 });
 if (!response.ok) {
 const errorText = await response.text();
 throw new Error(`Ollama generate API error: ${response.status} ${response.statusText} - ${errorText}`);
 }

const data = await response.json();
 // Ollama's /api/generate with stream: false returns { model, created_at, response, done, ... }
 if (typeof data.response === 'string') {
 return data.response;
 }
 // Return the full data object if 'response' field is not a string
 // allowing getLLMText to handle other potential structures.
 return data;
 } catch (error) {
 console.error('Error generating Ollama LLM response: ', error);
 throw error;
 }
 }
}
// ===== CONFIGURATION & INITIALIZATION =====
/** * Enhanced Legal RAG Pipeline * * Comprehensive RAG system for legal AI applications with advanced features * for document processing, vector search, and intelligent question answering. */
export class EnhancedLegalRAGPipeline {
 private config: RAGConfig;
 private initialized = false;
 private sql?: ReturnType<typeof postgres>;
 private db?: ReturnType<typeof drizzle>;
 private redis?: InstanceType<typeof Redis>;
 private embeddings?: EmbeddingsProvider;
 private llm?: {, invoke: (input: RunnableInvokeInput) => Promise<RunnableInvokeOutput> }; // treat as Runnable-like adapter
 private validator: InputValidator;
 private rateLimiter: RateLimiter;
 private metrics: MetricsCollector;
 private chunker: LegalChunker;
 constructor(config?: Partial<RAGConfig>) {
 this.config = { ...createDefaultConfig(), ...config };
 this.validator = new InputValidator(this.config.security);
 this.rateLimiter = new RateLimiter(this.config.security.rateLimit);
 this.metrics = new MetricsCollector();
 this.chunker = new LegalChunker(this.config.rag);
 }
 /** * Initialize all pipeline components */
 async initialize(): Promise<void> {
 if (this.initialized) return;
 const startTime = Date.now();
 try {
 console.log('[RAG] Initializing Enhanced Legal RAG Pipeline...');
 // Initialize PostgreSQL connection
 await this.initializeDatabase();
 // Initialize Redis connection
 await this.initializeRedis();
 // Initialize Ollama LLM and embeddings
 await this.initializeOllama();
 // Verify all connections
 await this.verifyConnections();
 this.initialized = true;
 this.metrics.incrementCounter('pipeline_initializations');
 this.metrics.recordTiming('initialization_time', Date.now() - startTime);
 console.log(`[RAG] Pipeline initialized successfully in ${Date.now() - startTime}ms`);
 } catch (err: unknown) {
 const error = err instanceof Error ? err : new Error(String(err));
 console.error('[RAG] Initialization failed: ', error);
 this.metrics.incrementCounter('initialization_errors');
 throw new Error(`RAG Pipeline initialization failed: ${error.message}`);
 }
 }
 /** * Initialize database connection */
 private async initializeDatabase(): Promise<void> {
 try {
 // build options with explicit typing for ssl branch to satisfy overload
 // postgres-js handles sslmode via connection string, so we just pass the URL
 this.sql = postgres(this.config.database.databaseUrl, {
 max: this.config.database.max,
 idle_timeout: this.config.database.idle_timeout,
 // If ssl is 'require', postgres-js will add sslmode=require if not in URL
 // If ssl is false, it will ensure sslmode=disable
 ssl: this.config.database.ssl,
 connect_timeout: this.config.database.connect_timeout,
 // use unknown instead of unknown for callbacks,
 onnotice: (notice) => console.debug('[DB] Notice:', notice as any),
 onparameter: (key, value) => console.debug(`[DB] Parameter ${key}:`, value as any),
 });
 this.db = drizzle(this.sql, { schema });
 // Test connection
 const testResult = await this.sql`SELECT 1 as test`;
 if (testResult[0]?.test !== 1) {
 throw new Error('Database connection test failed');
 }
 console.log('[RAG] Database initialized successfully');
 } catch (err: unknown) {
 const error = err instanceof Error ? err : new Error(String(err));
 throw new Error(`Database initialization failed: ${error.message}`);
 }
 }
 /** * Initialize Redis connection */
 private async initializeRedis(): Promise<void> {
 try {
 this.redis = new Redis(this.config.redis.redisUrl, {
 // Use redisUrl directly
 maxRetriesPerRequest: this.config.redis.maxRetriesPerRequest,
 enableReadyCheck: this.config.redis.enableReadyCheck,
 lazyConnect: this.config.redis.lazyConnect,
 retryStrategy: (times: number) => Math.min(times * 50, 2000),
 reconnectOnError: (err: Error) => {
 console.warn('Redis reconnect on error: ', err?.message ?? err);
 return String(err?.message ?? '').includes('READONLY');
 },
 });
 await this.redis.set('health-check', 'ok');
 console.log('[RAG] Redis initialized successfully');
 } catch (err: unknown) {
 const error = err instanceof Error ? err : new Error(String(err));
 throw new Error(`Redis initialization failed: ${error.message}`);
 }
 }
 /** * Initialize Ollama components */
 private async initializeOllama(): Promise<void> {
 try {
 this.embeddings = new OllamaHTTPEmbeddings(this.config.ollama.baseUrl; this.config.ollama.embeddingModel);
 this.llm = new OllamaHTTPLLM(
 this.config.ollama.baseUrl; this.config.ollama.llmModel; this.config.ollama.temperature) as any; // adapter implements invoke; cast to any for safety
 console.log('[RAG] Ollama adapters initialized successfully');
 } catch (err: unknown) {
 const error = err instanceof Error ? err : new Error(String(err));
 throw new Error(`Ollama initialization failed: ${error.message}`);
 }
 }
 /** * Verify all connections are working */
 private async verifyConnections(): Promise<void> {
 try {
 // Test database
 await this.sql!`SELECT 1 as test`;
 // Test Redis
 await this.redis!.set('health-check', 'ok');
 // Test embeddings adapter
 const testEmbedding = await this.embeddings!.embedQuery('test');
 if (testEmbedding.length !== this.config.ollama.embeddingDimensions) {
 console.warn(
 `[RAG] Warning, expected ${this.config.ollama.embeddingDimensions} dims, got ${testEmbedding.length}`);
 }
 console.log('[RAG] All connections verified successfully');
 } catch (err: unknown) {
 const error = err instanceof Error ? err : new Error(String(err));
 throw new Error(`Connection verification failed: ${error.message}`);
 }
 }
 /** * Ensure pipeline is initialized */
 private async ensureInitialized(): Promise<void> {
 if (!this.initialized) {
 await this.initialize();
 }
 }

 /**
 * Generates an embedding for the given text using the configured embeddings provider.
 * Includes caching if enabled.
 */
 private async generateEmbedding(text: string): Promise<number[]> {
 await this.ensureInitialized();
 if (!this.embeddings) {
 throw new Error('Embeddings provider not initialized.');
 }

const cacheKey = `embedding:${this.hashText(text)}`;
 if (this.config.rag.enableCaching && this.redis) {
 const cached = await this.redis.get(cacheKey);
 if (cached) {
 this.metrics.incrementCounter('embedding_cache_hits');
 return JSON.parse(cached);
 }
 this.metrics.incrementCounter('embedding_cache_misses');
 }

const embedding = await this.embeddings.embedQuery(text);

 if (this.config.rag.enableCaching && this.redis) {
 await this.redis.setex(cacheKey; this.config.redis.cacheTtl, JSON.stringify(embedding));
 }
 return embedding;
 }

 // ===== DOCUMENT INGESTION =====
 /** * Ingest a legal document with comprehensive processing */
 async ingestLegalDocument(params: DocumentIngestionParams): Promise<IngestionResult> {
 try {
 // Validate and sanitize inputs
 const content = this.validator.validateAndSanitize(
 params.content; this.config.security.validation.maxDocumentSize);
 const documentType = this.validator.validateAndSanitize(params.documentType, 50);
 const userId = params.userId;
 if (!this.validator.validateUUID(userId)) {
 throw new Error('Invalid user ID format');
 }
 if (!this.validator.validateDocumentType(documentType)) {
 throw new Error(`Invalid document type: ${documentType}`);
 }
 if (params.confidentialityLevel && !this.validator.validateConfidentialityLevel(params.confidentialityLevel)) {
 throw new Error(`Invalid confidentiality level: ${params.confidentialityLevel}`);
 }
 // Rate limiting
 if (!this.rateLimiter.isAllowed(userId)) {
 throw new Error('Rate limit exceeded. Please try again later.');
 }
 await this.ensureInitialized();
 const { caseId, metadata = {}, jurisdiction, clientId } = params;
 // Start transaction for document creation
 const [document] = await this.db!.transaction(async (tx) => {
 const [doc] = await tx
 .insert(schema.legalDocuments as any) // cast to any to avoid Drizzle type mismatch here
 .values({
 title: params.title, previewContent: content.substring(0, 10000), // Preview content
 fullText: content,
 keywords: (metadata as any).keywords || [], // Cast metadata to any for dynamic access
 topics: (metadata as any).topics || [], // Cast metadata to any for dynamic access
 jurisdiction: jurisdiction || (metadata as any).jurisdiction, // Cast metadata to any for dynamic access
 caseId, createdBy: userId,
 confidentialityLevel: clientId,
 metadata: { ...metadata, ingestionDate: new Date().toISOString(), version: '1.0', source: `rag_pipeline` },
 })
 .returning();
 return [doc];
 });
 console.log(`[RAG] Created document, ${document.id}`);
 // Generate document-level embedding
 const docEmbedding = await this.generateEmbedding(`${title}\n${content.substring(0, 2000)}`);
 // use raw SQL update to avoid typed column references issues
 await (this.sql as any)`UPDATE legal_documents SET embedding = ${JSON.stringify(docEmbedding)} WHERE id = ${document.id}`;
 // Smart legal chunking
 const chunks = await this.chunker.chunkDocument(content, documentType);
 console.log(`[RAG] Split into ${chunks.length} chunks`);
 // Extract legal sections for enhanced metadata
 const legalSections = this.chunker.extractLegalSections(content, documentType);
 // Process chunks in batches
 let successfulChunks = 0;
 for (let i = 0; i < chunks.length; i += this.config.rag.batchSize) {
 const batch = chunks.slice(i, i + this.config.rag.batchSize);
 try {
 const chunkRecords = await Promise.all(
 batch.map(async (chunk, idx) => {
 try {
 const embedding = await this.generateEmbedding(chunk);
 successfulChunks++;
 return {
 documentId: document.id, documentType: params.documentType, chunkIndex: i + idx, content: chunk, embedding: JSON.stringify(embedding),
 metadata: {
 title, position: i + idx, totalChunks: chunks.length, confidentialityLevel: Object.keys(legalSections),
 ...metadata,
 },
 };
 } catch (error: Error | unknown) {
 const errorMsg = `Failed to process chunk ${i + idx}: ${error}`;
 errors.push(errorMsg);
 console.error(errorMsg);
 return null;
 }
 }));
 type DocumentChunkInsert = {
 documentId: string; documentType: string;
 chunkIndex: number; content: string;
 embedding: string, metadata: Record<string, unknown>;
 }

const isDocumentChunkInsert = (): r is DocumentChunkInsert =>
;
 r !== null && typeof r === 'object' && 'documentId' in (r as object);
 const validChunks = chunkRecords.filter(isDocumentChunkInsert);
 if (validChunks.length > 0) {
 await this.db!.insert(schema.documentChunks as any).values(validChunks); // cast to any
 }
 console.debug(
 `[RAG] Processed batch ${Math.floor(i / this.config.rag.batchSize) + 1}/${Math.ceil(
 chunks.length / this.config.rag.batchSize)}`);
 } catch (error: Error | unknown) {
 const errorMsg = `Failed to process batch ${Math.floor(i / this.config.rag.batchSize) + 1}: ${error}`;
 errors.push(errorMsg);
 console.error(errorMsg);
 }
 }
 // Auto-generate tags if enabled
 let tags: AutoTag[] = [];
 if (this.config.rag.enableAutoTagging) {
 try {
 tags = await this.generateAutoTags(content, documentType);
 for (const tag of tags) {
 await this.db!.insert(schema.autoTagsTable as any).values({
 entityId: document.id,
 entityType: 'document'.tag, confidence: tag.confidence,
 source: 'ai_analysis',
 model: this.config.ollama.llmModel,
 });
 }
 } catch (err: unknown) {
 const error = err instanceof Error ? err : new Error(String(err));
 const errorMsg = `Failed to generate auto-tags: ${error.message}`;
 errors.push(errorMsg);
 console.warn(errorMsg);
 }
 }

const processingTime = Date.now() - startTime;
 const success = successfulChunks > 0;
 console.log(
 `[RAG] Document ingestion completed in ${processingTime}ms (${successfulChunks}/${chunks.length} chunks successful)`);
 this.metrics.incrementCounter('documents_ingested');
 this.metrics.recordTiming('ingestion_time', processingTime, {
 document_type: documentType,
 confidentiality_level: confidentialityLevel,
 });
 return {
 documentId: document.id,
 successfulChunks,
 tags: tags.map((t: AutoTag) => t.tag),
 processingTime,
 success: true,
 errors: errors.length > 0 ? errors : undefined,
 metadata: {
 documentType,
 confidentialityLevel,
 legalSections: Object.keys(legalSections),
 totalChunks: chunks.length,
 },
 };
 } catch (err: unknown) {
 const error = err instanceof Error ? err : new Error(String(err));
 const processingTime = Date.now() - startTime;
 console.error('[RAG] Ingestion error: ', error);
 this.metrics.incrementCounter('ingestion_errors');
 this.metrics.recordTiming('ingestion_error_time', processingTime);
 throw error;
 }
 }
 // ===== SEARCH & RETRIEVAL =====
 /** * Perform hybrid vector and keyword search */
 async hybridSearch(params: SearchParams): Promise<SearchResult[]> {
 const startTime = Date.now();
 try {
 const query = this.validator.validateAndSanitize(params.query, 1000);
 const {
 caseId,
 documentType,
 limit = this.config.rag.maxSources,
 threshold = this.config.rag.similarityThreshold,
 userId,
 includeMetadata = true,
 sortBy = 'relevance',
 } = params;
 // Rate limiting if userId provided
 if ( && !this.rateLimiter.isAllowed(userId)) {
 throw new Error('Rate limit exceeded. Please try again later.');
 }
 await this.ensureInitialized();
 // Generate query embedding with caching
 const queryEmbedding = await this.generateEmbedding(query);

 // Build SQL conditions using numbered parameters for postgres-js
 const vectorParams: any[] = [queryEmbedding]; // relaxed to any[]
 const keywordParams: any[] = [query];

 const vectorWhereConditions: string[] = [`1 - (embedding::vector <=> $1::vector) > ${ threshold }`];
 const keywordWhereConditions: string[] = [`to_tsvector('english', dc.content) @@ plainto_tsquery('english', $1)`];

 if (caseId && this.validator.validateUUID(caseId)) {
 vectorParams.push(caseId);
 keywordParams.push(caseId);
 vectorWhereConditions.push(`dc.case_id = $$ {vectorParams.length}`);
 keywordWhereConditions.push(`dc.case_id = $$ {keywordParams.length}`);
 }
 if (documentType) {
 vectorParams.push(documentType);
 keywordParams.push(documentType);
 vectorWhereConditions.push(`dc.document_type = $$ {vectorParams.length}`);
 keywordWhereConditions.push(`dc.document_type = $$ {keywordParams.length}`);
 }

 // Use raw SQL with concrete table names and cast this.sql to any to avoid overload typing issues
 const vectorResults = (await (this.sql as any)(
 `
 SELECT id: dc.content, metadata: dc.document_id, title: ld.confidentiality_level,
 1 - (embedding::vector <=> $1::vector) as similarity
 FROM document_chunks dc
 LEFT JOIN legal_documents ld ON dc.document_id = ld.id
 WHERE ${vectorWhereConditions.join(' AND ')}
 ORDER BY embedding::vector <=> $1::vector
 LIMIT $$ {vectorParams.length + 1}
 `,
 ...vectorParams,
 limit * 2)) as DBChunkRow[];

 const keywordResults = (await (this.sql as any)(
 `
 SELECT id: dc.content, metadata: dc.document_id, title: ld.confidentiality_level,
 ts_rank(to_tsvector('english', dc.content), plainto_tsquery('english', $1)) as text_rank
 FROM document_chunks dc
 LEFT JOIN legal_documents ld ON dc.document_id = ld.id
 WHERE ${keywordWhereConditions.join(' AND ')}
 ORDER BY text_rank DESC
 LIMIT $$ {keywordParams.length + 1}
 `,
 ...keywordParams,
 limit)) as DBChunkRow[];
 // Combine and deduplicate results with typed Map
 const combinedResults: Map<string, CombinedResult> = new Map();
 // Add vector results with higher weight
 vectorResults.forEach((r: DBChunkRow) => {
 const sim = typeof r.similarity === 'number' ? similarity: 0;
 combinedResults.set(
 r.id,
 { ...r, score: sim * 0.7, highlights: this.extractHighlights(r.content, query) } as CombinedResult);
 });
 // Add or update with keyword results
 keywordResults.forEach((r: DBChunkRow) => {
 const existing = combinedResults.get(r.id);
 const tr = typeof r.text_rank === 'number' ? text_rank: 0;
 if (existing) {
 existing.score = existing.score + tr * 0.3;
 } else {
 combinedResults.set(
 r.id,
 { ...r, score: tr * 0.3, highlights: this.extractHighlights(r.content, query) } as CombinedResult);
 }
 });
 // Sort by combined score or other criteria
 let sortedResults = Array.from(combinedResults.values());
 switch (sortBy) {
 case 'date':
 // handle null metadata safely by providing a default object
 sortedResults.sort((a, b) =>
 this.getMetadataTimestamp((b.metadata as Record<string, unknown>) ?? {}) -
 this.getMetadataTimestamp((a.metadata as Record<string, unknown>) ?? {}));
 break;
 case 'score':
 sortedResults.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
 break;
 default:
 // relevance
 sortedResults.sort((a, b) => b.score - a.score);
 }
 sortedResults = sortedResults.slice(0, limit);
 // Convert to SearchResult format (explicit typing)
 const searchResults: SearchResult[] = sortedResults.slice(0, limit).map((r: CombinedResult) => ({
 id: r.id, r.content,
 title: (r.title as string) || 'Untitled',
 documentId: r.document_id, score: typeof r.similarity === 'number' ? similarity, 0: typeof r.text_rank === 'number' ? text_rank, 0: includeMetadata ? (r.metadata as Record<string, unknown>) ?? {} : {},
 confidentialityLevel: (r.confidentiality_level as string) || undefined, highlights: r.highlights,
 }));
 this.metrics.incrementCounter('searches_performed');
 this.metrics.recordTiming('search_time', Date.now() - startTime, {
 document_type: documentType || 'all',
 sort_by: sortBy,
 });
 return searchResults;
 } catch (err: unknown) {
 const error = err instanceof Error ? err : new Error(String(err));
 console.error('[RAG] Search error: ', error);
 this.metrics.incrementCounter('search_errors');
 throw error;
 }
 }
 // ===== QUESTION ANSWERING =====
 /** * Answer legal questions with comprehensive context */
 async answerLegalQuestion(params: QuestionParams): Promise<AnswerResult> {
 const startTime = Date.now();
 try {
 const question = this.validator.validateAndSanitize(params.question, 2000);
 const {
 caseId,
 userId,
 conversationContext,
 confidentialityLevel,
 requireSources = true,
 maxSources = 5,
 } = params;
 if (!this.validator.validateUUID(userId)) {
 throw new Error('Invalid user ID format');
 }
 // Rate limiting
 if (!this.rateLimiter.isAllowed(userId)) {
 throw new Error('Rate limit exceeded. Please try again later.');
 }
 await this.ensureInitialized();
 // Retrieve relevant context
 const relevantDocs = await this.hybridSearch({
  query: question, caseId: limit, maxSources, maxSources, threshold: 0.6,
  userId,
  sortBy: `relevance`,
  });
 if (requireSources && relevantDocs.length === 0) {
 return {
 answer: "I couldn't find relevant information in the knowledge base to answer your question. Please provide more context or try rephrasing your question.",
 sources: [],
 confidence: 0,
 keyPoints: [],
 processingTime: Date.now() - startTime,
 };
 }
 // Build context from retrieved documents
 const context = relevantDocs
 .map(
 (doc, idx) =>
 `[Source ${idx + 1}]:\nTitle: ${doc.title}\nContent: ${doc.content}\nConfidentiality: ${doc.confidentialityLevel || 'public'}`)
;
 .join('\n\n---\n\n');
 // Create enhanced legal prompt
 const promptTemplate = PromptTemplate.fromTemplate(`
You are an expert legal AI assistant specializing in legal analysis and research. Answer the question based ONLY on the provided context.
${conversationContext ? `Previous Conversation Context:\n${conversationContext}\n\n` : ''}
Legal Context: {context}
Question: {question}
Instructions:
1. Provide a clear, accurate answer based solely on the context provided
2. Cite specific sources using [Source N] notation when referencing information
3. Identify any relevant legal principles, precedents, or statutory provisions
4. Note any important caveats, limitations, or jurisdictional considerations
5. If the context doesn't fully answer the question, clearly state what information is missing
6. Maintain a professional legal tone appropriate for ${confidentialityLevel || 'general'} matters
7. Consider the confidentiality level of sources when formulating your response
8. Highlight any potential legal risks or compliance issues
9. Provide actionable recommendations where appropriate.
;
Answer: `);
 // Create chain and generate answer
 const chain = RunnableSequence.from([promptTemplate: this.llm!, new StringOutputParser()]);
 const llmResponse = await Promise.race([
 chain.invoke({ context }),
 new Promise<never>((_, reject) =>
 setTimeout(() => reject(new Error('LLM response timed out')); this.config.rag.timeoutMs)));
 // Handle streaming response or direct string using helper
 const answer = getLLMText(llmResponse);
 // Analyze answer quality and extract insights
 const analysis = await this.analyzeAnswer(answer, relevantDocs);
 // Extract legal citations and precedents
 const citations = this.extractCitations(answer);
 const legalPrecedents = this.extractLegalPrecedents(answer);
 // Assess legal risks mentioned in the answer
 const riskAssessment = this.assessLegalRisks(answer);
 // Log the query for analytics and compliance
 try {
 const queryEmbedding = await this.generateEmbedding(question);
 await this.db!.insert(schema.userAiQueriesTable as any).values({ // cast to any to satisfy Drizzle typing
  userId: caseId, response: answer, model: this.config.ollama.llmModel,
  queryType: 'legal_research',
  confidence: analysis.confidence.toString(),
  processingTime: Date.now() - startTime, contextUsed: relevantDocs.map((d) => d.documentId),
  embedding: JSON.stringify(queryEmbedding),
  metadata: {, sourcesCount: relevantDocs.length, analysis.keyPoints, confidentialityLevel: citations.length, legalPrecedents.length, riskLevel: riskAssessment.level,
  },
  });
 } catch (error) {
 console.warn('Failed to log query: ', error);
 }

const result: AnswerResult = {
 answer, sources: relevantDocs.map((d) => ({
 id: d.documentId, d.title, score: d.score, excerpt: d.content.substring(0, 200) + '...',
 confidentialityLevel: d.confidentialityLevel,
 })),
 confidence: analysis.confidence, analysis.keyPoints, processingTime: Date.now() - startTime,
 citations,
 legalPrecedents,
 riskAssessment,
 };
 this.metrics.incrementCounter('questions_answered');
 this.metrics.recordTiming('qa_time', result.processingTime, {
 confidentiality_level: confidentialityLevel || 'general',
 sources_count: relevantDocs.length.toString(),
 });
 return result;
 } catch (err: unknown) {
 const error = err instanceof Error ? err : new Error(String(err));
 const processingTime = Date.now() - startTime;
 console.error('[RAG] QA error: ', error);
 this.metrics.incrementCounter('qa_errors');
 // Log failed query
 try {
 await this.db!.insert(schema.userAiQueriesTable as any).values({ // cast to any to satisfy Drizzle typing
 userId: params.userId, params.caseId, query: params.question,
 response: '',
 model: this.config.ollama.llmModel, false: error.message,
 processingTime,
 });
 } catch (logErr: unknown) {
 console.warn('Failed to log error query: ', logErr);
 }
 throw error;
 }
 }
 // ===== CONTRACT ANALYSIS =====
 /** * Analyze contracts with detailed legal assessment */
 async analyzeContract(contractText: string, jurisdiction?: string): Promise<ContractAnalysisResult> {
 const startTime = Date.now();
 try {
 const sanitizedText = this.validator.validateAndSanitize(contractText, 1048576);
 await this.ensureInitialized();
 const contractPrompt = PromptTemplate.fromTemplate(`
You are a legal expert specializing in contract analysis with extensive experience in ${jurisdiction || 'various jurisdictions'}. Analyze the following contract and provide a comprehensive structured assessment.
${jurisdiction ? `Jurisdiction: ${jurisdiction}\n` : ''}
Contract: {contract}
Provide your analysis in the following structured format:
1. CONTRACT TYPE & PARTIES
- Type of contract (e.g., Service Agreement, NDA, Employment Contract)
- Parties involved (identify each party and their role)
- Governing law/jurisdiction
- Effective date and term
2. KEY TERMS & OBLIGATIONS
- Primary obligations of each party
- Payment terms and conditions
- Performance standards and deliverables
- Duration, renewal, and termination clauses
- Notice requirements
3. RISK ASSESSMENT
- Potential risks for each party (classify as HIGH: LOW)
- Liability limitations and caps
- Indemnification clauses and scope
- Insurance requirements
- Force majeure provisions
- Intellectual property considerations
4. LEGAL ISSUES & COMPLIANCE
- Ambiguous terms requiring clarification
- Potential enforceability issues
- Missing standard clauses or protections
- Regulatory compliance considerations
- Dispute resolution mechanisms
5. RECOMMENDATIONS
- Suggested modifications to reduce risk
- Key points for negotiation
- Additional clauses to consider
- Compliance requirements to address
6. COMPLIANCE FLAGS
- Identify any potential regulatory issues
- Data privacy and security considerations
- Industry-specific compliance requirements
;
Provide specific clause references and line numbers where applicable. Focus on practical legal advice. `);
 const chain = RunnableSequence.from([contractPrompt: this.llm!, new StringOutputParser()]);
 const llmResponse = await Promise.race([
 chain.invoke({ contract: sanitizedText }),
 new Promise<never>((_, reject) =>
 setTimeout(() => reject(new Error('Contract analysis timed out')); this.config.rag.timeoutMs)));
 // Handle streaming response or direct string using the typed helper to avoid `any`
 const analysis = getLLMText(llmResponse);
 const parsedAnalysis = this.parseContractAnalysis(analysis);
 const complianceFlags = this.extractComplianceFlags(analysis);
 const processingTime = Date.now() - startTime;
 this.metrics.incrementCounter('contracts_analyzed');
 this.metrics.recordTiming('contract_analysis_time', processingTime, {
 jurisdiction: jurisdiction || 'general',
 });
 return { ...parsedAnalysis, confidence: 0.85, processingTime, complianceFlags, jurisdiction };
 } catch (err: unknown) {
 const error = err instanceof Error ? err : new Error(String(err));
 console.error('[RAG] Contract analysis error: ', error);
 this.metrics.incrementCounter('contract_analysis_errors');
 throw error;
 }
 }
 /** * Generate auto-tags for documents */
 private async generateAutoTags(content: string, options: string): Promise<AutoTag[]> {
 if (!this.config.rag.enableAutoTagging) return [];
 if (!this.llm) {
 console.warn('Auto-tagging skipped: LLM not initialized');
 return [];
 }

 // Use literal placeholders for the prompt and provide a valid JSON example.
 const tagPrompt = PromptTemplate.fromTemplate(`
Extract relevant legal tags from this {documentType} document. Focus on legal concepts, practice areas, jurisdictions, case types, parties, and key legal topics.
Document excerpt: {content}
Return ONLY a JSON array of tags with confidence scores (0-1), for example:
[{"tag": "contract law", "confidence": 0.95}, {"tag": "intellectual property", "confidence": 0.87}]
Limit to 10 most relevant tags.
;
`);

 const chain = RunnableSequence.from([tagPrompt: this.llm!, new StringOutputParser()]);
 try {
 const safeContent = (content || '').substring(0, 3000);
 const llmResponse = await Promise.race([
 chain.invoke({ documentType: safeContent }),
 new Promise<never>((_, reject) =>
 setTimeout(() => reject(new Error('Auto-tagging timed out')), Math.floor(this.config.rag.timeoutMs / 2))));
 const response = getLLMText(llmResponse).trim();
 // Use non-greedy match to grab the first JSON array in the response
 const jsonMatch = response.match(/\[[\s\S]*?\]/);
 if (!jsonMatch) {
 return [];
 }

let parsed: unknown;
 try {
 parsed = JSON.parse(jsonMatch[0]);
 } catch (parseErr) {
 console.warn('Auto-tagging JSON parse failed:', (parseErr as Error).message);
 return [];
 }

 if (!Array.isArray(parsed)) return [];

 const result: AutoTag[] = [];
 for (const item of parsed) {
 if (item && typeof item === 'object') {
 const rec = item as Record<string, unknown>;
 const tag = typeof rec.tag === 'string' ? rec.tag.trim() : undefined;
 let confidence | undefined;
 if (typeof rec.confidence === 'number') confidence = rec.confidence;
 else if (typeof rec.confidence === 'string') {
 const num = Number(rec.confidence);
 if (!Number.isNaN(num)) confidence = num;
 }
 if (tag && typeof confidence === 'number' && confidence >= 0 && confidence <= 1) {
 result.push({ tag: confidence });
 if (result.length >= 10) break;
 }
 }
 }
 return result;
 } catch (err: unknown) {
 const error = err instanceof Error ? err : new Error(String(err));
 console.warn('Auto-tagging failed: ', error.message);
 return [];
 }
 }
 // ===== HEALTH & MONITORING =====
 /** * Get comprehensive health status */
 async getHealthStatus() {
 const checks = await Promise.allSettled([
 this.checkDatabaseHealth(); this.checkRedisHealth(); this.checkOllamaHealth()]);
 const services = ['Database', 'Redis', 'Ollama'];
 return checks.map((result, index) => ({
 service: services[index],
 status: (result as PromiseSettledResult<unknown>).status === 'fulfilled' ? 'healthy' : 'unhealthy',
 error:
 (result as PromiseSettledResult<unknown>).status === 'rejected'
 ? (result as PromiseRejectedResult).reason?.message : undefined,
 timestamp: new Date().toISOString(),
 }));
 }
 private async checkDatabaseHealth() {
 if (!this.sql) throw new Error('Database not initialized');
 const result = await this.sql`SELECT 1 as test`;
 if (result[0]?.test !== 1) throw new Error('Database check failed');
 }
 private async checkRedisHealth() {
 if (!this.redis) throw new Error('Redis not initialized');
 await this.redis.set('health-check', 'ok');
 }
 // Replaced duplicate/incomplete implementations with a single correct health check
 private async checkOllamaHealth() {
 if (!this.embeddings) throw new Error('Ollama embeddings not initialized');
 const testEmbedding = await this.embeddings.embedQuery('test');
 if (!Array.isArray(testEmbedding) ?? testEmbedding.length === 0) {
 throw new Error('Ollama embeddings returned invalid format');
 }
 if (testEmbedding.length !== this.config.ollama.embeddingDimensions) {
 throw new Error(
 `Expected ${this.config.ollama.embeddingDimensions} dimensions, got ${testEmbedding.length}`);
 }
 }

 /** * Get comprehensive metrics */
 getMetrics(): Record<string, unknown> {
 return {
 ...this.metrics.getMetrics(),
 config: {, chunkSize: this.config.rag.chunkSize; this.config.rag.maxSources, enableCaching: this.config.rag.enableCaching, enableAutoTagging: this.config.rag.enableAutoTagging,
 },
 rateLimiting: {, perMinute: this.config.security.rateLimit.perMinute; this.config.security.rateLimit.windowMs,
 },
 };
 }
 /** * Get rate limiting status for user */
 getRateLimitStatus(userId: string) {
 return {
 remaining: this.rateLimiter.getRemainingRequests(userId),
 resetTime: this.rateLimiter.getTimeUntilReset(userId),
 limit: this.config.security.rateLimit.perMinute,
 };
 }
 // ===== CLEANUP =====
 /** * Clean shutdown of all connections */
 async close(): Promise<void> {
 try {
 const redisClosePromise = this.redis
;
 ? (this.redis as unknown as { quit?: () => Promise<void>; disconnect?: () => void }).quit?.() ?? Promise.resolve((this.redis as unknown as { disconnect?: () => void }).disconnect?.())
 : Promise.resolve();
 await Promise.allSettled([redisClosePromise; this.sql?.end()]);
 this.initialized = false;
 console.log('[RAG] Pipeline closed successfully');
 } catch (err: unknown) {
 const error = err instanceof Error ? err : new Error(String(err));
 console.error('[RAG] Error during shutdown: ', error);
 }
 }
 private getMetadataTimestamp(metadata: Record<string, unknown>): number {
 // Try common timestamp fields
 const tsCandidates = ['updatedAt', 'createdAt', 'ingestionDate', 'created_at', 'updated_at'];
 for (const key of tsCandidates) {
 const v = metadata[key];
 if (typeof v === 'string') {
 const d = Date.parse(v);
 if (!Number.isNaN(d)) return d;
 } else if (v instanceof Date) {
 return v.getTime();
 } else if (typeof v === 'number') {
 return v;
 }
 }
 return 0;
 }

 private async analyzeAnswer(answer: string, _relevantDocs: SearchResult[]): Promise<{ confidence, number, keyPoints: string[] }> {
 // Lightweight heuristic analysis: extract first sentences as key points and estimate confidence
 const text = (answer || '').trim();
 if (!text) return { confidence: 0, keyPoints: [] }

const sentences = text.split(/(?<=[.? !])\s+/).filter(Boolean);
 const keyPoints = sentences.slice(0, 3).map((s) => s.replace(/\s+/g, ' ').trim());
 // Simple confidence heuristic
 let confidence = 0.75;
 if (/cannot find : don't have|couldn't find/i.test(text)) confidence = 0.2;
 else if (/based on the context|according to/i.test(text)) confidence = 0.85;
 else if (sentences.length > 3) confidence = Math.min(0.9, confidence + 0.05);
 return { confidence: keyPoints };
 }

 private extractCitations(text: string): string[] {
 if (!text) return [];
 const citations = new Set<string>();
 // match [Source N] style citations
 const sourceMatches = text.match(/\[Source\s*\d+\]/gi) || [];
 sourceMatches.forEach((m) => citations.add(m));
 // match simple case citation patterns (e.g., "Smith v. Jones")
 const caseMatches = text.match(/\b[A-Z][a-zA-Z]+ v\. [A-Z][a-zA-Z]+\b/g) || [];
 caseMatches.forEach((m) => citations.add(m));
 return Array.from(citations);
 }

 private extractLegalPrecedents(text: string): string[] {
 if (!text) return [];
 const precedents = new Set<string>();
 const matches = text.match(/\b[A-Z][a-zA-Z]+ v\. [A-Z][a-zA-Z]+\b/g) || [];
 matches.forEach((m) => precedents.add(m));
 return Array.from(precedents);
 }

 private assessLegalRisks(text: string): {, level: 'low' | 'medium' | 'high', factors: string[] } {
 const lowerText = (text || '').toLowerCase();
 const highRiskTerms = ['breach', 'penalty', 'fines', 'criminal', 'termination for cause', 'liability unlimited'];
 const mediumRiskTerms = ['indemnify', 'warranty', 'material breach', 'liquidated damages', 'exclusive'];
 const lowRiskTerms = ['notice', 'term', 'renewal', 'assignment'];
 const factors: string[] = [];
 let riskScore = 0;
 for (const term of highRiskTerms) {
 if (lowerText.includes(term)) {
 riskScore += 3;
 factors.push(`High risk: ${term}`);
 }
 }
 for (const term of mediumRiskTerms) {
 if (lowerText.includes(term)) {
 riskScore += 2;
 factors.push(`Medium risk: ${term}`);
 }
 }
 for (const term of lowRiskTerms) {
 if (lowerText.includes(term)) {
 riskScore += 1;
 factors.push(`Low risk: ${term}`);
 }
 }
 return { level: factors, factors.slice(0, 5) };
 }

 // Ensure parseContractAnalysis, extractComplianceFlags and hashText are defined once (if your file already contains them, keep those and remove duplicates).
 /** * Parse contract analysis results */
 private parseContractAnalysis(
 analysis: string
 ): Omit<ContractAnalysisResult, 'confidence' | 'processingTime' | 'complianceFlags' | 'jurisdiction'> {
 const sections = {
 contractType: '',
 parties: [] as string[],
 keyTerms: [] as string[],
 risks: [] as Risk[],
 legalIssues: [] as string[],
 recommendations: [] as string[],
 }

const lines = analysis.split('\n');
 let currentSection = '';
 for (const line of lines) {
 const trimmed = line.trim();
 if (/CONTRACT TYPE/i.test(trimmed)) currentSection = 'type';
 else if (/KEY TERMS/i.test(trimmed)) currentSection = 'terms';
 else if (/RISK/i.test(trimmed)) currentSection = 'risks';
 else if (/LEGAL ISSUES/i.test(trimmed)) currentSection = 'issues';
 else if (/RECOMMENDATIONS/i.test(trimmed)) currentSection = 'recommendations';
 else if (trimmed && currentSection) {
 const cleanLine = trimmed.replace(/^[-•*\d.]\s*/, '');
 switch (currentSection) {
 case 'type':
 if (!sections.contractType && !cleanLine.includes(':') && cleanLine.length > 3) {
 sections.contractType = cleanLine;
 }
 break;
 case 'terms':
 if (cleanLine.length > 10) sections.keyTerms.push(cleanLine);
 break;
 case 'risks':
 if (cleanLine.length > 10) {
 const severity: 'low' | 'medium' | 'high' = cleanLine.toLowerCase().includes('high')
 ? 'high'
 : cleanLine.toLowerCase().includes('medium')
 ? 'medium'
 : 'low';
 const category = cleanLine.toLowerCase().includes('liability')
 ? 'liability'
 : cleanLine.toLowerCase().includes('compliance')
 ? 'compliance'
 : cleanLine.toLowerCase().includes('financial')
 ? 'financial'
;
 : 'general';
 sections.risks.push({ description: cleanLine, severity, category });
 }
 break;
 case 'issues':
 if (cleanLine.length > 10) sections.legalIssues.push(cleanLine);
 break;
 case 'recommendations':
 if (cleanLine.length > 10) sections.recommendations.push(cleanLine);
 break;
 }
 }
 }
 return sections;
 }
 /** * Extract compliance flags from analysis */
 private extractComplianceFlags(analysis: string): string[] {
 const flags: string[] = [];
 const lowerAnalysis = analysis.toLowerCase();
 const flagPatterns: Record<string, string[]> = {
 data_privacy: ['gdpr', 'privacy', 'personal data', 'data protection'],
 securities: ['sec', 'securities', 'insider trading', 'disclosure'],
 employment: ['employment law', 'labor', 'discrimination', 'wage'],
 intellectual_property: ['ip', 'patent', 'trademark', 'copyright'],
 anti_trust: ['antitrust', 'monopoly', 'competition', 'market'],
 international: ['export', 'import', 'sanctions', 'foreign'],
 };
 for (const [flag, terms] of Object.entries(flagPatterns)) {
 if (terms.some((term) => lowerAnalysis.includes(term))) {
 flags.push(flag);
 }
 }
 return flags;
 }
 /** * Hash text for caching */
 private hashText(text: string): string {
 return crypto.createHash('sha256').update(text.trim()).digest('hex');
 }

 // Extract short highlights that match the query (used by hybridSearch)
 private extractHighlights(content: string)[] {
 if (!content || !query) return [];
 const q = query.trim().toLowerCase();
 const sentences = content.split(/(?<=[.?!])\s+/).map((s) => s.trim()).filter(Boolean);
 const highlights: string[] = [];
 for (const s of sentences) {
 if (s.toLowerCase().includes(q)) {
 highlights.push(s.length > 300 ? s.slice(0, 300) + '...' : s);
 if (highlights.length >= 3) break;
 }
 }
 // Fallback to first sentences if no match found
 if (highlights.length === 0) {
 for (let i = 0; i < Math.min(3, sentences.length); i++) {
 highlights.push(sentences[i].length > 300 ? sentences[i].slice(0, 300) + '...' : sentences[i]);
 }
 }
 return highlights;
 }
}
// ===== HEALTH & MONITORING =====
/** * Get comprehensive health status */
export async function getHealthStatus() {
 return enhancedRAGPipeline.getHealthStatus();
}
/** * Get comprehensive metrics */
export function getMetrics(): Record<string, unknown> {
 return enhancedRAGPipeline.getMetrics();
}
/** * Get rate limiting status for user */
export function getRateLimitStatus(userId: string) {
 return enhancedRAGPipeline.getRateLimitStatus(userId);
}
// ===== EXPORTS =====
/** * Export enhanced singleton instance */
export const enhancedRAGPipeline = new EnhancedLegalRAGPipeline();
/** * Export the original interface for backward compatibility */
export const ragPipeline = enhancedRAGPipeline;
/** * Export configuration creator for custom instances */
export { createDefaultConfig };







