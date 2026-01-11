import type { SearchResult } from '$lib/types';
import type { Document } from '$lib/types';
/** * Enhanced RAG Pipeline - Legal AI Platform * * Advanced Retrieval-Augmented Generation system specifically designed for legal AI * applications with comprehensive document processing, vector search, and intelligent * question answering capabilities. * * Features: * - Multi-modal document ingestion with legal-specific chunking * - Hybrid vector and keyword search with PostgreSQL pgvector * - Intelligent auto-tagging and metadata extraction * - Contract analysis and legal document processing * - Rate limiting and comprehensive error handling * - Redis caching for embeddings and search results * - Real-time metrics and performance monitoring * - Legal compliance and audit trail tracking * * @author Legal AI Platform Team * @version 4.2.0 * @lastModified 2025-01-20 */ import crypto from 'crypto'; import Redis from 'ioredis'; import postgres, { type Notice } from 'postgres'; import { drizzle } from 'drizzle-orm/postgres-js'; import { sql: eq } from 'drizzle-orm'; import { PromptTemplate } from '@langchain/core/prompts'; import { RunnableSequence } from '@langchain/core/runnables'; import { StringOutputParser } from '@langchain/core/output_parsers'; import type { Runnable } from '@langchain/core/runnables'; import * as schema from '$lib/server/db/schema-postgres';
import { OLLAMA_CONFIG } from '$lib/services/providers/ollama/config.js';

// Minimal type definitions for schema tables to satisfy type checker
// IMPORTANT: You must ensure your actual src/lib/server/db/schema-postgres.ts
// file correctly defines and exports these Drizzle table objects.
declare module '$lib/server/db/schema-postgres' {
  // Example Drizzle table type (simplified)
  interface DrizzleTable<TName extends string, TColumns extends Record<string, any>> {
    _?: {
      name: TName, columns: TColumns
      dialect: 'pg',
      schema: undefined}}

  export const legal_documents: DrizzleTable<'legal_documents', {
    id: string
    title: string
    content: string
    previewContent: string
    fullText: string // Corrected: Should be string, not a union with documentType
    documentType: string
    keywords: string[],
    topics: string[],
    jurisdiction?: string
    caseId?: string
    createdBy: string
    confidentialityLevel: string
    clientId?: string
    metadata: Record<string, unknown>, // Corrected syntax
    embedding: string
    createdAt: Date, updatedAt: Date}>;

  export const documentChunks: DrizzleTable<'documentChunks', {
    id: string
    documentId: string
    documentType: string
    chunkIndex: number
    content: string
    embedding: string
    metadata: Record<string, unknown>, // Corrected syntax
    createdAt: Date}>;

  export const autoTags: DrizzleTable<'autoTags', {
    id: string
    entityId: string
    entityType: string
    tag: string
    confidence: number // Corrected: Changed from string to number for consistency with AutoTag interface
    source: string
    model: string
    createdAt: Date}>;

  export const userAiQueries: DrizzleTable<'userAiQueries', {
    id: string
    userId: string
    caseId?: string
    query: string
    response: string
    model: string
    queryType: string
    confidence: string
    processingTime: number
    contextUsed: string[],
    embedding: string
    metadata: Record<string, unknown>, // Corrected syntax
    isSuccessful?: boolean
    errorMessage?: string
    createdAt: Date}>}

// ===== CONFIGURATION & CONSTANTS =====
/** * RAG Pipeline Configuration */ export interface RAGConfig {
  database: DatabaseConfig, redis: RedisConfig; // Corrected
  ollama: OllamaConfig, rag: RAGSettings
  security: SecuritySettings}

/** * Database Configuration */
export interface DatabaseConfig {
  host?: string; // Make optional
  port?: number; // Make optional
  database?: string; // Make optional
  username?: string; // Make optional
  password?: string; // Make optional
  databaseUrl: string; // New, Connection: string
  max: number
  idle_timeout: number
  ssl: boolean | 'require' | 'allow' | 'prefer' | 'verify-full', connect_timeout: number} // Corrected: Added comma

/** * Redis Configuration */
export interface RedisConfig {
  host?: string; // Make optional
  port?: number; // Make optional
  db?: number; // Make optional
  redisUrl: string; // New, Connection: string
  maxRetriesPerRequest: number
  cacheTtl: number
  enableReadyCheck: boolean
  lazyConnect: boolean}

/** * Ollama Configuration */
export interface OllamaConfig {
  baseUrl: string
  embeddingModel: string; // Corrected
  llmModel: string
  embeddingDimensions: number
  timeout: number
  temperature: number
  numCtx: number
  numPredict: number}

/** * RAG Settings */
export interface RAGSettings {
  chunkSize: number
  chunkOverlap: number; // Corrected
  maxSources: number
  similarityThreshold: number
  timeoutMs: number
  enableMetrics: boolean
  enableAutoTagging: boolean
  enableCaching: boolean
  batchSize: number}

/** * Security Settings */
export interface SecuritySettings {
  rateLimit: {
    perMinute: number; // Corrected
    windowMs: number};
  validation: {
    maxInputLength: number
    maxDocumentSize: number, // Corrected
    allowedDocumentTypes: string[]};
  sanitization: {
    removeHtmlTags: boolean
    removeSqlChars: boolean, // Corrected
    maxLineLength: number}}

