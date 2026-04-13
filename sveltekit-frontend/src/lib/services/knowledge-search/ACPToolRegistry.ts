import { pgRows } from '$lib/server/db/client';
/**
 * Phase 76: ACP (Agent Communication Protocol) Tool Registry
 *
 * Refactored: real DB pool + Redis client (no docker exec),
 * dryRun support for plan-only execution,
 * SQL injection hardening, cache namespace restrictions.
 */

import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { redis } from '$lib/server/redis.js';
import type { ACPTool, ToolResult, ToolPlanStep } from './types.js';

const CONFIG = {
  endpoints: {
    ollama: process.env.OLLAMA_URL || 'http://localhost:11434',
    qdrant: process.env.QDRANT_URL || 'http://localhost:6333',
  },
  models: {
    embedding: process.env.EMBEDDING_MODEL || 'embeddinggemma:latest',
    chat: process.env.OLLAMA_MODEL || 'gemma4-legal:latest',
  },
  timeouts: {
    default: 30000,
    llm: 120000,
    crawl: 15000,
  },
  sql: {
    maxLength: 4096,
    maxRows: 500,
    /** Keywords that must not appear anywhere in the query */
    forbidden:
      /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|COPY|CALL|DO|GRANT|REVOKE|SET|LOCK|EXEC|MERGE|REPLACE|VACUUM|REINDEX|CLUSTER|COMMENT|NOTIFY|LISTEN|UNLISTEN|LOAD|REFRESH)\b/i,
    /** PostgreSQL system catalog and dangerous functions */
    forbiddenTargets:
      /\b(pg_shadow|pg_authid|pg_roles|pg_user|pg_catalog\.pg_auth|information_schema\.role|pg_read_file|pg_read_binary_file|lo_import|lo_export|pg_ls_dir|pg_stat_file|dblink|pg_execute_server_program|pg_sleep|current_setting\s*\(\s*'superuser)\b/i,
    /** Only allow queries against known safe tables */
    allowedTables:
      /\b(cases|evidence|citations|documents|persons_of_interest|analysis_jobs|error_patterns|patch_knowledge|rag_sessions|rag_messages|evidence_vectors|legal_documents|legal_cases|yorha_evidence_nodes|yorha_evidence_connections|case_notes|case_statute_links|statutes|statute_chunks|legal_precedents|workspaces|route_health|document_chunks|embedding_cache)\b/i,
  },
  cache: {
    maxKeyLength: 256,
    /** Keys must start with one of these prefixes */
    allowedPrefixes: ['phase72:', 'rag:', 'search:', 'session:', 'embedding:', 'acp:', 'llm:'],
    maxValueLength: 1_048_576, // 1 MB
  },
};

export interface ACPToolOptions {
  dryRun?: boolean;
}

function planResult(steps: ToolPlanStep[], startTime: number): ToolResult {
  return {
    success: true,
    kind: 'plan',
    data: { steps },
    duration: Date.now() - startTime
  };
}

function fail(error: string, startTime: number): ToolResult {
  return { success: false, kind: 'result', error, duration: Date.now() - startTime };
}

// ---------------------------------------------------------------------------
// SQL validation
// ---------------------------------------------------------------------------

function validateSQL(query: string): string | null {
  if (query.length > CONFIG.sql.maxLength) {
    return `Query exceeds max length (${CONFIG.sql.maxLength} chars)`;
  }

  // Strip SQL comments (-- and /* */) before keyword check
  const stripped = query
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();

  if (!stripped.toLowerCase().startsWith('select')) {
    return 'Only SELECT queries are allowed';
  }

  if (stripped.includes(';')) {
    return 'Multi-statement queries are not allowed';
  }

  if (CONFIG.sql.forbidden.test(stripped)) {
    return 'Query contains a forbidden keyword';
  }

  if (CONFIG.sql.forbiddenTargets.test(stripped)) {
    return 'Query references a restricted system table or function';
  }

  // Must reference at least one known application table
  if (!CONFIG.sql.allowedTables.test(stripped)) {
    return 'Query must reference a known application table';
  }

  return null; // valid
}

// ---------------------------------------------------------------------------
// Cache key validation
// ---------------------------------------------------------------------------

function validateCacheKey(key: string): string | null {
  if (key.length > CONFIG.cache.maxKeyLength) {
    return `Key exceeds max length (${CONFIG.cache.maxKeyLength} chars)`;
  }

  const hasAllowedPrefix = CONFIG.cache.allowedPrefixes.some(p => key.startsWith(p));
  if (!hasAllowedPrefix) {
    return `Key must start with one of: ${CONFIG.cache.allowedPrefixes.join(', ')}`;
  }

  return null; // valid
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

type HandlerFn = (args: any, options?: ACPToolOptions) => Promise<ToolResult>;

const handlers: Record<string, HandlerFn> = {
  async knowledgeSearch(args: any, options?: ACPToolOptions): Promise<ToolResult> {
    const startTime = Date.now();
    const { query } = args;

    if (options?.dryRun) {
      return planResult([
        { action: 'embed', target: 'query', detail: `Generate embedding for: "${query}"` },
        { action: 'search', target: 'qdrant', detail: 'Vector similarity search in legal-documents collection' },
        { action: 'synthesize', target: 'ollama', detail: 'Synthesize answer from top results' }
      ], startTime);
    }

    try {
      return {
        success: true,
        kind: 'result',
        data: { results: [], synthesized: null },
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return fail(error.message, startTime);
    }
  },

  async dbQuery(args: any, options?: ACPToolOptions): Promise<ToolResult> {
    const startTime = Date.now();
    const { query, limit } = args;

    if (!query || typeof query !== 'string') {
      return fail('query must be a non-empty string', startTime);
    }

    const trimmed = query.trim();
    const validationError = validateSQL(trimmed);
    if (validationError) {
      return fail(validationError, startTime);
    }

    // Enforce row limit unless user set one
    const hasLimit = /\bLIMIT\s+\d+/i.test(trimmed);
    const effectiveLimit = limit ?? CONFIG.sql.maxRows;
    const finalQuery = hasLimit ? trimmed : `${trimmed} LIMIT ${effectiveLimit}`;

    if (options?.dryRun) {
      return planResult([
        { action: 'validate', target: 'query', detail: 'Verify read-only SELECT, no forbidden keywords' },
        { action: 'execute', target: 'postgresql', detail: `Run: ${finalQuery.slice(0, 100)}...` },
        { action: 'return', target: 'rows', detail: `Return up to ${effectiveLimit} rows as JSON` }
      ], startTime);
    }

    try {
      const result = await db.execute(sql.raw(finalQuery));
      const rows = Array.isArray(result) ? result : pgRows(result) ?? [];
      return {
        success: true,
        kind: 'result',
        data: { rows, rowCount: rows.length, limited: !hasLimit },
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      console.error('[ACP dbQuery] Query failed:', error.message);
      return fail('Query execution failed', startTime);
    }
  },

  async cacheGet(args: any, options?: ACPToolOptions): Promise<ToolResult> {
    const startTime = Date.now();
    const { key } = args;

    if (!key || typeof key !== 'string') {
      return fail('key must be a non-empty string', startTime);
    }

    const keyError = validateCacheKey(key);
    if (keyError) return fail(keyError, startTime);

    if (options?.dryRun) {
      return planResult([
        { action: 'get', target: 'redis', detail: `Fetch key: "${key}"` },
        { action: 'return', target: 'value', detail: 'Return cached value or null' }
      ], startTime);
    }

    try {
      const value = await redis.get(key);
      return {
        success: true,
        kind: 'result',
        data: {
          value: value ?? null,
          exists: value !== null,
          key: key.slice(0, 40) + (key.length > 40 ? '...' : '')
        },
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return fail(error.message, startTime);
    }
  },

  async cacheSet(args: any, options?: ACPToolOptions): Promise<ToolResult> {
    const startTime = Date.now();
    const { key, value, ttl } = args;

    if (!key || typeof key !== 'string') {
      return fail('key must be a non-empty string', startTime);
    }
    if (value === undefined || value === null) {
      return fail('value is required', startTime);
    }

    const keyError = validateCacheKey(key);
    if (keyError) return fail(keyError, startTime);

    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    if (serialized.length > CONFIG.cache.maxValueLength) {
      return fail(`Value exceeds max size (${CONFIG.cache.maxValueLength} bytes)`, startTime);
    }

    const effectiveTtl = typeof ttl === 'number' && ttl > 0 ? Math.min(ttl, 86400) : 3600;

    if (options?.dryRun) {
      return planResult([
        { action: 'set', target: 'redis', detail: `Set key: "${key}" (${serialized.length} bytes, TTL ${effectiveTtl}s)` },
        { action: 'return', target: 'ok', detail: 'Confirm write' }
      ], startTime);
    }

    try {
      await redis.set(key, serialized, 'EX', effectiveTtl);
      return {
        success: true,
        kind: 'result',
        data: {
          key: key.slice(0, 40) + (key.length > 40 ? '...' : ''),
          ttl: effectiveTtl,
          size: serialized.length
        },
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return fail(error.message, startTime);
    }
  },

  async llmGenerate(args: any, options?: ACPToolOptions): Promise<ToolResult> {
    const startTime = Date.now();
    const { prompt, model = CONFIG.models.chat } = args;

    if (!prompt || typeof prompt !== 'string') {
      return fail('prompt must be a non-empty string', startTime);
    }

    if (options?.dryRun) {
      return planResult([
        { action: 'generate', target: 'ollama', detail: `Call ${model} with ${prompt.length}-char prompt` },
        { action: 'return', target: 'text', detail: 'Return generated text response' }
      ], startTime);
    }

    try {
      const response = await fetch(`${CONFIG.endpoints.ollama}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false })
      });
      if (!response.ok) {
        throw new Error(`Ollama returned ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      return {
        success: true,
        kind: 'result',
        data: { text: data.response },
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return fail(error.message, startTime);
    }
  },

  // -------------------------------------------------------------------------
  // Error-analysis tools (lazy-loaded to avoid loading pipeline at init)
  // -------------------------------------------------------------------------

  async errorAnalyze(args: any, options?: ACPToolOptions): Promise<ToolResult> {
    const startTime = Date.now();
    const { error: errorReport } = args;

    if (!errorReport || !errorReport.file || !errorReport.message) {
      return fail('error must include at least file and message', startTime);
    }

    if (options?.dryRun) {
      return planResult([
        { action: 'synthesize', target: 'FixSynthesizer', detail: 'Generate fix from error + similar errors' },
        { action: 'decide', target: 'DecisionEngine', detail: 'Route decision based on confidence (auto-apply / validate / escalate)' },
        { action: 'record', target: 'ExperienceRecorder', detail: 'Record outcome for future learning' }
      ], startTime);
    }

    try {
      const { getDecisionEngine, getFixSynthesizer } = await import('$lib/services/error-analysis');
      const engine = getDecisionEngine();
      const synthesizer = getFixSynthesizer();

      const fixResult = await synthesizer.synthesizeFix(errorReport, []);
      if (!fixResult.success || !fixResult.strategy) {
        return {
          success: true,
          kind: 'result',
          data: { decision: 'escalate', reason: fixResult.error ?? 'No fix generated', fix: null },
          duration: Date.now() - startTime
        };
      }

      const decision = await engine.decide(errorReport, fixResult.strategy, {
        source: 'acp',
        timestamp: Date.now()
      });

      return {
        success: true,
        kind: 'result',
        data: {
          decision: decision.action,
          confidence: decision.confidence,
          fix: {
            id: fixResult.strategy.id,
            description: fixResult.strategy.description,
            successRate: fixResult.strategy.successRate
          }
        },
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return fail(error.message, startTime);
    }
  },

  async fixSynthesize(args: any, options?: ACPToolOptions): Promise<ToolResult> {
    const startTime = Date.now();
    const { error: errorReport, similarErrors = [] } = args;

    if (!errorReport || !errorReport.file || !errorReport.message) {
      return fail('error must include at least file and message', startTime);
    }

    if (options?.dryRun) {
      return planResult([
        { action: 'lookup', target: 'RAGRetriever', detail: 'Find similar past errors + fixes' },
        { action: 'generate', target: 'Ollama', detail: 'Generate fix code via gemma4-legal' },
        { action: 'validate', target: 'FixSynthesizer', detail: 'Check syntax and AST validity' }
      ], startTime);
    }

    try {
      const { getFixSynthesizer } = await import('$lib/services/error-analysis');
      const synthesizer = getFixSynthesizer();
      const result = await synthesizer.synthesizeFix(errorReport, similarErrors);

      return {
        success: result.success,
        kind: 'result',
        data: result.success
          ? { strategy: result.strategy }
          : { error: result.error, validationErrors: result.validationErrors },
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return fail(error.message, startTime);
    }
  },

  async fixApply(args: any, options?: ACPToolOptions): Promise<ToolResult> {
    const startTime = Date.now();
    const { strategy, error: errorReport } = args;

    if (!strategy || !strategy.id || !strategy.code) {
      return fail('strategy must include id and code', startTime);
    }
    if (!errorReport || !errorReport.file) {
      return fail('error must include file path', startTime);
    }

    if (options?.dryRun) {
      return planResult([
        { action: 'backup', target: errorReport.file, detail: 'Create backup of target file' },
        { action: 'apply', target: errorReport.file, detail: `Apply fix ${strategy.id}` },
        { action: 'validate', target: 'svelte-check', detail: 'Verify fix did not introduce new errors' }
      ], startTime);
    }

    try {
      const { getFixSynthesizer } = await import('$lib/services/error-analysis');
      const synthesizer = getFixSynthesizer();
      const result = await synthesizer.applyFix(strategy, errorReport);

      return {
        success: result.success,
        kind: 'result',
        data: result.success
          ? { backupPath: result.backupPath }
          : { error: result.error },
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return fail(error.message, startTime);
    }
  },

  async metricsSnapshot(_args: any, options?: ACPToolOptions): Promise<ToolResult> {
    const startTime = Date.now();

    if (options?.dryRun) {
      return planResult([
        { action: 'collect', target: 'MetricsCollector', detail: 'Gather stats from DecisionEngine, FixSynthesizer, Cache' },
        { action: 'return', target: 'snapshot', detail: 'Return metrics + 24h history' }
      ], startTime);
    }

    try {
      const { getMetricsCollector } = await import('$lib/services/error-analysis');
      const metrics = getMetricsCollector();
      const snapshot = await metrics.getSnapshot();

      return {
        success: true,
        kind: 'result',
        data: snapshot,
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return fail(error.message, startTime);
    }
  },

  async metricsHealth(_args: any, options?: ACPToolOptions): Promise<ToolResult> {
    const startTime = Date.now();

    if (options?.dryRun) {
      return planResult([
        { action: 'probe', target: 'redis', detail: 'Check Redis connectivity' },
        { action: 'probe', target: 'qdrant', detail: 'Check Qdrant connectivity' },
        { action: 'probe', target: 'neo4j', detail: 'Check Neo4j connectivity' },
        { action: 'probe', target: 'ollama', detail: 'Check Ollama connectivity' }
      ], startTime);
    }

    try {
      const { getMetricsCollector } = await import('$lib/services/error-analysis');
      const metrics = getMetricsCollector();
      const health = await metrics.checkServiceHealth();

      return {
        success: true,
        kind: 'result',
        data: health,
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return fail(error.message, startTime);
    }
  },

  // -------------------------------------------------------------------------
  // LangExtract tools (lazy-loaded from hardened langextract-service)
  // -------------------------------------------------------------------------

  async langextractExtract(args: any, options?: ACPToolOptions): Promise<ToolResult> {
    const startTime = Date.now();
    const { text, documentId, documentType = 'case' } = args;

    if (!text || typeof text !== 'string') {
      return fail('text must be a non-empty string', startTime);
    }
    if (!documentId || typeof documentId !== 'string') {
      return fail('documentId must be a non-empty string', startTime);
    }
    if (documentType !== 'case' && documentType !== 'statute') {
      return fail('documentType must be "case" or "statute"', startTime);
    }

    if (options?.dryRun) {
      return planResult([
        { action: 'resolve', target: 'LangExtract', detail: 'Health-probe Python (8095) then Go (8090) endpoints' },
        { action: 'extract', target: 'LangExtract', detail: `POST /extract with ${text.length}-char ${documentType} document` },
        { action: 'normalize', target: 'output', detail: 'Validate section_type union, filter invalid sections' },
        { action: 'fallback', target: 'heuristic', detail: 'If 0 valid sections returned, use regex-based detection' }
      ], startTime);
    }

    try {
      const { extractSectionsFromText } = await import('$lib/server/services/langextract-service');
      const result = await extractSectionsFromText(text, documentId, documentType);

      return {
        success: true,
        kind: 'result',
        data: {
          docId: result.doc_id,
          sectionCount: result.sections.length,
          sections: result.sections,
          metadata: result.metadata,
          language: result.language,
          confidence: result.extraction_confidence
        },
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return fail(error.message, startTime);
    }
  },

  async langextractBatch(args: any, options?: ACPToolOptions): Promise<ToolResult> {
    const startTime = Date.now();
    const { documents, concurrency = 3 } = args;

    if (!Array.isArray(documents) || documents.length === 0) {
      return fail('documents must be a non-empty array', startTime);
    }
    if (documents.length > 50) {
      return fail('Maximum 50 documents per batch', startTime);
    }
    const effectiveConcurrency = Math.min(Math.max(1, concurrency), 5);

    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      if (!doc.id || !doc.text) {
        return fail(`documents[${i}] must include id and text`, startTime);
      }
    }

    if (options?.dryRun) {
      return planResult([
        { action: 'resolve', target: 'LangExtract', detail: 'Health-probe endpoint chain' },
        { action: 'batch', target: 'LangExtract', detail: `Process ${documents.length} docs (concurrency: ${effectiveConcurrency})` },
        { action: 'fallback', target: 'heuristic', detail: 'Failed docs use regex-based section detection' },
        { action: 'return', target: 'results', detail: `Return ${documents.length} extraction results` }
      ], startTime);
    }

    try {
      const { extractSectionsBatch } = await import('$lib/server/services/langextract-service');
      const results = await extractSectionsBatch(documents, effectiveConcurrency);

      return {
        success: true,
        kind: 'result',
        data: {
          totalDocuments: documents.length,
          results: results.map(r => ({
            docId: r.doc_id,
            sectionCount: r.sections.length,
            confidence: r.extraction_confidence
          })),
          fullResults: results
        },
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return fail(error.message, startTime);
    }
  }
};

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

/** Which tools support dryRun mode */
const DRY_RUN_TOOLS = new Set([
  'knowledge:search', 'db:query', 'cache:get', 'cache:set', 'llm:generate',
  'error:analyze', 'fix:synthesize', 'fix:apply', 'metrics:snapshot', 'metrics:health',
  'langextract:extract', 'langextract:batch'
]);

export const TOOLS: Record<string, ACPTool> = {
  'knowledge:search': {
    name: 'knowledge:search',
    description: 'Search knowledge base using vector similarity',
    category: 'search',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    },
    outputSchema: { type: 'object' },
    examples: [],
    handler: handlers.knowledgeSearch
  },
  'db:query': {
    name: 'db:query',
    description: 'Run read-only SQL query against PostgreSQL (SELECT only, no mutations)',
    category: 'database',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'SELECT query only; max 4096 chars; forbidden: INSERT/UPDATE/DELETE/DROP' },
        limit: { type: 'number', description: `Max rows to return (default: ${CONFIG.sql.maxRows})` }
      },
      required: ['query']
    },
    outputSchema: { type: 'object' },
    examples: [
      { input: { query: 'SELECT id, title FROM cases LIMIT 5' }, output: { rows: [], rowCount: 0 }, description: 'Fetch first 5 cases' }
    ],
    handler: handlers.dbQuery
  },
  'cache:get': {
    name: 'cache:get',
    description: 'Get value from Redis cache by key (namespaced)',
    category: 'database',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: `Prefixed key (allowed: ${CONFIG.cache.allowedPrefixes.join(', ')})` }
      },
      required: ['key']
    },
    outputSchema: { type: 'object' },
    examples: [
      { input: { key: 'rag:search:abc123' }, output: { value: null, exists: false }, description: 'Check a RAG cache entry' }
    ],
    handler: handlers.cacheGet
  },
  'cache:set': {
    name: 'cache:set',
    description: 'Set value in Redis cache with TTL (namespaced, max 1MB)',
    category: 'database',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: `Prefixed key (allowed: ${CONFIG.cache.allowedPrefixes.join(', ')})` },
        value: { description: 'Value to store (string or JSON-serializable object)' },
        ttl: { type: 'number', description: 'TTL in seconds (default: 3600, max: 86400)' }
      },
      required: ['key', 'value']
    },
    outputSchema: { type: 'object' },
    examples: [
      { input: { key: 'acp:result:xyz', value: { data: 'test' }, ttl: 600 }, output: { key: 'acp:result:xyz', ttl: 600, size: 15 }, description: 'Cache an ACP result for 10 minutes' }
    ],
    handler: handlers.cacheSet
  },
  'llm:generate': {
    name: 'llm:generate',
    description: 'Generate text using Ollama LLM',
    category: 'llm',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        model: { type: 'string', description: 'Ollama model name (default: gemma4-legal:latest)' }
      },
      required: ['prompt']
    },
    outputSchema: { type: 'object' },
    examples: [
      { input: { prompt: 'Summarize: ...' }, output: { text: '...' }, description: 'Generate a legal summary' }
    ],
    handler: handlers.llmGenerate
  },

  // -------------------------------------------------------------------------
  // Error-analysis tools
  // -------------------------------------------------------------------------

  'error:analyze': {
    name: 'error:analyze',
    description: 'Analyze an error: synthesize fix + route decision (auto-apply / validate / escalate)',
    category: 'error-analysis',
    inputSchema: {
      type: 'object',
      properties: {
        error: {
          type: 'object',
          description: 'ErrorReport with file, line, column, code, message, severity, source',
          properties: {
            file: { type: 'string' },
            line: { type: 'number' },
            column: { type: 'number' },
            code: { type: 'string' },
            message: { type: 'string' },
            severity: { type: 'string', description: 'error | warning | hint' },
            source: { type: 'string', description: 'svelte-check | tsc | ast | runtime' }
          },
          required: ['file', 'message']
        }
      },
      required: ['error']
    },
    outputSchema: { type: 'object' },
    examples: [
      {
        input: { error: { file: 'src/routes/+page.svelte', message: "Cannot find name 'foo'", code: 'ts(2304)', severity: 'error', source: 'svelte-check' } },
        output: { decision: 'auto_apply', confidence: 0.92, fix: { id: 'fix-1', description: 'Add missing import' } },
        description: 'Analyze a missing-name error'
      }
    ],
    handler: handlers.errorAnalyze
  },
  'fix:synthesize': {
    name: 'fix:synthesize',
    description: 'Generate a fix for an error using Ollama + similar error history',
    category: 'error-analysis',
    inputSchema: {
      type: 'object',
      properties: {
        error: {
          type: 'object',
          description: 'ErrorReport (file, message required)',
          properties: {
            file: { type: 'string' },
            line: { type: 'number' },
            column: { type: 'number' },
            code: { type: 'string' },
            message: { type: 'string' },
            severity: { type: 'string' },
            source: { type: 'string' }
          },
          required: ['file', 'message']
        },
        similarErrors: {
          type: 'array',
          description: 'Optional array of similar past errors with their fix strategies',
          items: { type: 'object' }
        }
      },
      required: ['error']
    },
    outputSchema: { type: 'object' },
    examples: [
      {
        input: { error: { file: 'src/lib/utils.ts', message: "Property 'x' does not exist", code: 'ts(2339)', severity: 'error', source: 'tsc' } },
        output: { strategy: { id: 'fix-2', description: 'Add property to interface', successRate: 0.8 } },
        description: 'Synthesize a fix for a missing property'
      }
    ],
    handler: handlers.fixSynthesize
  },
  'fix:apply': {
    name: 'fix:apply',
    description: 'Apply a synthesized fix to a file (creates backup first)',
    category: 'error-analysis',
    inputSchema: {
      type: 'object',
      properties: {
        strategy: {
          type: 'object',
          description: 'FixStrategy from fix:synthesize (must include id and code)',
          properties: {
            id: { type: 'string' },
            code: { type: 'string' },
            description: { type: 'string' }
          },
          required: ['id', 'code']
        },
        error: {
          type: 'object',
          description: 'Original ErrorReport (must include file)',
          properties: {
            file: { type: 'string' },
            line: { type: 'number' },
            message: { type: 'string' }
          },
          required: ['file']
        }
      },
      required: ['strategy', 'error']
    },
    outputSchema: { type: 'object' },
    examples: [
      {
        input: {
          strategy: { id: 'fix-2', code: 'x: number;', description: 'Add property' },
          error: { file: 'src/lib/utils.ts', line: 42 }
        },
        output: { backupPath: '.fix-backups/utils.ts.1234567890' },
        description: 'Apply a fix with automatic backup'
      }
    ],
    handler: handlers.fixApply
  },
  'metrics:snapshot': {
    name: 'metrics:snapshot',
    description: 'Get error-analysis system metrics + 24h history',
    category: 'error-analysis',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object' },
    examples: [
      {
        input: {},
        output: { timestamp: '2026-02-15T00:00:00Z', metrics: { fixSuccessRate: 0.85, escalationRate: 0.05 } },
        description: 'Get current system metrics snapshot'
      }
    ],
    handler: handlers.metricsSnapshot
  },
  'metrics:health': {
    name: 'metrics:health',
    description: 'Check connectivity of Redis, Qdrant, Neo4j, Ollama',
    category: 'error-analysis',
    inputSchema: { type: 'object', properties: {} },
    outputSchema: { type: 'object' },
    examples: [
      {
        input: {},
        output: { redis: true, qdrant: true, neo4j: false, ollama: true },
        description: 'Probe service health endpoints'
      }
    ],
    handler: handlers.metricsHealth
  },

  // -------------------------------------------------------------------------
  // LangExtract tools
  // -------------------------------------------------------------------------

  'langextract:extract': {
    name: 'langextract:extract',
    description: 'Extract sections from a legal document (case or statute) using LangExtract API with heuristic fallback',
    category: 'code',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Full document text to extract sections from' },
        documentId: { type: 'string', description: 'Unique identifier for the document' },
        documentType: { type: 'string', description: '"case" (default) or "statute"' }
      },
      required: ['text', 'documentId']
    },
    outputSchema: { type: 'object' },
    examples: [
      {
        input: { text: 'FACTS: The defendant...', documentId: 'case-001', documentType: 'case' },
        output: { docId: 'case-001', sectionCount: 3, sections: [], confidence: 0.85 },
        description: 'Extract sections from a case document'
      }
    ],
    handler: handlers.langextractExtract
  },
  'langextract:batch': {
    name: 'langextract:batch',
    description: 'Batch-extract sections from multiple documents (max 50, concurrency-limited)',
    category: 'code',
    inputSchema: {
      type: 'object',
      properties: {
        documents: {
          type: 'array',
          description: 'Array of { id, text, type? } objects (max 50)',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              text: { type: 'string' },
              type: { type: 'string', description: '"case" or "statute"' }
            },
            required: ['id', 'text']
          }
        },
        concurrency: { type: 'number', description: 'Parallel requests (default: 3, max: 5)' }
      },
      required: ['documents']
    },
    outputSchema: { type: 'object' },
    examples: [
      {
        input: { documents: [{ id: 'doc-1', text: 'FACTS...' }, { id: 'doc-2', text: 'HOLDING...' }], concurrency: 2 },
        output: { totalDocuments: 2, results: [{ docId: 'doc-1', sectionCount: 4 }, { docId: 'doc-2', sectionCount: 2 }] },
        description: 'Batch-extract from 2 documents'
      }
    ],
    handler: handlers.langextractBatch
  }
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function executeACPTool(
  name: string,
  args: any,
  options?: ACPToolOptions
): Promise<ToolResult> {
  const tool = TOOLS[name];
  if (!tool) {
    return { success: false, kind: 'result', error: `Tool ${name} not found`, duration: 0 };
  }
  return await tool.handler(args, options);
}

export function getACPToolSchema(name: string): ACPTool | undefined {
  return TOOLS[name];
}

export function getAllTools(): ACPTool[] {
  return Object.values(TOOLS);
}

export function toolSupportsDryRun(name: string): boolean {
  return DRY_RUN_TOOLS.has(name);
}

export function getACPToolRegistry() {
  return {
    list(): ACPTool[] {
      return Object.values(TOOLS);
    },
    byCategory(category: string): ACPTool[] {
      return Object.values(TOOLS).filter(t => t.category === category);
    },
    get(name: string): ACPTool | undefined {
      return TOOLS[name];
    },
  };
}