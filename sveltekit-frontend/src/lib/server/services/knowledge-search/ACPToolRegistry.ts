/**
 * Phase 76: ACP (Agent Communication Protocol) Tool Registry
 *
 * Refactored: real DB pool + Redis client (no docker exec),
 * dryRun support for plan-only execution,
 * SQL injection hardening, cache namespace restrictions.
 */

import { pgRows } from '$lib/server/db/client';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import { bifrostChat } from '$lib/server/ollama.js';
import { redis } from '$lib/server/redis.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { createSearchRuntime } from '$lib/server/retrieval/search-runtime.js';
import { searchResultToHyperRagResult } from '$lib/server/retrieval/canonical-hyperrag-adapter.js';
import { loadDailyGraphifyBoard } from '$lib/server/atlas/board/daily-graphify-board.js';
import {
  claimKanbanTask,
  blockKanbanTask,
  completeKanbanTask,
  createChildKanbanTask,
  heartbeatKanbanTask,
  KanbanTaskClaimInputSchema,
  KanbanTaskBlockInputSchema,
  KanbanTaskCompleteInputSchema,
  KanbanTaskCreateChildInputSchema,
  KanbanTaskHeartbeatInputSchema,
  KanbanTaskListInputSchema,
  KanbanTaskRetryInputSchema,
  KanbanTaskShowInputSchema,
  listKanbanTasks,
  retryKanbanTask,
  showKanbanTask,
} from '$lib/server/atlas/kanban-task-board.js';
import { LLM_MODEL_ID } from '$lib/server/llm/runtime-contract.js';
import {
	buildPhase89WorkflowPlan,
	buildPhase89FabricLaneManifest,
	buildPhase89GpuBenchmarkReceipt,
	publishBoardGpuBenchmarkReceipt,
	recordPhase89WorkflowPlan,
	Phase89WorkflowRequestSchema,
} from '$lib/server/atlas/board/phase89-workflow.js';
import type { ACPTool, ToolResult, ToolPlanStep } from './types.js';

export interface ACPKnowledgeSearchResult {
  ok: true;
  query: string;
  results: Array<{
    id: string;
    source: 'qdrant' | 'postgres' | 'neo4j' | 'redis';
    title?: string;
    content: string;
    score: number;
    path?: string;
    metadata?: Record<string, unknown>;
  }>;
  metadata: {
    embeddingModel: string;
    collection: string;
    latencyMs: number;
    topoPrefilter?: import('$lib/server/cache/topo-candidate-cache.js').TopoPrefilterStats;
    routing?: {
      dispatch: string[];
      weights: { qdrant: number; postgres: number; neo4j: number; mcp: number };
      qdrantHits: number;
      postgresHits: number;
    };
  };
}