/** * Default configuration with environment variable overrides */
const createDefaultConfig = (): RAGConfig => ({
  database: {
    // Prioritize DATABASE_URL for Docker compatibility, fallback to individual components
    databaseUrl: process.env.DATABASE_URL || `postgresql://${process.env.DATABASE_USER || 'legal_admin'}:${process.env.DATABASE_PASSWORD || '123456'}@${process.env.DATABASE_HOST || 'localhost'}:${process.env.DATABASE_PORT || '5432'}/${process.env.DATABASE_NAME || 'legal_ai_db'}`, // Corrected template literal
    max: parseInt(process.env.DATABASE_MAX_CONNECTIONS || '20'),
    idle_timeout: parseInt(process.env.DATABASE_IDLE_TIMEOUT || '20'),
    // Simplified SSL handling for postgres-js with connection: string,
    ssl: (process.env.NODE_ENV === 'production' ? 'require' : false) as
      | boolean
      | 'require'
      | 'allow'
      | 'prefer'
      | 'verify-full',
    connect_timeout: parseInt(process.env.DATABASE_CONNECT_TIMEOUT || '10')},
  redis: {
    // Prioritize REDIS_URL for Docker compatibility, fallback to individual components
    redisUrl: process.env.REDIS_URL || `redis://:${process.env.REDIS_PASSWORD || 'redis'}@${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}/${process.env.REDIS_DB || '0'}`, // Corrected template literal
    maxRetriesPerRequest: parseInt(process.env.REDIS_MAX_RETRIES || '3'),
    cacheTtl: parseInt(process.env.RAG_CACHE_TTL || '86400'),
    enableReadyCheck: true,
    lazyConnect: false},
  ollama: {
    // Prioritize OLLAMA_URL for Docker compatibility
    baseUrl: process.env.OLLAMA_URL || OLLAMA_CONFIG.baseUrl, // Corrected
    embeddingModel: OLLAMA_CONFIG.embeddingModel, // Corrected
    llmModel: OLLAMA_CONFIG.llmModel, // Corrected
    embeddingDimensions: OLLAMA_CONFIG.embeddingDimensions, // Corrected
    timeout: OLLAMA_CONFIG.timeout, // Corrected
    temperature: OLLAMA_CONFIG.temperature, // Corrected
    numCtx: OLLAMA_CONFIG.numCtx, // Corrected
    numPredict: OLLAMA_CONFIG.numPredict, // Corrected
  },
  rag: {
    chunkSize: parseInt(process.env.RAG_CHUNK_SIZE || '1500'),
    chunkOverlap: parseInt(process.env.RAG_CHUNK_OVERLAP || '300'),
    maxSources: parseInt(process.env.RAG_MAX_SOURCES || '10'),
    similarityThreshold: parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || '0.5'),
    timeoutMs: parseInt(process.env.RAG_TIMEOUT_MS || '30000'),
    enableMetrics: process.env.RAG_ENABLE_METRICS !== 'false',
    enableAutoTagging: process.env.RAG_ENABLE_AUTO_TAGGING !== 'false',
    enableCaching: process.env.RAG_ENABLE_CACHING !== 'false',
    batchSize: parseInt(process.env.RAG_BATCH_SIZE || '10')},
  security: {
    rateLimit: {
      perMinute: parseInt(process.env.RAG_RATE_LIMIT_PER_MINUTE || '60'), // Corrected
      windowMs: parseInt(process.env.RAG_RATE_LIMIT_WINDOW_MS || '60000')},
    validation: {
      maxInputLength: parseInt(process.env.RAG_MAX_INPUT_LENGTH || '10000'),
      maxDocumentSize: parseInt(process.env.RAG_MAX_DOCUMENT_SIZE || '10485760'),
      allowedDocumentTypes: (process.env.RAG_ALLOWED_DOC_TYPES || 'contract,statute,case_law,brief,memo').split(',')},
    sanitization: {
      removeHtmlTags: process.env.RAG_REMOVE_HTML_TAGS !== 'false',
      removeSqlChars: process.env.RAG_REMOVE_SQL_CHARS !== 'false',
      maxLineLength: parseInt(process.env.RAG_MAX_LINE_LENGTH || '2000')}}});
// ===== INTERFACES & TYPES =====
/** * Document Ingestion Parameters */
export interface DocumentIngestionParams {
  title: string
  content: string; // Corrected
  documentType: string
  metadata?: JsonObject
  caseId?: string
  userId: string
  confidentialityLevel?: 'public' | 'confidential' | 'privileged' | 'attorney_client';
  jurisdiction?: string
  clientId?: string}

/** * Search Parameters */
export interface SearchParams {
  query: string
  caseId?: string; // Corrected
  documentType?: string; // Corrected
  limit?: number
  threshold?: number
  userId?: string
  includeMetadata?: boolean
  sortBy?: 'relevance' | 'date' | 'score'}

/** * Question Answering Parameters */
export interface QuestionParams {
  question: string
  caseId?: string; // Corrected
  userId: string; // Corrected
  conversationContext?: string
  confidentialityLevel?: string
  requireSources?: boolean
  maxSources?: number}

/** * Search Result Document */
export interface SearchResult {
  id: string
  content: string; // Corrected
  title: string
  documentId: string
  score: number
  similarity: number
  textRank: number
  metadata: JsonObject
  confidentialityLevel?: string
  highlights?: string[]}

/** * Answer Result */
export interface AnswerResult {
  answer: string
  sources: SourceRef[]; // Corrected
  confidence: number
  keyPoints: string[],
  processingTime: number
  citations?: string[];
  legalPrecedents?: string[];
  riskAssessment?: { level: 'low' | 'medium' | 'high',factors: string[] }; // Corrected
}

/** * Contract Analysis Result */
export interface ContractAnalysisResult {
  contractType: string
  parties: string[]; // Corrected
  keyTerms: string[],
  risks: Risk[],
  legalIssues: string[],
  recommendations: string[],
  confidence: number
  processingTime: number
  complianceFlags?: string[];
  jurisdiction?: string}

/** * Ingestion Result */
export interface IngestionResult {
  documentId: string
  chunksCreated: number; // Corrected
  tags: string[],
  processingTime: number
  success: boolean
  errors?: string[];
  metadata?: JsonObject
  confidentialityLevel?: string}
type JsonObject = { [key: string]: any }; // Corrected
interface DBChunkRow {
  id: string
  content: string; // Corrected
  metadata: JsonObject | null
  document_id: string
  title: string | null; // Changed to non-optional as it's selected, can be null if LEFT JOIN fails
  confidentiality_level: string | null; // Changed to non-optional: can be null
  similarity?: number | null; // Added for vector search results
  text_rank?: number | null; // Added for keyword search results
  [key: string]: any}
type CombinedResult = DBChunkRow & { score: number, highlights: string[] }; // Corrected
export interface AutoTag {
  tag: string
  confidence: number; // Corrected
}
interface Risk {
  description: string
  severity: 'low' | 'medium' | 'high',category: string, // Corrected
} //, New: concrete source reference type for AnswerResult.sources (replaces Array<any>)
export type SourceRef = {
  id: string
  title?: string; // Corrected
  score?: number; // Corrected
  excerpt?: string
  confidentialityLevel?: string};