const CONFIG = {
  endpoints: {
    ollama: ENV.OLLAMA_BASE_URL,
    qdrant: ENV.QDRANT_URL,
  },
  models: {
    embedding: process.env.EMBEDDING_MODEL || 'embeddinggemma:latest',
    chat: process.env.OLLAMA_MODEL || LLM_MODEL_ID,
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

function kanbanPlan(action: string, detail: string, startTime: number): ToolResult {
  return planResult([{ action, target: 'atlas.kanban', detail }], startTime);
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
    const { query, limit, collection } = args;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return fail('query must be a non-empty string', startTime);
    }

    const resolvedCollection: string = typeof collection === 'string' && collection.trim()
      ? collection.trim()
      : 'codebase_chunks_768';
    const resolvedLimit = Math.min(typeof limit === 'number' ? limit : 8, 12);

    if (options?.dryRun) {
      return planResult([
        { action: 'embed', target: 'query', detail: `Generate 768-dim embedding for: "${query}"` },
        { action: 'search', target: `qdrant/${resolvedCollection}`, detail: `Hybrid semantic search, limit=${resolvedLimit}` },
      ], startTime);
    }

    try {
      const emb = await generateSingleEmbedding(query.trim());
      if (!Array.isArray(emb) || emb.length !== 768) {
        return fail('Embedding unavailable — embeddinggemma not responding', startTime);
      }

      const hits = await qdrant.hybridSearch({
        collection: resolvedCollection,
        query: query.trim(),
        queryEmbedding: Array.from(emb),
        limit: resolvedLimit,
      });

      const searchResult: ACPKnowledgeSearchResult = {
        ok: true,
        query: query.trim(),
        results: hits.results.map((h) => ({
          id: String(h.id),
          source: 'qdrant' as const,
          title: (h.payload?.['title'] ?? h.payload?.['path'] ?? undefined) as string | undefined,
          content: (h.payload?.['content'] ?? h.payload?.['summary'] ?? h.payload?.['text'] ?? '') as string,
          score: h.score,
          path: (h.payload?.['path'] ?? h.payload?.['relative_path'] ?? undefined) as string | undefined,
          metadata: h.payload as Record<string, unknown> | undefined,
        })),
        metadata: {
          embeddingModel: 'embeddinggemma:latest',
          collection: resolvedCollection,
          latencyMs: Date.now() - startTime,
        },
      };

      return {
        success: true,
        kind: 'result',
        data: searchResult,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return fail(error.message ?? String(error), startTime);
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
      const text = await bifrostChat([{ role: 'user', content: prompt }], model, {});
      return {
        success: true,
        kind: 'result',
        data: { text },
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
      const { getDecisionEngine, getFixSynthesizer } = await import('$lib/server/services/error-analysis');
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
        { action: 'generate', target: 'llama-server', detail: 'Generate fix code via the canonical runtime model' },
        { action: 'validate', target: 'FixSynthesizer', detail: 'Check syntax and AST validity' }
      ], startTime);
    }

    try {
      const { getFixSynthesizer } = await import('$lib/server/services/error-analysis');
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
      const { getFixSynthesizer } = await import('$lib/server/services/error-analysis');
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
      const { getMetricsCollector } = await import('$lib/server/services/error-analysis');
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
      const { getMetricsCollector } = await import('$lib/server/services/error-analysis');
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
  },

  async searchHyperRag(args: any, options?: ACPToolOptions): Promise<ToolResult> {
    const startTime = Date.now();
    const { query, mode = 'codebase', synthesize = false, topK = 15 } = args;

    if (!query || typeof query !== 'string' || !query.trim()) {
      return fail('query must be a non-empty string', startTime);
    }

    if (options?.dryRun) {
      return planResult([
        { action: 'embed', target: 'query', detail: 'Generate 768-dim embedding' },
        { action: 'search', target: `HyperRag/${mode}`, detail: `Multi-lane search, topK=${topK}` },
        { action: 'synthesize', target: 'Gemma4', detail: synthesize ? 'Generate LLM synthesis' : 'Skip synthesis' }
      ], startTime);
    }

    try {
      const runtime = createSearchRuntime();
      const searchResult = await runtime.search({
        text: query.trim(),
        topK,
        caseId: mode === 'legal' ? 'legal' : undefined,
        filters: {
          includeGenerated: false,
          includeLegacy: false,
        },
      });
      const result = searchResultToHyperRagResult(searchResult, { query: query.trim() });

      return {
        success: true,
        kind: 'result',
        data: result,
        duration: Date.now() - startTime
      };
    } catch (error: any) {
      return fail(error.message ?? String(error), startTime);
    }
  },

  async phase89BoardWorkflow(args: any, options?: ACPToolOptions): Promise<ToolResult> {
    const startTime = Date.now();
    const parsed = Phase89WorkflowRequestSchema.safeParse({
      ...args,
      dryRun: options?.dryRun ?? args?.dryRun ?? false,
    });

    if (!parsed.success) {
      return fail(parsed.error.issues[0]?.message ?? 'Invalid workflow request', startTime);
    }

    try {
      const board = await loadDailyGraphifyBoard();
      const plan = buildPhase89WorkflowPlan(board, parsed.data);
      const fabricLaneManifest = buildPhase89FabricLaneManifest(board, plan);
      const gpuBenchmarkReceipt = buildPhase89GpuBenchmarkReceipt(board, plan);

      if (parsed.data.dryRun || options?.dryRun) {
        return planResult(plan.steps as ToolPlanStep[], startTime);
      }

      const queued = await recordPhase89WorkflowPlan(
        plan,
        undefined,
        fabricLaneManifest ?? undefined,
        gpuBenchmarkReceipt ?? undefined,
      );
      if (gpuBenchmarkReceipt) {
        await publishBoardGpuBenchmarkReceipt(gpuBenchmarkReceipt);
      }

      return {
        success: true,
        kind: 'result',
        data: {
          workflowId: queued.workflowId,
          taskId: plan.taskId,
          taskLabel: plan.taskLabel,
          validationRoutes: queued.queuedRoutes,
          queuedAt: new Date().toISOString(),
          plan,
        },
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return fail(error.message ?? String(error), startTime);
    }
  }
};

// ---------------------------------------------------------------------------
// OpenCode ACP -> bash worker split (2026-08-12)
//
// OpenCode agent decides WHAT to run and emits { action, taskId }. This
// handler resolves `action` against a fixed allowlist (never a free-text
// command string from the agent) and hands off to
// scripts/atlas/opencode-bash-worker.mjs, which is the only thing that
// actually shells to WSL2/bash. conda/RAPIDS activation is environment
// setup owned by the worker script, not by this handler or the agent.
// ---------------------------------------------------------------------------

const BASH_WORKER_ACTIONS: Record<string, { command: string; useRapidsEnv: boolean }> = {
  'louvain-resolution-report': { command: 'npm run atlas:louvain:resolution:report', useRapidsEnv: false },
  'louvain-resolution-verify': { command: 'npm run atlas:louvain:resolution:verify', useRapidsEnv: false },
  'graph-snapshot-parity-export': { command: 'npm run atlas:graph-snapshot-parity:export', useRapidsEnv: false },
  'graph-snapshot-parity-validate': { command: 'npm run atlas:graph-snapshot-parity:validate -- --run-networkx --run-cugraph', useRapidsEnv: false },
  'cugraph-pagerank': { command: 'python scripts/atlas/cugraph-pagerank.py', useRapidsEnv: true },
  'cugraph-pagerank-dry-run': { command: 'python scripts/atlas/cugraph-pagerank.py --dry-run', useRapidsEnv: true }
};

async function bashWorkerExecute(args: any, options?: ACPToolOptions): Promise<ToolResult> {
  const startTime = Date.now();
  const action = args?.action;

  if (!action || typeof action !== 'string' || !(action in BASH_WORKER_ACTIONS)) {
    return fail(`action must be one of: ${Object.keys(BASH_WORKER_ACTIONS).join(', ')}`, startTime);
  }
  const spec = BASH_WORKER_ACTIONS[action];
  const request = {
    task_id: typeof args?.taskId === 'string' ? args.taskId : `acp:${action}:${Date.now()}`,
    command: spec.command,
    useRapidsEnv: spec.useRapidsEnv
  };

  if (options?.dryRun) {
    return planResult([
      { action: 'exec', target: 'wsl-bash', detail: `${spec.useRapidsEnv ? '[atlas-rapids-cu13] ' : ''}${spec.command}` }
    ], startTime);
  }

  try {
    const { execFileSync } = await import('node:child_process');
    const { resolve } = await import('node:path');
    const workerPath = resolve(process.cwd(), 'scripts/atlas/opencode-bash-worker.mjs');
    const output = execFileSync('node', [workerPath, JSON.stringify(request)], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    });
    const receipt = JSON.parse(output.trim());
    return {
      success: receipt.status === 'SUCCEEDED',
      kind: 'result',
      data: receipt,
      duration: Date.now() - startTime
    };
  } catch (error: any) {
    return fail(error.message ?? String(error), startTime);
  }
}

async function graphSnapshotParityValidate(args: any, options?: ACPToolOptions): Promise<ToolResult> {
  return await bashWorkerExecute(
    {
      action: 'graph-snapshot-parity-validate',
      taskId: typeof args?.taskId === 'string' ? args.taskId : undefined,
    },
    options,
  );
}

async function cugraphPagerankDry(args: any, options?: ACPToolOptions): Promise<ToolResult> {
  return await bashWorkerExecute(
    {
      action: 'cugraph-pagerank-dry-run',
      taskId: typeof args?.taskId === 'string' ? args.taskId : undefined,
    },
    options,
  );
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

/** Which tools support dryRun mode */
const DRY_RUN_TOOLS = new Set([
  'knowledge:search', 'db:query', 'cache:get', 'cache:set', 'llm:generate',
  'error:analyze', 'fix:synthesize', 'fix:apply', 'metrics:snapshot', 'metrics:health',
  'langextract:extract', 'langextract:batch', 'search:hyperrag',
  'phase89:board-workflow', 'graph:snapshot-parity:validate',
  'atlas:cugraph:pagerank', 'atlas:cugraph:pagerank:dry',
  'atlas.kanban.list', 'atlas.kanban.show',
  'atlas:bash-worker'
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
        model: { type: 'string', description: 'llama-server model name (default: LLM_MODEL_ID)' }
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
  },
  'search:hyperrag': {
    name: 'search:hyperrag',
    description: 'Production-grade HyperRAG multi-lane search with topological synthesis',
    category: 'search',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        mode: { type: 'string', enum: ['codebase', 'evidence', 'legal', 'docs'], default: 'codebase' },
        synthesize: { type: 'boolean', default: false },
        topK: { type: 'number', default: 15 }
      },
      required: ['query']
    },
    outputSchema: { type: 'object' },
    examples: [
      { input: { query: 'context assembler', mode: 'codebase' }, output: {}, description: 'Search codebase for context assembler' }
    ],
    handler: handlers.searchHyperRag
  },
  'phase89:board-workflow': {
    name: 'phase89:board-workflow',
    description: 'Queue a daily-graphify taskboard workflow and Playwright validation from ACP',
    category: 'error-analysis',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID from the daily graphify board' },
        validationRoute: { type: 'string', description: 'Optional Playwright validation route override' },
        dryRun: { type: 'boolean', default: false }
      }
    },
    outputSchema: { type: 'object' },
    examples: [
      {
        input: { taskId: 'rank_signals', validationRoute: '/admin/ai-dashboard', dryRun: true },
        output: { workflowId: 'phase89-board-workflow:rank_signals:...' },
        description: 'Plan a board-driven workflow and validation'
      }
    ],
    handler: handlers.phase89BoardWorkflow
  },
  'graph:snapshot-parity:validate': {
    name: 'graph:snapshot-parity:validate',
    description: 'Run the frozen graph snapshot parity validator through the OpenCode ACP -> bash worker split (NetworkX + cuGraph receipt)',
    category: 'graph-analysis',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Optional task id for the receipt (defaults to acp:graph-snapshot-parity-validate:<timestamp>)' }
      }
    },
    outputSchema: { type: 'object' },
    examples: [
      {
        input: { taskId: 'graph-snapshot-parity-validate' },
        output: { taskId: 'graph-snapshot-parity-validate', status: 'SUCCEEDED', exitCode: 0 },
        description: 'Validate the frozen graph snapshot parity receipt'
      }
    ],
    handler: graphSnapshotParityValidate
  },
  'atlas:cugraph:pagerank:dry': {
    name: 'atlas:cugraph:pagerank:dry',
    description: 'Run the RAPIDS-backed cuGraph PageRank dry-run through the OpenCode ACP -> bash worker split',
    category: 'graph-analysis',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Optional task id for the receipt (defaults to acp:cugraph-pagerank-dry-run:<timestamp>)' }
      }
    },
    outputSchema: { type: 'object' },
    examples: [
      {
        input: { taskId: 'cugraph-pagerank-dry-run' },
        output: { taskId: 'cugraph-pagerank-dry-run', status: 'SUCCEEDED', exitCode: 0 },
        description: 'Run the RAPIDS PageRank dry run receipt'
      }
    ],
    handler: cugraphPagerankDry
  },
  'atlas:cugraph:pagerank': {
    name: 'atlas:cugraph:pagerank',
    description: 'Run the RAPIDS-backed cuGraph PageRank command through the OpenCode ACP -> bash worker split',
    category: 'graph-analysis',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Optional task id for the receipt (defaults to acp:cugraph-pagerank:<timestamp>)' }
      }
    },
    outputSchema: { type: 'object' },
    examples: [
      {
        input: { taskId: 'cugraph-pagerank' },
        output: { taskId: 'cugraph-pagerank', status: 'SUCCEEDED', exitCode: 0 },
        description: 'Run the RAPIDS PageRank command'
      }
    ],
    handler: async (args: any, options?: ACPToolOptions) => {
      return await bashWorkerExecute(
        {
          action: 'cugraph-pagerank',
          taskId: typeof args?.taskId === 'string' ? args.taskId : undefined,
        },
        options,
      );
    }
  },
  'atlas.kanban.list': {
    name: 'atlas.kanban.list',
    description: 'List kanban tasks from the canonical Atlas Postgres board.',
    category: 'database',
    inputSchema: {
      type: 'object',
      properties: {
        lane: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
        status: { type: 'string', enum: ['pending', 'active', 'completed', 'failed'] },
        limit: { type: 'number', minimum: 1, maximum: 500, default: 100 },
      },
      additionalProperties: false,
    },
    outputSchema: { type: 'object' },
    examples: [
      {
        input: { lane: 'todo', limit: 20 },
        output: { tasks: [], total: 0 },
        description: 'List tasks in the todo lane',
      },
    ],
    handler: async (args: any, options?: ACPToolOptions): Promise<ToolResult> => {
      const startTime = Date.now();
      const parsed = KanbanTaskListInputSchema.safeParse(args);
      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? 'Invalid kanban list request', startTime);
      }
      if (options?.dryRun) {
        return kanbanPlan('list', `lane=${parsed.data.lane ?? 'any'} status=${parsed.data.status ?? 'any'} limit=${parsed.data.limit}`, startTime);
      }
      try {
        const data = await listKanbanTasks(parsed.data);
        return { success: true, kind: 'result', data, duration: Date.now() - startTime };
      } catch (error: any) {
        return fail(error.message ?? String(error), startTime);
      }
    },
  },
  'atlas.kanban.show': {
    name: 'atlas.kanban.show',
    description: 'Show one kanban task from the canonical Atlas Postgres board.',
    category: 'database',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
      },
      required: ['taskId'],
      additionalProperties: false,
    },
    outputSchema: { type: 'object' },
    examples: [
      {
        input: { taskId: 'atlas-task-123' },
        output: { task: null },
        description: 'Show a single task',
      },
    ],
    handler: async (args: any, options?: ACPToolOptions): Promise<ToolResult> => {
      const startTime = Date.now();
      const parsed = KanbanTaskShowInputSchema.safeParse(args);
      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? 'Invalid kanban show request', startTime);
      }
      if (options?.dryRun) {
        return kanbanPlan('show', `taskId=${parsed.data.taskId}`, startTime);
      }
      try {
        const task = await showKanbanTask(parsed.data);
        return { success: true, kind: 'result', data: { task }, duration: Date.now() - startTime };
      } catch (error: any) {
        return fail(error.message ?? String(error), startTime);
      }
    },
  },
  'atlas.kanban.heartbeat': {
    name: 'atlas.kanban.heartbeat',
    description: 'Refresh a running kanban task lease without changing task identity.',
    category: 'database',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        claimToken: { type: 'string' },
        runId: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['taskId', 'claimToken', 'runId'],
      additionalProperties: false,
    },
    outputSchema: { type: 'object' },
    examples: [
      {
        input: { taskId: 'atlas-task-123', claimToken: 'claim-123', runId: 'run-123' },
        output: { heartbeatAt: '2026-08-13T00:00:00.000Z' },
        description: 'Refresh a task heartbeat',
      },
    ],
    handler: async (args: any, options?: ACPToolOptions): Promise<ToolResult> => {
      const startTime = Date.now();
      const parsed = KanbanTaskHeartbeatInputSchema.safeParse(args);
      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? 'Invalid kanban heartbeat request', startTime);
      }
      try {
        const result = await heartbeatKanbanTask(parsed.data);
        return { success: true, kind: 'result', data: result, duration: Date.now() - startTime };
      } catch (error: any) {
        return fail(error.message ?? String(error), startTime);
      }
    },
  },
  'atlas.kanban.claim': {
    name: 'atlas.kanban.claim',
    description: 'Claim a kanban task and move it into active work.',
    category: 'database',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        workerId: { type: 'string' },
      },
      required: ['taskId'],
      additionalProperties: false,
    },
    outputSchema: { type: 'object' },
    examples: [
      {
        input: { taskId: 'atlas-task-123', workerId: 'worker-1' },
        output: { task: { taskId: 'atlas-task-123' } },
        description: 'Claim a task for a worker',
      },
    ],
    handler: async (args: any, options?: ACPToolOptions): Promise<ToolResult> => {
      const startTime = Date.now();
      const parsed = KanbanTaskClaimInputSchema.safeParse(args);
      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? 'Invalid kanban claim request', startTime);
      }
      if (options?.dryRun) {
        return kanbanPlan('claim', `taskId=${parsed.data.taskId} workerId=${parsed.data.workerId ?? 'anonymous'}`, startTime);
      }
      try {
        const result = await claimKanbanTask(parsed.data);
        return { success: true, kind: 'result', data: result, duration: Date.now() - startTime };
      } catch (error: any) {
        return fail(error.message ?? String(error), startTime);
      }
    },
  },
  'atlas.kanban.block': {
    name: 'atlas.kanban.block',
    description: 'Mark a kanban task blocked and return it to todo.',
    category: 'database',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['taskId'],
      additionalProperties: false,
    },
    outputSchema: { type: 'object' },
    examples: [
      {
        input: { taskId: 'atlas-task-123', reason: 'missing evidence' },
        output: { task: { taskId: 'atlas-task-123' } },
        description: 'Block a task with a reason',
      },
    ],
    handler: async (args: any, options?: ACPToolOptions): Promise<ToolResult> => {
      const startTime = Date.now();
      const parsed = KanbanTaskBlockInputSchema.safeParse(args);
      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? 'Invalid kanban block request', startTime);
      }
      if (options?.dryRun) {
        return kanbanPlan('block', `taskId=${parsed.data.taskId} reason=${parsed.data.reason ?? 'unspecified'}`, startTime);
      }
      try {
        const task = await blockKanbanTask(parsed.data);
        return { success: true, kind: 'result', data: { task }, duration: Date.now() - startTime };
      } catch (error: any) {
        return fail(error.message ?? String(error), startTime);
      }
    },
  },
  'atlas.kanban.complete': {
    name: 'atlas.kanban.complete',
    description: 'Mark a kanban task completed and move it to done.',
    category: 'database',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        workerId: { type: 'string' },
      },
      required: ['taskId'],
      additionalProperties: false,
    },
    outputSchema: { type: 'object' },
    examples: [
      {
        input: { taskId: 'atlas-task-123', workerId: 'worker-1' },
        output: { task: { taskId: 'atlas-task-123' } },
        description: 'Complete a task',
      },
    ],
    handler: async (args: any, options?: ACPToolOptions): Promise<ToolResult> => {
      const startTime = Date.now();
      const parsed = KanbanTaskCompleteInputSchema.safeParse(args);
      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? 'Invalid kanban complete request', startTime);
      }
      if (options?.dryRun) {
        return kanbanPlan('complete', `taskId=${parsed.data.taskId} workerId=${parsed.data.workerId ?? 'anonymous'}`, startTime);
      }
      try {
        const task = await completeKanbanTask(parsed.data);
        return { success: true, kind: 'result', data: { task }, duration: Date.now() - startTime };
      } catch (error: any) {
        return fail(error.message ?? String(error), startTime);
      }
    },
  },
  'atlas.kanban.retry': {
    name: 'atlas.kanban.retry',
    description: 'Retry a failed kanban task and return it to todo/pending.',
    category: 'database',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        reason: { type: 'string' },
      },
      required: ['taskId'],
      additionalProperties: false,
    },
    outputSchema: { type: 'object' },
    examples: [
      {
        input: { taskId: 'atlas-task-123', reason: 'transient dependency' },
        output: { task: { taskId: 'atlas-task-123' } },
        description: 'Retry a blocked task',
      },
    ],
    handler: async (args: any, options?: ACPToolOptions): Promise<ToolResult> => {
      const startTime = Date.now();
      const parsed = KanbanTaskRetryInputSchema.safeParse(args);
      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? 'Invalid kanban retry request', startTime);
      }
      if (options?.dryRun) {
        return kanbanPlan('retry', `taskId=${parsed.data.taskId} reason=${parsed.data.reason ?? 'unspecified'}`, startTime);
      }
      try {
        const task = await retryKanbanTask(parsed.data);
        return { success: true, kind: 'result', data: { task }, duration: Date.now() - startTime };
      } catch (error: any) {
        return fail(error.message ?? String(error), startTime);
      }
    },
  },
  'atlas.kanban.create_child': {
    name: 'atlas.kanban.create_child',
    description: 'Create a child kanban task under a parent task.',
    category: 'database',
    inputSchema: {
      type: 'object',
      properties: {
        parentTaskId: { type: 'string' },
        taskId: { type: 'string' },
        featureId: { type: 'string' },
        featureLabel: { type: 'string' },
        sourceRefs: { type: 'array', items: { type: 'string' } },
        lane: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
        validationCommand: { type: 'string' },
      },
      required: ['parentTaskId', 'taskId', 'featureId', 'featureLabel'],
      additionalProperties: false,
    },
    outputSchema: { type: 'object' },
    examples: [
      {
        input: {
          parentTaskId: 'atlas-task-123',
          taskId: 'atlas-task-123-child-1',
          featureId: 'atlas.feature.example',
          featureLabel: 'Example feature',
          sourceRefs: ['src/lib/server/atlas/board/daily-graphify-board.ts'],
        },
        output: { task: { taskId: 'atlas-task-123-child-1' } },
        description: 'Create a child task',
      },
    ],
    handler: async (args: any, options?: ACPToolOptions): Promise<ToolResult> => {
      const startTime = Date.now();
      const parsed = KanbanTaskCreateChildInputSchema.safeParse(args);
      if (!parsed.success) {
        return fail(parsed.error.issues[0]?.message ?? 'Invalid kanban create_child request', startTime);
      }
      if (options?.dryRun) {
        return kanbanPlan('create_child', `parentTaskId=${parsed.data.parentTaskId} taskId=${parsed.data.taskId}`, startTime);
      }
      try {
        const task = await createChildKanbanTask(parsed.data);
        return { success: true, kind: 'result', data: { task }, duration: Date.now() - startTime };
      } catch (error: any) {
        return fail(error.message ?? String(error), startTime);
      }
    },
  },
  'atlas:bash-worker': {
    name: 'atlas:bash-worker',
    description: 'Run an allowlisted repo command (npm script or RAPIDS python oracle) via the OpenCode ACP -> bash worker split. `action` is a fixed enum, never a free-text command string.',
    category: 'error-analysis',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: Object.keys(BASH_WORKER_ACTIONS), description: 'One of the allowlisted actions' },
        taskId: { type: 'string', description: 'Optional task id for the receipt (defaults to acp:<action>:<timestamp>)' }
      },
      required: ['action']
    },
    outputSchema: { type: 'object' },
    examples: [
      {
        input: { action: 'graph-snapshot-parity-validate' },
        output: { taskId: 'acp:graph-snapshot-parity-validate:...', status: 'SUCCEEDED', exitCode: 0 },
        description: 'Re-run the GRAPH_SNAPSHOT_PARITY validator with both backends'
      }
    ],
    handler: bashWorkerExecute
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