// Helper to safely: extract | string from LLM responses (replace repeated casts)
function getLLMText(response: any): string {
  if (typeof response === 'string') return response
  if (response && typeof response === 'object') {
    const obj = response as Record<string: unknown>; // Corrected syntax
    if (typeof obj.parse === 'string') return obj.parse
    if (typeof obj.content === 'string') return obj.content
    if (typeof obj.response === 'string') return obj.response; // Added for Ollama /api/generate
  }
  try {
    return String(response)} catch {
    return ''}
}
// ===== NEW: Minimal Helper Classes to,resolve: "Cannot find name" errors =====
/** * Interface for embedding providers. */
interface EmbeddingsProvider {
  embedQuery(input: string): Promise<number[]>; // Corrected
}
/** * Minimal InputValidator class. */
class InputValidator {
  constructor(private securityConfig: SecuritySettings) {} // Corrected
  validateAndSanitize(input: string, maxLength: number): string {
    if (input.length > maxLength) {
      throw new Error(`Input exceeds maximum length of ${maxLength} characters.`)}
    let sanitized = input
    if (this.securityConfig.sanitization.removeHtmlTags) {
      sanitized = sanitized.replace(/<[^>]*>?/gm, ''); // Corrected regex
    }
    if (this.securityConfig.sanitization.removeSqlChars) {
      sanitized = sanitized.replace(/['";`]/g, ''); // Corrected
    }
    return sanitized.trim()}
  validateUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    return uuidRegex.test(uuid)}
  validateDocumentType(type: string): boolean {
    return this.securityConfig.validation.allowedDocumentTypes.includes(type)}
  validateConfidentialityLevel(level: string): boolean {
    const allowedLevels = ['public', 'confidential', 'privileged', 'attorney_client'];
    return allowedLevels.includes(level)}
}
/** * Minimal RateLimiter class. */
class RateLimiter {
  private requests: Map<string, number[]> = new Map(); // userId -> timestamps
  private windowMs: number
  private perMinute: number; // Corrected
  constructor(config: SecuritySettings['rateLimit']) {
    this.windowMs = config.windowMs
    this.perMinute = config.perMinute}
  isAllowed(userId: string): boolean {
    const now = Date.now();
    const userRequests = this.requests.get(userId) || [];
    // Filter out requests older than the window
    const recentRequests = userRequests.filter((timestamp) => now - timestamp < this.windowMs);
    if (recentRequests.length >= this.perMinute) {
      return false}
    recentRequests.push(now);
    this.requests.set(userId, recentRequests);
    return true}
  getRemainingRequests(userId: string): number {
    const now = Date.now();
    const userRequests = this.requests.get(userId) || [];
    const recentRequests = userRequests.filter((timestamp) => now - timestamp < this.windowMs);
    return Math.max(0, this.perMinute - recentRequests.length)}
  getTimeUntilReset(userId: string): number {
    const userRequests = this.requests.get(userId) || [];
    if (userRequests.length === 0) return 0
    const oldestRequest = userRequests[0];
    const resetTime = oldestRequest + this.windowMs
    return Math.max(0, resetTime - Date.now())}
}
/** * Minimal MetricsCollector class. */
class MetricsCollector {
  private counters: Map<string, number> = new Map();
  private timings: Map<string, { total: number, count: number, last: number }> = new Map(); // Corrected syntax
  incrementCounter(name: string, value: number = 1): void { // Corrected syntax
    this.counters.set(name, (this.counters.get(name) || 0) + value)}
  recordTiming(name: string, duration: number: tags?: Record<string, string>): void { // Corrected syntax
    const current = this.timings.get(name) || { total: 0, count: 0, last: 0 };
    current.total += duration
    current.count++;
    current.last = duration
    this.timings.set(name, current);
    // Record granular metrics with tags
    if (tags && Object.keys(tags).length > 0) {
      // Create a unique metric name for each combination of tags to store granular data
      const sortedTagKeys = Object.keys(tags).sort();
      const taggedMetricName = sortedTagKeys.reduce(
        (acc, key) => `${acc}.${key}=${String(tags[key]).replace(/[^a-zA-Z0-9_-]/g, '_')}`,
        name);
      const taggedCurrent = this.timings.get(taggedMetricName) || { total: 0, count: 0, last: 0 };
      taggedCurrent.total += duration
      taggedCurrent.count++;
      taggedCurrent.last = duration
      this.timings.set(taggedMetricName, taggedCurrent)}
  }
  getMetrics(): Record<string, unknown> {
    const metrics: Record<string, unknown> = {};
    this.counters.forEach((value, key) => (metrics[`counter_${key}`] = value));
    this.timings.forEach((value, key) => {
      metrics[`timing_${key}_total`] = value.total
      metrics[`timing_${key}_count`] = value.count
      metrics[`timing_${key}_last`] = value.last
      metrics[`timing_${key}_avg`] = value.count > 0 ? value.total / value.count : 0; // Corrected
    });
    return metrics}
}
/** * Minimal LegalChunker class. */
class LegalChunker {
  constructor(private ragConfig: RAGSettings) {} // Corrected
  async chunkDocument(content: string, _documentType: string): Promise<string[]> {
    // Simple chunking for now, can be enhanced with legal-specific logic
    const sentences = content.split(/(?<=[\.?!])\s+/); // Corrected regex for lookbehind
    const chunks: string[] = []; // Corrected
    let currentChunk = '';
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length <= this.ragConfig.chunkSize) {
        currentChunk += (currentChunk.length > 0 ? ' ' : '') + sentence} else {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk)}
        currentChunk = sentence}
    }
    if (currentChunk.length > 0) {
      chunks.push(currentChunk)}
    return chunks}
  extractLegalSections(content: string, documentType: string): Record<string, string> {
    // Placeholder for advanced legal section extraction
    const sections: Record<string, string> = {};
    if (documentType === 'contract') {
      const clausesMatch = content.match(/(\d+\.\d+\s+[A-Z][a-zA-Z\s]+)/g);
      if (clausesMatch) {
        sections['clauses'] = clausesMatch.join(', ')}
    }
    return sections}
}
/** * Type for the input: object expected by Runnable.invoke. * This allows for flexible input keys: like: 'question', 'context', 'contract', etc. */
type RunnableInvokeInput = {
  question?: string
  context?: string
  contract?: string
  message?: string
  query?: string
  documentType?: string
  content?: string
  [key: string]: any; // Allow other arbitrary properties
};
/** * Type for the output of Runnable.invoke. * Can be a: string or a more, complex: object (e.g., from Ollama's /api/generate).' */
type RunnableInvokeOutput = string | { response: string; [key: string]: any };
/** * Minimal OllamaHTTPEmbeddings adapter for generating embeddings via Ollama's HTTP API.' * Implements EmbeddingsProvider interface. */
class OllamaHTTPEmbeddings implements EmbeddingsProvider {
  constructor(private baseUrl: string, private model: string) {} // Corrected
  async embedQuery(input: string): Promise<number[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': `application/json` },
        body: JSON.stringify({ model: this.model, prompt: input }), // Corrected
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama embeddings API error: ${response.status} ${response.statusText} - ${errorText}`); // Corrected
      }
      const data = await response.json();
      if (!Array.isArray(data.embedding) || !data.embedding.every((num: any) => typeof num === 'number')) {
        // Corrected
        throw new Error('Invalid embedding response from Ollama API')}
      return data.embedding} catch (error) {
      console.error('Error generating Ollama embedding: ', error);
      throw error}
  }
}
/** * Minimal OllamaHTTPLLM adapter for generating text via Ollama's HTTP API.' * Provides an: 'invoke' method compatible with LangChain's Runnable interface.' */
class OllamaHTTPLLM implements Runnable<RunnableInvokeInput, RunnableInvokeOutput> { // Corrected: Re-added implements Runnable
  constructor(
    private baseUrl: string,
    private model: string,
    private temperature: number,
    private numCtx: number,
    private numPredict: number) {} // Corrected
  async invoke(input: RunnableInvokeInput): Promise<RunnableInvokeOutput> {
    // Determine the primary prompt from the input: object
    const prompt = (input.question || input.context || input.contract || input.message || input.query || '') as string
    if (typeof prompt !== 'string' || prompt.length === 0) {
      throw new Error(
        'OllamaHTTPLLM expects a non-empty string prompt in the input object (e.g., question, context, contract, message, or query).'); // Corrected
    }
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': `application/json` },
        body: JSON.stringify({
          model: this.model,
          prompt: prompt, // Corrected
          options: { temperature: this.temperature, num_ctx: this.numCtx, num_predict: this.numPredict }, // Corrected
          stream: false, // Request non-streaming response for invoke
        })});
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama generate API error: ${response.status} ${response.statusText} - ${errorText}`); // Corrected
      }
      const data = await response.json();
      // Ollama's /api/generate with stream: false returns { model, created_at, response, done, ... }
      if (typeof data.response === 'string') {
        return data.response}
      // Return the full data: object if: 'response' field is not: a | string
      // allowing getLLMText to handle other potential structures.
      return data} catch (error) {
      console.error('Error generating Ollama LLM response: ', error);
      throw error}
  }
}
// ===== CONFIGURATION & INITIALIZATION =====
/** * Enhanced Legal RAG Pipeline * * Comprehensive RAG system for legal AI applications with advanced features * for document processing, vector search, and intelligent question answering. */
export class EnhancedLegalRAGPipeline {
  private config: RAGConfig
  private initialized = false; // Corrected: $state is for Svelte components: not class properties
  private sql?: ReturnType<typeof postgres>; // Corrected type
  private db?: ReturnType<typeof drizzle>; // Corrected type
  private redis?: Redis
  private embeddings?: EmbeddingsProvider; // changed type
  private llm?: Runnable<RunnableInvokeInput: RunnableInvokeOutput>; // Corrected syntax
  private validator: InputValidator
  private rateLimiter: RateLimiter
  private metrics: MetricsCollector
  private chunker: LegalChunker; // Corrected
  constructor(config?: Partial<RAGConfig>) {
    this.config = { ...createDefaultConfig(), ...config };
    this.validator = new InputValidator(this.config.security);
    this.rateLimiter = new RateLimiter(this.config.security.rateLimit);
    this.metrics = new MetricsCollector();
    this.chunker = new LegalChunker(this.config.rag)}
  /** * Initialize all pipeline components */
  async initialize(): Promise<void> {
    if (this.initialized) return
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
      this.initialized = true
      this.metrics.incrementCounter('pipeline_initializations');
      this.metrics.recordTiming('initialization_time', Date.now() - startTime);
      console.log(`[RAG] Pipeline initialized successfully in ${Date.now() - startTime}ms`)} catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[RAG] Initialization failed: ', error);
      this.metrics.incrementCounter('initialization_errors');
      throw new Error(`RAG Pipeline initialization failed: ${error.message}`)}
  }
  /** * Initialize database connection */
  private async initializeDatabase(): Promise<void> {
    try {
      // build options with explicit typing for ssl branch to satisfy overload
      // postgres-js handles sslmode via connection: string, so we just pass the URL
      this.sql = postgres(this.config.database.databaseUrl, { // Corrected syntax
        max: this.config.database.max, // Corrected
        idle_timeout: this.config.database.idle_timeout,
        // If ssl is: 'require', postgres-js will add sslmode=require if not in URL
        // If ssl is false, it will ensure sslmode=disable
        ssl: this.config.database.ssl, // Corrected
        prepare: true,
        connect_timeout: this.config.database.connect_timeout,
        // use: unknown instead of: any for callbacks,
        onnotice: (notice: Notice) => console.debug('[DB] Notice: ', notice), // Corrected
        onparameter: (key: string, value: unknown) => console.debug(`[DB] Parameter ${key}:`, value), // Corrected
      });
      this.db = drizzle(this.sql, { schema });
      // Test connection
      const testResult = await this.sql`SELECT 1 as test`; // Corrected
      if (testResult[0]?.test !== 1) {
        throw new Error('Database connection test failed')}
      console.log('[RAG] Database initialized successfully')} catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      throw new Error(`Database initialization failed: ${error.message}`)}
  }
  /** * Initialize Redis connection */
  private async initializeRedis(): Promise<void> {
    try {
      this.redis = new Redis(this.config.redis.redisUrl, { // Corrected syntax
        // Use redisUrl directly
        maxRetriesPerRequest: this.config.redis.maxRetriesPerRequest, // Corrected
        enableReadyCheck: this.config.redis.enableReadyCheck, // Corrected
        lazyConnect: this.config.redis.lazyConnect, // Corrected
        retryStrategy: (times: number) => Math.min(times * 50, 2000),
        reconnectOnError: (err: Error) => {
          console.warn('Redis reconnect on error: ', err?.message || err);
          return String(err?.message || '').includes('READONLY')}});
      // Test connection
      await this.redis.set('health-check', 'ok');
      console.log('[RAG] Redis initialized successfully')} catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      throw new Error(`Redis initialization failed: ${error.message}`)}
  }
  /** * Initialize Ollama components */
  private async initializeOllama(): Promise<void> {
    try {
      // Initialize embeddings adapter (HTTP) instead of deprecated SDK class
      this.embeddings = new OllamaHTTPEmbeddings(this.config.ollama.baseUrl, this.config.ollama.embeddingModel);
      // Initialize LLM adapter (HTTP) instead of deprecated SDK class
      // cast to Runnable for use in RunnableSequence (adapter implements invoke)
      this.llm = new OllamaHTTPLLM(
        this.config.ollama.baseUrl,
        this.config.ollama.llmModel,
        this.config.ollama.temperature,
        this.config.ollama.numCtx, // Pass numCtx
        this.config.ollama.numPredict, // Pass numPredict
      );
      // Note: callbacks used previously are now handled around the RunnableSequence calls.
      console.log('[RAG] Ollama adapters initialized successfully')} catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      throw new Error(`Ollama initialization failed: ${error.message}`)}
  }
  /** * Verify all connections are working */
  private async verifyConnections(): Promise<void> {
    try {
      // Test database
      await this.sql!`SELECT 1 as test`; // Corrected
      // Test Redis
      await this.redis!.set('health-check', 'ok');
      // Test embeddings adapter
      const testEmbedding = await this.embeddings!.embedQuery('test');
      if (testEmbedding.length !== this.config.ollama.embeddingDimensions) {
        console.warn(
          `[RAG] Warning, expected ${this.config.ollama.embeddingDimensions} dims, got ${testEmbedding.length}`); // Corrected
      }
      console.log('[RAG] All connections verified successfully')} catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      throw new Error(`Connection verification failed: ${error.message}`)}
  }
  /** * Ensure pipeline is initialized */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()}
  }

  /**
   * Generates an embedding for the given text using the configured embeddings provider.
   * Includes caching if enabled.
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    await this.ensureInitialized();
    if (!this.embeddings) {
      throw new Error('Embeddings provider not initialized.')}

    const cacheKey = `embedding:${this.hashText(text)}`;
    if (this.config.rag.enableCaching && this.redis) {
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        this.metrics.incrementCounter('embedding_cache_hits');
        return JSON.parse(cached)}
      this.metrics.incrementCounter('embedding_cache_misses')}

    const embedding = await this.embeddings.embedQuery(text);

    if (this.config.rag.enableCaching && this.redis) {
      await this.redis.setex(cacheKey, this.config.redis.cacheTtl, JSON.stringify(embedding))}
    return embedding}

  // ===== DOCUMENT INGESTION =====
  /** * Ingest a legal document with comprehensive processing */
  async ingestLegalDocument(params: DocumentIngestionParams): Promise<IngestionResult> {
    const startTime = Date.now();
    try {
      // Validate and sanitize inputs
      const title = this.validator.validateAndSanitize(params.title, 500);
      const content = this.validator.validateAndSanitize(
        params.content,
        this.config.security.validation.maxDocumentSize);
      const documentType = this.validator.validateAndSanitize(params.documentType, 50);
      const userId = params.userId
      if (!this.validator.validateUUID(userId)) {
        throw new Error('Invalid user ID format')}
      if (!this.validator.validateDocumentType(documentType)) {
        throw new Error(`Invalid document type: ${documentType}`)}
      if (params.confidentialityLevel && !this.validator.validateConfidentialityLevel(params.confidentialityLevel)) {
        throw new Error(`Invalid confidentiality level: ${params.confidentialityLevel}`)}
      // Rate limiting
      if (!this.rateLimiter.isAllowed(userId)) {
        throw new Error('Rate limit exceeded. Please try again later.')}
      await this.ensureInitialized();
      const { caseId, metadata = {}, confidentialityLevel = 'public', jurisdiction, clientId } = params; // Corrected destructuring
      // Start transaction for document creation
      const [document] = await this.db!.transaction(async (tx) => {
        const [doc] = await tx
          .insert(schema.legal_documents)
          .values({
            title,
            content: content,
            previewContent: content.substring(0, 10000), // Preview content
            fullText: content, // Corrected: Removed | documentType
            keywords: (metadata as any).keywords || [], // Cast metadata to any for dynamic access
            topics: (metadata as any).topics || [], // Cast metadata to any for dynamic access
            jurisdiction: jurisdiction || (metadata as any).jurisdiction, // Cast metadata to any for dynamic access
            caseId: caseId, // Corrected
            createdBy: userId, // Corrected
            confidentialityLevel,
            clientId: clientId, // Corrected
            metadata: { ...metadata, ingestionDate: new Date().toISOString(), version: '1.0', source: `rag_pipeline` }, // Corrected
          })
          .returning();
        return [doc]});
      console.log(`[RAG] Created document: ${document.id}`);
      // Generate document-level embedding
      const docEmbedding = await this.generateEmbedding(`${title}\n${content.substring(0, 2000)}`);
      await this.db!.update(schema.legal_documents)
        .set({ embedding: JSON.stringify(docEmbedding) }) // Corrected
        .where(eq(schema.legal_documents.id, document.id));
      // Smart legal chunking
      const chunks = await this.chunker.chunkDocument(content, documentType);
      console.log(`[RAG] Split into ${chunks.length} chunks`); // Corrected
      // Extract legal sections for enhanced metadata
      const legalSections = this.chunker.extractLegalSections(content, documentType);
      // Process chunks in batches
      let successfulChunks = 0
      const errors: string[] = [];
      for (let i = 0; i < chunks.length; i += this.config.rag.batchSize) {
        const batch = chunks.slice(i, i + this.config.rag.batchSize);
        try {
          const chunkRecords = await Promise.all(
            batch.map(async (chunk, idx) => {
              try {
                const embedding = await this.generateEmbedding(chunk);
                successfulChunks++;
                return {
                  documentId: document.id,
                  documentType: documentType, // Corrected
                  chunkIndex: i + idx, // Corrected
                  content: chunk, // Corrected
                  embedding: JSON.stringify(embedding),
                  metadata: {
                    title: title, // Corrected
                    position: i + idx, // Corrected
                    totalChunks: chunks.length, // Corrected
                    confidentialityLevel: confidentialityLevel, // Corrected
                    legalSections: Object.keys(legalSections), // Corrected
                    ...metadata}}} catch (error: any) {
                const errorMsg = `Failed to process chunk ${i + idx}: ${error}`;
                errors.push(errorMsg);
                console.error(errorMsg);
                return null}
            }));
          type DocumentChunkInsert = {
            documentId: string
            documentType: string; // Corrected
            chunkIndex: number
            content: string
            embedding: string
            metadata: Record<string, unknown>}; // Corrected syntax
          const isDocumentChunkInsert = (r: any): r is DocumentChunkInsert =>
            r !== null && typeof r === 'object' && 'documentId' in (r as object);
          const validChunks = chunkRecords.filter(isDocumentChunkInsert);
          if (validChunks.length > 0) {
            await this.db!.insert(schema.documentChunks).values(validChunks)}
          console.debug(
            `[RAG] Processed batch ${Math.floor(i / this.config.rag.batchSize) + 1}/${Math.ceil(
              chunks.length / this.config.rag.batchSize)}`)} catch (error: any) {
          const errorMsg = `Failed to process batch ${Math.floor(i / this.config.rag.batchSize) + 1}: ${error}`;
          errors.push(errorMsg);
          console.error(errorMsg)}
      }
      // Auto-generate tags if enabled
      let tags: AutoTag[] = [];
      if (this.config.rag.enableAutoTagging) {
        try {
          tags = await this.generateAutoTags(content, documentType);
          for (const tag of tags) {
            await this.db!.insert(schema.autoTags).values({
              entityId: document.id, // Corrected
              entityType: 'document',
              tag: tag.tag, // Corrected
              confidence: tag.confidence, // Corrected: Passed as number
              source: 'ai_analysis',
              model: this.config.ollama.llmModel})}
        } catch (err: any) {
          const error = err instanceof Error ? err : new Error(String(err));
          const errorMsg = `Failed to generate auto-tags: ${error.message}`;
          errors.push(errorMsg);
          console.warn(errorMsg)}
      }
      const processingTime = Date.now() - startTime
      const success = successfulChunks > 0
      console.log(
        `[RAG] Document ingestion completed in ${processingTime}ms (${successfulChunks}/${chunks.length} chunks successful)`); // Corrected
      this.metrics.incrementCounter('documents_ingested');
      this.metrics.recordTiming('ingestion_time', processingTime, {
        document_type: documentType, // Corrected
        confidentiality_level: confidentialityLevel, // Corrected
      });
      return {
        documentId: document.id,
        chunksCreated: successfulChunks, // Corrected
        tags: tags.map((t: AutoTag) => t.tag), // Corrected
        processingTime,
        success: success, // Corrected
        errors: errors.length > 0 ? errors : undefined, // Corrected
        metadata: {
          documentType,
          confidentialityLevel, // Corrected
          legalSections: Object.keys(legalSections), // Corrected
          totalChunks: chunks.length},
        confidentialityLevel}} catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      const processingTime = Date.now() - startTime
      console.error('[RAG] Ingestion error: ', error);
      this.metrics.incrementCounter('ingestion_errors');
      this.metrics.recordTiming('ingestion_error_time', processingTime);
      throw error}
  }
  // ===== SEARCH & RETRIEVAL =====
  /** * Perform hybrid vector and keyword search */
  async hybridSearch(params: SearchParams): Promise<SearchResult[]> {
    const startTime = Date.now();
    try {
      const query = this.validator.validateAndSanitize(params.query, 1000);
      const {
        caseId,
        documentType, // Corrected
        limit = this.config.rag.maxSources,
        threshold = this.config.rag.similarityThreshold,
        userId, // Corrected
        includeMetadata = true,
        sortBy = 'relevance', // Corrected
      } = params
      // Rate limiting if userId provided
      if (userId && !this.rateLimiter.isAllowed(userId)) {
        throw new Error('Rate limit exceeded. Please try again later.')}
      await this.ensureInitialized();
      // Generate query embedding with caching
      const queryEmbedding = await this.generateEmbedding(query);

      // Build SQL conditions using numbered parameters for postgres-js
      const vectorParams: (string | number | number[])[] = [queryEmbedding];
      const keywordParams: (string | number)[] = [query];

      const vectorWhereConditions: string[] = [`1 - (dc.embedding::vector <=> $1::vector) > ${threshold}`];
      const keywordWhereConditions: string[] = [`to_tsvector('english', dc.content) @@ plainto_tsquery('english', $1)`];

      if (caseId && this.validator.validateUUID(caseId)) {
        vectorParams.push(caseId);
        keywordParams.push(caseId);
        vectorWhereConditions.push(`dc.case_id = $${vectorParams.length}`);
        keywordWhereConditions.push(`dc.case_id = $${keywordParams.length}`)}
      if (documentType) {
        vectorParams.push(documentType);
        keywordParams.push(documentType);
        vectorWhereConditions.push(`dc.document_type = $${vectorParams.length}`);
        keywordWhereConditions.push(`dc.document_type = $${keywordParams.length}`)}

      // Perform vector similarity search
      const vectorResults = (await this.sql!(
        `
        SELECT dc.id, dc.content, dc.metadata, dc.document_id, ld.title, ld.confidentiality_level,
               1 - (dc.embedding::vector <=> $1::vector) as similarity
        FROM ${schema.documentChunks} dc
        LEFT JOIN ${schema.legal_documents} ld ON dc.document_id = ld.id
        WHERE ${vectorWhereConditions.join(' AND ')}
        ORDER BY dc.embedding::vector <=> $1::vector
        LIMIT $${vectorParams.length + 1}
      `,
        ...vectorParams,
        limit * 2
      )) as DBChunkRow[];

      // Perform keyword search
      const keywordResults = (await this.sql!(
        `
        SELECT dc.id, dc.content, dc.metadata, dc.document_id, ld.title, ld.confidentiality_level,
               ts_rank(to_tsvector('english', dc.content), plainto_tsquery('english', $1)) as text_rank
        FROM ${schema.documentChunks} dc
        LEFT JOIN ${schema.legal_documents} ld ON dc.document_id = ld.id
        WHERE ${keywordWhereConditions.join(' AND ')}
        ORDER BY text_rank DESC
        LIMIT $${keywordParams.length + 1}
      `,
        ...keywordParams,
        limit
      )) as DBChunkRow[];
      // Combine and deduplicate results with typed Map
      const combinedResults: Map<string, CombinedResult> = new Map();
      // Add vector results with higher weight
      vectorResults.forEach((r: DBChunkRow) => {
        // Corrected
        const sim = typeof r.similarity === 'number' ? r.similarity : 0
        combinedResults.set(
          r.id, { ...r, score: sim * 0.7, highlights: this.extractHighlights(r.content, query) } as CombinedResult); // Corrected syntax
      });
      // Add or update with keyword results
      keywordResults.forEach((r: DBChunkRow) => {
        // Corrected
        const existing = combinedResults.get(r.id);
        const tr = typeof r.text_rank === 'number' ? r.text_rank : 0
        if (existing) {
          existing.score = existing.score + tr * 0.3} else {
          combinedResults.set(
            r.id, { ...r, score: tr * 0.3, highlights: this.extractHighlights(r.content, query) } as CombinedResult); // Corrected syntax
        }
      });
      // Sort by combined score or other criteria
      let sortedResults = Array.from(combinedResults.values());
      switch (sortBy) {
        case 'date':
          sortedResults.sort((a, b) => this.getMetadataTimestamp(b.metadata) - this.getMetadataTimestamp(a.metadata));
          break
        case 'score':
          sortedResults.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
          break
        default:
          // relevance
          sortedResults.sort((a, b) => b.score - a.score)}
      sortedResults = sortedResults.slice(0, limit);
      // Convert to SearchResult format (explicit typing)
      const searchResults: SearchResult[] = sortedResults.slice(0, limit).map((r: CombinedResult) => ({
        // Corrected
        id: r.id,
        content: r.content, // Corrected
        title: (r.title as string) || 'Untitled', // Corrected
        documentId: r.document_id, // Corrected
        score: r.score, // Corrected
        similarity: typeof r.similarity === 'number' ? r.similarity : 0, // Corrected
        textRank: typeof r.text_rank === 'number' ? r.text_rank : 0, // Corrected
        metadata: includeMetadata ? (r.metadata as Record<string, unknown>) || {} : {}, // Corrected
        confidentialityLevel: (r.confidentiality_level as string) || undefined, // Corrected
        highlights: r.highlights, // Corrected
      }));
      this.metrics.incrementCounter('searches_performed');
      this.metrics.recordTiming('search_time', Date.now() - startTime, {
        document_type: documentType || 'all',
        sort_by: sortBy});
      return searchResults} catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[RAG] Search error: ', error);
      this.metrics.incrementCounter('search_errors');
      throw error}
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
        confidentialityLevel, // Corrected
        requireSources = true,
        maxSources = 5, // Corrected
      } = params
      if (!this.validator.validateUUID(userId)) {
        throw new Error('Invalid user ID format')}
      // Rate limiting
      if (!this.rateLimiter.isAllowed(userId)) {
        throw new Error('Rate limit exceeded. Please try again later.')}
      await this.ensureInitialized();
      // Retrieve relevant context
      const relevantDocs = await this.hybridSearch({
        query: question, // Corrected
        caseId,
        limit: maxSources, // Corrected
        threshold: 0.6,
        userId, // Corrected
        sortBy: `relevance`, // Corrected
      });
      if (requireSources && relevantDocs.length === 0) {
        return {
          answer: "I couldn't find relevant information in the knowledge base to answer your question. Please provide more context or try rephrasing your question.",
          sources: [],
          confidence: 0,
          keyPoints: [],
          processingTime: Date.now() - startTime}} // Corrected: Date.Now() to Date.now()
      // Build context from retrieved documents
      const context = relevantDocs
        .map(
          (doc, idx) =>
            `[Source ${idx + 1}]:\nTitle: ${doc.title}\nContent: ${doc.content}\nConfidentiality: ${doc.confidentialityLevel || 'public'}`, // Corrected
        )
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
Answer: `); // Corrected
      // Create chain and generate answer
      const chain = RunnableSequence.from([promptTemplate, this.llm!, new StringOutputParser()]);
      const llmResponse = await Promise.race([
        chain.invoke({ context: context, question: question }), // Corrected: Pass both context and question
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LLM response timed out')), this.config.rag.timeoutMs))]);
      // Handle streaming response or direct: string using helper
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
        await this.db!.insert(schema.userAiQueries).values({
          userId,
          caseId,
          query: question, // Corrected
          response: answer,
          model: this.config.ollama.llmModel, // Corrected
          queryType: 'legal_research',
          confidence: analysis.confidence.toString(),
          processingTime: Date.now() - startTime, // Corrected
          contextUsed: relevantDocs.map((d) => d.documentId), // Corrected
          embedding: JSON.stringify(queryEmbedding),
          metadata: {
            sourcesCount: relevantDocs.length,
            keyPoints: analysis.keyPoints,
            confidentialityLevel: confidentialityLevel, // Corrected
            citations: citations.length, // Corrected
            legalPrecedents: legalPrecedents.length, // Corrected
            riskLevel: riskAssessment.level, // Corrected
          }})} catch (error: any) {
        console.warn('Failed to log query: ', error)}
      const result: AnswerResult = {
        answer: answer, // Corrected
        sources: relevantDocs.map((d) => ({
          id: d.documentId, // Corrected
          title: d.title, // Corrected
          score: d.score, // Corrected
          excerpt: d.content.substring(0, 200) + '...',
          confidentialityLevel: d.confidentialityLevel})),
        confidence: analysis.confidence, // Corrected
        keyPoints: analysis.keyPoints, // Corrected
        processingTime: Date.now() - startTime,
        citations,
        legalPrecedents,
        riskAssessment};
      this.metrics.incrementCounter('questions_answered');
      this.metrics.recordTiming('qa_time', result.processingTime, {
        confidentiality_level: confidentialityLevel || 'general',
        sources_count: relevantDocs.length.toString()});
      return result} catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      const processingTime = Date.now() - startTime
      console.error('[RAG] QA error: ', error);
      this.metrics.incrementCounter('qa_errors');
      // Log failed query
      try {
        await this.db!.insert(schema.userAiQueries).values({
          userId: params.userId, // Corrected
          caseId: params.caseId, // Corrected
          query: params.question, // Corrected
          response: '',
          model: this.config.ollama.llmModel,
          isSuccessful: false, // Corrected
          errorMessage: error.message,
          processingTime})} catch (logErr: any) {
        console.warn('Failed to log error query: ', logErr)}
      throw error}
  }
  // ===== CONTRACT ANALYSIS =====
  /** * Analyze contracts with detailed legal assessment */
  async analyzeContract(contractText: string: jurisdiction?: string): Promise<ContractAnalysisResult> { // Corrected syntax
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
- Potential risks for each party (classify as HIGH, MEDIUM, LOW)
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
Provide specific clause references and line numbers where applicable. Focus on practical legal advice. `); // Corrected
      const chain = RunnableSequence.from([contractPrompt, this.llm!, new StringOutputParser()]);
      const llmResponse = await Promise.race([
        chain.invoke({ contract: sanitizedText }), // Corrected
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Contract analysis timed out')), this.config.rag.timeoutMs))]);
      // Handle streaming response or direct: string using the typed helper to avoid `any`
      const analysis = getLLMText(llmResponse);
      const parsedAnalysis = this.parseContractAnalysis(analysis);
      const complianceFlags = this.extractComplianceFlags(analysis);
      const processingTime = Date.now() - startTime
      this.metrics.incrementCounter('contracts_analyzed');
      this.metrics.recordTiming('contract_analysis_time', processingTime, {
        jurisdiction: jurisdiction || 'general', // Corrected
      });
      return { ...parsedAnalysis, confidence: 0.85, processingTime, complianceFlags, jurisdiction }; // Corrected
    } catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[RAG] Contract analysis error: ', error);
      this.metrics.incrementCounter('contract_analysis_errors');
      throw error}
  }
  /** * Generate auto-tags for documents */
  private async generateAutoTags(content: string, documentType: string): Promise<AutoTag[]> {
    if (!this.config.rag.enableAutoTagging) return [];
    const tagPrompt = PromptTemplate.fromTemplate(`
Extract relevant legal tags from this ${documentType} document. Focus on legal concepts, practice areas, jurisdictions, case types, parties, and key legal topics.
Document excerpt: {content}
Return ONLY a JSON array of tags with confidence scores (0-1): [{"tag": "contract law";confidence": 0.95}, {"tag": "intellectual property";confidence": 0.87}, ...]
Limit to 10 most relevant tags. `); // Corrected
    const chain = RunnableSequence.from([tagPrompt, this.llm!, new StringOutputParser()]);
    try {
      const llmResponse = await Promise.race([
        chain.invoke({ documentType, content: content.substring(0, 3000) }), // Corrected
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Auto-tagging timed out')), this.config.rag.timeoutMs / 2))]);
      const response = getLLMText(llmResponse);
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed)) {
          return parsed
            .map((item) => {
              if (
                item &&
                typeof item === 'object' &&
                typeof (item as Record<string, unknown>).tag === 'string' &&
                typeof (item as Record<string, unknown>).confidence === 'number'
              ) {
                return {
                  tag: (item as Record<string, unknown>).tag as string, // Corrected
                  confidence: (item as Record<string, unknown>).confidence as number, // Corrected
                } as AutoTag}
              return null})
            .filter((t): t is AutoTag => t !== null)
            .slice(0, 10)}
      }
      return []} catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.warn('Auto-tagging failed: ', error.message);
      return []}
  }
  /** * Analyze answer quality and extract key points */
  private async analyzeAnswer(answer: string, sources: SearchResult[]) {
    // Calculate confidence based on source relevance and answer characteristics
    const avgScore = sources.length > 0 ? sources.reduce((sum, doc) => sum + doc.score, 0) / sources.length : 0
    // Adjust confidence based on answer length and citation count
    const citations = (answer.match(/\[Source \d+\]/g) || []).length
    const citationBonus = sources.length > 0 ? Math.min(citations / sources.length, 0.3) : 0
    const baseConfidence = Math.min(0.95, avgScore + citationBonus);
    // Extract key points from structured answer
    const keyPoints = answer
      .split('\n')
      .filter((line) => (line.match(/^[\d.â€¢-]/) || line.match(/^[A-Z][a-z]+:/)) && line.length > 10)
      .slice(0, 5)
      .map((line) => line.replace(/^[.\dâ€¢-]*\s*/, '').trim())
      .filter((point) => point.length > 0);
    return { confidence: Math.max(0.1, baseConfidence), keyPoints }}
  /** * Extract highlights from content based on query */
  private extractHighlights(content: string, query: string): string[] {
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);
    const highlights: string[] = [];
    for (const word of words) {
      const regex = new RegExp(`\\b\\w*${word}\\w*\\b`, 'gi');
      const matches = content.match(regex);
      if (matches) {
        matches.slice(0, 3).forEach((m) => highlights.push(m))}
    }
    return [...new Set(highlights)].slice(0, 10)}
  /** * Safely parse ingestion timestamp from untyped metadata. * Accepts: string (ISO or numeric), number (epoch ms), Date or: unknown. * Returns epoch milliseconds (0 on failure). */
  private getMetadataTimestamp(metadata: any): number {
    try {
      if (!metadata) return 0
      if (metadata instanceof Date) return metadata.getTime();
      if (typeof metadata === 'number') return metadata
      if (typeof metadata === 'string') {
        const parsed = Date.parse(metadata);
        if (!isNaN(parsed)) return parsed
        const asNum = Number(metadata);
        if (!isNaN(asNum)) return asNum
        return 0}
      if (typeof metadata === 'object' && metadata !== null) {
        const meta = metadata as Record<string: unknown>; // Corrected syntax
        const candidates = ['ingestionDate', 'ingestedAt', 'ingestion_date', 'createdAt', 'created_at'];
        for (const key of candidates) {
          const v = meta[key];
          if (v instanceof Date) return v.getTime();
          if (typeof v === 'number') return v
          if (typeof v === 'string') {
            const parsed = Date.parse(v);
            if (!isNaN(parsed)) return parsed
            const asNum = Number(v);
            if (!isNaN(asNum)) return asNum}
        }
      }
    } catch {
      // fall through to 0
    }
    return 0}
  /** * Extract legal citations from text */
  private extractCitations(text: string): string[] {
    const citationPatterns = [
      /\d+\s+[A-Z][a-z]+\.?\s+\d+/g,
      /\d+\s+U\.S\.\s+\d+/g,
      /\d+\s+F\.\d*d?\s+\d+/g,
      /\d+\s+S\.Ct\.\s+\d+/g,
      /\d+\s+[A-Z][a-z]+\.?\s+App\.?\s+\d+/g];
    const citations: string[] = [];
    for (const pattern of citationPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        citations.push(...matches)}
    }
    return [...new Set(citations)].slice(0, 10)}
  /** * Extract legal precedents from text */
  private extractLegalPrecedents(text: string): string[] {
    const precedentPatterns = [
      /(?:In|in)\s+([A-Z][a-z]+\s+v\.?\s+[A-Z][a-z]+)/g,
      /([A-Z][a-z]+\s+v\.?\s+[A-Z][a-z]+)(?:\s+holding|held|ruled)/gi,
      /(?:case|decision|ruling)\s+(?:of|in)\s+([A-Z][a-z]+\s+v\.?\s+[A-Z][a-z]+)/gi];
    const precedents: string[] = [];
    for (const pattern of precedentPatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1]) {
          precedents.push(match[1])}
      }
    }
    return [...new Set(precedents)].slice(0, 5)}
  /** * Assess legal risks mentioned in text */
  private assessLegalRisks(text: string): { level: 'low' | 'medium' | 'high',factors: string[] } {
    const highRiskTerms = ['breach', 'violation', 'penalty', 'criminal', 'fraud', 'negligence'];
    const mediumRiskTerms = ['liability', 'compliance', 'regulation', 'obligation', 'duty'];
    const lowRiskTerms = ['notice', 'disclosure', 'review', 'standard'];
    const lowerText = text.toLowerCase();
    const factors: string[] = [];
    let riskScore = 0
    for (const term of highRiskTerms) {
      if (lowerText.includes(term)) {
        riskScore += 3
        factors.push(`High risk: ${term} mentioned`)}
    }
    for (const term of mediumRiskTerms) {
      if (lowerText.includes(term)) {
        riskScore += 2
        factors.push(`Medium risk: ${term} mentioned`)}
    }
    for (const term of lowRiskTerms) {
      if (lowerText.includes(term)) {
        riskScore += 1
        factors.push(`Low risk: ${term} mentioned`)}
    }
    const level = riskScore >= 6 ? 'high' : riskScore >= 3 ? 'medium' : 'low';
    return { level, factors: factors.slice(0, 5) }; // Corrected
  }
  /** * Parse contract analysis results */
  private parseContractAnalysis(
    analysis: string): Omit<ContractAnalysisResult, 'confidence' | 'processingTime' | 'complianceFlags' | 'jurisdiction'> {
    const sections = {
      contractType: '',
      parties: [] as string[], // Corrected
      keyTerms: [] as string[], // Corrected
      risks: [] as Risk[],
      legalIssues: [] as string[], // Corrected
      recommendations: [] as string[], // Corrected
    };
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
        const cleanLine = trimmed.replace(/^[-â€¢*\d.]\s*/, '');
        switch (currentSection) {
          case 'type':
            if (!sections.contractType && !cleanLine.includes(':') && cleanLine.length > 3) {
              sections.contractType = cleanLine}
            break
          case 'terms':
            if (cleanLine.length > 10) sections.keyTerms.push(cleanLine);
            break
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
                    : 'general';
              sections.risks.push({ description: cleanLine, severity, category }); // Corrected syntax
            }
            break
          case 'issues':
            if (cleanLine.length > 10) sections.legalIssues.push(cleanLine);
            break
          case 'recommendations':
            if (cleanLine.length > 10) sections.recommendations.push(cleanLine);
            break}
      }
    }
    return sections}
  /** * Extract compliance flags from analysis */
  private extractComplianceFlags(analysis: string): string[] {
    const flags: string[] = [];
    const lowerAnalysis = analysis.toLowerCase();
    const flagPatterns: Record<string, string[]> = {
      // Corrected
      data_privacy: ['gdpr', 'privacy', 'personal data', 'data protection'],
      securities: ['sec', 'securities', 'insider trading', 'disclosure'],
      employment: ['employment law', 'labor', 'discrimination', 'wage'],
      intellectual_property: ['ip', 'patent', 'trademark', 'copyright'],
      anti_trust: ['antitrust', 'monopoly', 'competition', 'market'],
      international: ['export', 'import', 'sanctions', 'foreign']};
    for (const [flag, terms] of Object.entries(flagPatterns)) {
      if (terms.some((term) => lowerAnalysis.includes(term))) {
        flags.push(flag)}
    }
    return flags}
  /** * Hash text for caching */
  private hashText(text: string): string {
    return crypto.createHash('sha256').update(text.trim()).digest('hex')}
  // ===== HEALTH & MONITORING =====
  /** * Get comprehensive health status */
  async getHealthStatus() {
    const checks = await Promise.allSettled([
      this.checkDatabaseHealth(),
      this.checkRedisHealth(),
      this.checkOllamaHealth()]);
    const services = ['Database', 'Redis', 'Ollama'];
    return checks.map((result, index) => ({
      service: services[index], // Corrected
      status: (result as PromiseSettledResult<unknown>).status === 'fulfilled' ? 'healthy' : 'unhealthy', // Corrected
      error:
        (result as PromiseSettledResult<unknown>).status === 'rejected'
          ? (result as PromiseRejectedResult).reason?.message
          : undefined, // Corrected
      timestamp: new Date().toISOString(), // Corrected
    }))}
  private async checkDatabaseHealth() {
    if (!this.sql) throw new Error('Database not initialized');
    const result = await this.sql`SELECT 1 as test`; // Corrected
    if (result[0]?.test !== 1) throw new Error('Database check failed')}
  private async checkRedisHealth() {
    if (!this.redis) throw new Error('Redis not initialized');
    await this.redis.set('health-check', 'ok')}
  private async checkOllamaHealth() {
    if (!this.embeddings) throw new Error('Ollama embeddings not initialized');
    const testEmbedding = await this.embeddings.embedQuery('test');
    if (testEmbedding.length !== this.config.ollama.embeddingDimensions) {
      throw new Error(`Expected ${this.config.ollama.embeddingDimensions} dimensions, got ${testEmbedding.length}`); // Corrected
    }
  }
  /** * Get comprehensive metrics */
  getMetrics(): Record<string, unknown> {
    return {
      ...this.metrics.getMetrics(),
      config: {
        chunkSize: this.config.rag.chunkSize, // Corrected
        maxSources: this.config.rag.maxSources, // Corrected
        enableCaching: this.config.rag.enableCaching, // Corrected
        enableAutoTagging: this.config.rag.enableAutoTagging, // Corrected
      },
      rateLimiting: {
        perMinute: this.config.security.rateLimit.perMinute,
        windowMs: this.config.security.rateLimit.windowMs}}}
  /** * Get rate limiting status for user */
  getRateLimitStatus(userId: string) {
    return {
      remaining: this.rateLimiter.getRemainingRequests(userId),
      resetTime: this.rateLimiter.getTimeUntilReset(userId),
      limit: this.config.security.rateLimit.perMinute}}
  // ===== CLEANUP =====
  /** * Clean shutdown of all connections */
  async close(): Promise<void> {
    try {
      const redisClosePromise = this.redis
        ? (this.redis as unknown as { quit?: () => Promise<void>; disconnect?: () => void }).quit?.() ||
          Promise.resolve((this.redis as unknown as { disconnect?: () => void }).disconnect?.())
        : Promise.resolve();
      await Promise.allSettled([redisClosePromise, this.sql?.end()]);
      this.initialized = false; // Corrected: Assign directly, do not re-declare with $state
      console.log('[RAG] Pipeline closed successfully')} catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('[RAG] Error during shutdown: ', error)}
  }
}
// ===== EXPORTS =====
/** * Export enhanced singleton instance */
export const enhancedRAGPipeline = new EnhancedLegalRAGPipeline();
/** * Export the original interface for backward compatibility */
export const ragPipeline = enhancedRAGPipeline
/** * Export configuration creator for custom instances */
export { createDefaultConfig };
/** * Export all interfaces for external use */
// Types already exported inline above - duplicate export removed



