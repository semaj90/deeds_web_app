import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { chatMessages } from '$lib/server/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import {
  getChatModelKeepAlive,
  getEmbeddingModelKeepAlive,
  ollamaFetch,
} from '$lib/server/ollama.js';
import { loadCodebaseContext } from '$lib/server/retrieval/codebase-context.js';
import { getGraphContext, getCaseGraphNeighborIds, buildGraphShouldFilter, applyGraphAuthorityScoring, getNeo4jMultiHopNeighbors, formatNeo4jContext, type GraphNeighbor } from '$lib/server/retrieval/graph-context.js';
import { graphExpandRetrieval } from '$lib/server/retrieval/graph-informed-retrieval.js';
import { buildVectorPayload } from '$lib/server/config/vector-config.js';
import { lookupCachedResponse, storeCachedResponse } from '$lib/server/ai/llm-cache.js';
import {
  getFragment,
  setFragment,
  getGlyphCacheMetrics,
  FragmentType,
} from '$lib/server/glyph-prompt-cache.js';
import { createHash } from 'crypto';
import { synthesisKey, getCaseVersion, TTL } from '$lib/server/cache-keys.js';
import { setCache, getFromMemoryCache } from '$lib/server/cache.js';
import { traceEmbedding, traceLLM } from '$lib/server/observability/langfuse.js';
import { evaluateResponse, generateCorrectionPrompt } from '$lib/server/ace/self-prompt.js';
import { fetchGlossaryMatches, fetchCachedACEChunks, persistACEChunks } from '$lib/server/ace/context-assembler.js';
import { orderByDependency, extractCitationRefs } from '$lib/server/retrieval/document-dag.js';
import type { DAGDocument } from '$lib/server/retrieval/document-dag.js';
import { extractLegalTags } from '$lib/server/rag/tag-extractor.js';
import { getCachedEmbedding, setCachedEmbedding } from '$lib/server/knowledge-cache.js';
import { getCachedDAG, setCachedDAG } from '$lib/server/cache/dag-cache.js';
import { logInference } from '$lib/server/observability/inference-log.js';
import { queryHash as computeQueryHash, recordSearchQuery } from '$lib/server/analytics/search-analytics.js';
import { authorityChainExpansion, type EmbedFn } from '$lib/server/retrieval/authority-chain.js';
import { chatDocumentAttachments } from '$lib/server/db/schema-postgres.js';
import { streamLLM as streamTrtLLM, healthCheck as trtHealthCheck } from '$lib/server/trt-llm.js';
import {
  streamLLM as streamTritonLLM,
  healthCheck as tritonHealthCheck,
} from '$lib/server/triton-llm.js';
import {
  acquireGpuLease,
  releaseGpuLease,
  getGpuLeaseStatus,
} from '$lib/server/inference/gpu-arbiter.js';
import { produceTokenChunk, trimTokenStream } from '$lib/server/redis-streams.js';
import { z } from 'zod';
import { shouldBackfill, triggerBackfillAsync } from '$lib/server/retrieval/auto-backfill.js';
import { determineACEPolicy } from '$lib/server/ace/policy.js';
import type { ACEContext, ACEPolicyDecision } from '$lib/server/ace/types.js';
import type { ContextualToolResult } from '$lib/server/ai/contextual-tools.js';
import { fastJsonParse } from '$lib/server/gpu/simdjson-bridge.js';
import {
  getCachedStreamResponse,
  storeCachedStreamResponse,
  streamCachedResponse,
} from '$lib/server/ai/cached-stream.js';

/**
 * Fetch uploaded documents for chat session and retrieve chunks from Qdrant
 */
async function fetchChatDocumentContext(sessionId: string): Promise<string | null> {
  try {
    // Query chat_document_attachments for this session
    const attachments = await db
      .select()
      .from(chatDocumentAttachments)
      .where(eq(chatDocumentAttachments.chat_session_id, sessionId))
      .limit(5);

    if (attachments.length === 0) {
      return null;
    }

    // Retrieve document chunks from Qdrant chat_documents collection
    const documentChunks = await Promise.all(
      attachments.map(async (attachment) => {
        if (!attachment.qdrant_id || attachment.embedding_status !== 'completed') {
          // Document not yet indexed or failed
          return {
            fileName: attachment.file_name,
            chunks: [],
            status: attachment.embedding_status,
          };
        }

        try {
          // Search Qdrant for chunks with this document's metadata
          const response = await fetch(
            `${ENV.QDRANT_URL}/collections/chat_documents/points/scroll`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                filter: {
                  must: [
                    {
                      key: 'documentId',
                      match: { value: attachment.document_id || attachment.qdrant_id },
                    },
                  ],
                },
                limit: 10,
                with_payload: true,
              }),
            }
          );

          if (!response.ok) {
            console.warn(`Failed to fetch chunks for ${attachment.file_name} from Qdrant`);
            return { fileName: attachment.file_name, chunks: [], status: 'error' };
          }

          // GPU-accelerated JSON parsing via simdjson (5× faster for Qdrant responses)
          const rawText = await response.text();
          const result = fastJsonParse<{ result?: { points?: any[] } | any[] }>(rawText);
          const resultData = result.result;
          const points = Array.isArray(resultData) ? resultData : resultData?.points || [];
          const chunks = points.map((hit: any) => hit.payload?.text || '').filter(Boolean);

          return {
            fileName: attachment.file_name,
            fileSize: attachment.file_size,
            chunks,
            status: 'success',
          };
        } catch (error) {
          console.warn(`Error fetching chunks for ${attachment.file_name}:`, error);
          return { fileName: attachment.file_name, chunks: [], status: 'error' };
        }
      })
    );

    // Build context string
    const contextParts: string[] = ['## Uploaded Documents (Chat Attachments)'];

    documentChunks.forEach((doc, i) => {
      if (doc.chunks.length > 0) {
        contextParts.push(
          `\n### Document ${i + 1}: ${doc.fileName} (${doc.chunks.length} relevant excerpts)`,
          ...doc.chunks.map((chunk, j) => `[Excerpt ${j + 1}] ${chunk}`)
        );
      } else if (doc.status === 'pending' || doc.status === 'processing') {
        contextParts.push(`\n### Document ${i + 1}: ${doc.fileName} (⏳ still processing...)`);
      }
    });

    if (contextParts.length > 1) {
      contextParts.push(
        '\n**Document Citation Rules:**',
        '- When referencing uploaded documents, cite as [Document N, Excerpt M]',
        '- Example: "According to [Document 1, Excerpt 2], the contract states..."',
        '- If a document is still processing, mention it to the user'
      );
      return contextParts.join('\n');
    }

    return null;
  } catch (error) {
    console.error('Failed to fetch chat document context:', error);
    return null;
  }
}

const sseChatSchema = z.object({
  message: z.string().min(1, 'Message is required').max(50000),
  model: z.string().max(100).optional(),
  conversationId: z.string().min(1, 'Missing conversationId').max(200),
  emotionPrompt: z.string().max(5000).optional(),
  emotionMood: z.string().max(100).optional(),
  attachmentSourceHash: z.string().max(64).optional(),
  currentRoute: z.string().max(500).optional(),
  enableTools: z.boolean().optional(),
});

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const QDRANT_URL = ENV.QDRANT_URL;

// Embedding model used for both indexing and retrieval — must match
const EMBEDDING_MODEL = 'embeddinggemma:latest';

// Token budget caps (chars, ~4 chars per token) — expanded for 128K+ context models
const CASE_CONTEXT_MAX_CHARS = 3200;
const RAG_CHUNK_MAX_CHARS = 1500;
const RAG_MAX_CHUNKS = 12;

// Qdrant uses cosine distance — score is already 0..1 similarity.
// For cosine with embeddinggemma, useful hits typically score > 0.30.
const RAG_SCORE_THRESHOLD = 0.3;

// Conversation memory: load last N messages for multi-turn context
const CONVERSATION_HISTORY_LIMIT = 20;
const PRELUDE_RAG_TIMEOUT_MS = 6000;
const CACHE_LOOKUP_TIMEOUT_MS = 2000;

// Corrective RAG: if top retrieval score is below this, reformulate query and retry
const CORRECTIVE_RAG_THRESHOLD = 0.5;

// ACE self-eval adds a second Ollama pass and 10s timeout noise on interactive chat.
// Keep it opt-in here; other non-interactive routes can still use self-eval directly.
const ACE_SELF_EVAL_ENABLED = (process.env?.ACE_CHAT_SELF_EVAL_ENABLED ?? 'false') === 'true';

// Strict caseId format: "case-" followed by a UUID
const CASE_ID_PATTERN = /^case-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * Map a URL pathname to a human-readable page description for LLM context.
 */
function describeRoute(pathname: string): string {
  const routes: Record<string, string> = {
    '/dashboard': 'the Dashboard (case overview, statistics, recent activity)',
    '/active-cases': 'Active Cases list',
    '/citations': 'Citations library (legal citations, statutes, case law references)',
    '/evidence': 'Evidence management hub',
    '/evidence/analyze': 'Evidence Analysis page (AI-powered forensic analysis)',
    '/evidence/manage': 'Evidence management (upload, organize, tag)',
    '/evidence/upload': 'Evidence upload page',
    '/evidence-library': 'Evidence Library (search and browse all evidence)',
    '/reports': 'Reports list (generated case reports)',
    '/reports/new': 'New Report creation',
    '/recommendations': 'AI Recommendations (suggested actions, related cases)',
    '/global-search': 'Global Search (cross-domain search across cases, evidence, statutes)',
    '/legal-corpus': 'Legal Corpus (statute database, legal reference library)',
    '/persons-of-interest': 'Persons of Interest (POI profiles, suspect tracking)',
    '/terminal': 'Terminal (developer console, AI chat, system commands)',
    '/command-center': 'Command Center (system overview, infrastructure status)',
    '/analysis-center': 'Analysis Center (deep analytics, case patterns)',
    '/system-configuration': 'System Configuration (settings, theme, AI engine config)',
    '/demos': 'Demo pages (feature showcases)',
    '/admin/ai-dashboard': 'Admin AI Dashboard (model status, inference metrics)',
    '/admin/error-brain': 'Error Brain (error tracking, pattern detection)',
    '/admin/phase89': 'Phase 89 Admin (cluster management)',
    '/admin/all-routes': 'All Routes admin (route health monitoring)',
    '/admin/component-analysis': 'Component Analysis (codebase component audit)',
    '/admin/dev-tools': 'Developer Tools',
  };

  // Exact match
  if (routes[pathname]) return routes[pathname];

  // Pattern matches for dynamic routes
  if (/^\/cases\/[^/]+\/evidence/.test(pathname))
    return 'Case Evidence tab (evidence for a specific case)';
  if (/^\/cases\/[^/]+\/notes/.test(pathname))
    return 'Case Notes tab (notes and annotations for a case)';
  if (/^\/cases\/[^/]+\/persons/.test(pathname))
    return 'Case Persons tab (people linked to this case)';
  if (/^\/cases\/[^/]+\/reports/.test(pathname)) return 'Case Reports tab (reports for this case)';
  if (/^\/cases\/[^/]+\/chat/.test(pathname)) return 'Case Chat tab (AI chat scoped to this case)';
  if (/^\/cases\/[^/]+\/ai/.test(pathname)) return 'Case AI tab (AI analysis for this case)';
  if (/^\/cases\/[^/]+\/canvas/.test(pathname)) return 'Case Canvas (visual investigation board)';
  if (/^\/cases\/[^/]+\/board/.test(pathname)) return 'Case Board (kanban task board)';
  if (/^\/cases\/[^/]+/.test(pathname)) return 'Case Detail page (specific case overview)';
  if (/^\/cases/.test(pathname)) return 'Cases list (all cases)';
  if (/^\/persons-of-interest\/create/.test(pathname)) return 'Create new Person of Interest';
  if (/^\/persons-of-interest\/[^/]+/.test(pathname)) return 'Person of Interest detail page';
  if (/^\/legal-corpus\/[^/]+/.test(pathname)) return 'Legal Corpus document detail';
  if (/^\/demos\//.test(pathname)) return `Demo page (${pathname.split('/').pop()})`;
  if (/^\/admin\//.test(pathname)) return `Admin page (${pathname.split('/').pop()})`;

  return `page at ${pathname}`;
}

interface ContextDoc {
  content: string;
  similarity: number;
  documentId: string;
  sourceId?: string;
  model?: string;
}

function resolveContextSourceId(
  payload: Record<string, unknown> | undefined,
  fallbackId: string
): string {
  const candidate =
    payload?.document_id ?? payload?.evidence_id ?? payload?.source_id ?? payload?.file_path;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : fallbackId;
}

interface ConfidenceFactors {
  caseContext: boolean;
  ragHits: number;
  topScore: number | null;
  embeddingModel: string;
  codebaseHits: number;
  kagNeighbors: number;
}

function extractResponseCitations(
  response: string,
  contextDocs: ContextDoc[]
): Array<{
  sourceNum: number;
  documentId: string;
  similarity: number;
}> {
  const extractedCitations: Array<{
    sourceNum: number;
    documentId: string;
    similarity: number;
  }> = [];
  const sourceRefs = response.match(/\[Source\s+(\d+)[^\]]*\]/g) ?? [];

  for (const ref of sourceRefs) {
    const match = ref.match(/\[Source\s+(\d+)/);
    if (!match) continue;

    const sourceNum = parseInt(match[1]) - 1;
    if (sourceNum < 0 || sourceNum >= contextDocs.length) continue;

    const doc = contextDocs[sourceNum];
    if (!extractedCitations.some((citation) => citation.documentId === doc.documentId)) {
      extractedCitations.push({
        sourceNum: sourceNum + 1,
        documentId: doc.documentId,
        similarity: doc.similarity,
      });
    }
  }

  return extractedCitations;
}

/**
 * Load case context from PostgreSQL for injection into AI prompts.
 * Fetches case details, recent evidence, and linked citations.
 * Respects CASE_CONTEXT_MAX_CHARS budget.
 */
async function loadCaseContext(caseId: string): Promise<string | null> {
  try {
    const { cases } = await import('$lib/server/db/schema');

    const caseRows = await db.select().from(cases).where(eq(cases.id, caseId)).limit(1);

    if (!caseRows.length) return null;

    const c = caseRows[0];
    let context = `## Active Case Context\n`;
    context += `- **Title**: ${c.title}\n`;
    if (c.caseNumber) context += `- **Case #**: ${c.caseNumber}\n`;
    if (c.jurisdiction) context += `- **Jurisdiction**: ${c.jurisdiction}\n`;
    if (c.court) context += `- **Court**: ${c.court}\n`;
    if (c.status) context += `- **Status**: ${c.status}\n`;
    if (c.description) context += `- **Description**: ${c.description}\n`;

    try {
      const glossaryResult = await db.execute(
        sql`SELECT citation_text, notes
            FROM case_library_links
            WHERE case_id = ${caseId} AND category = 'glossary_concept'
            ORDER BY created_at DESC
            LIMIT 5`
      );
      const glossaryRows = glossaryResult.rows || [];

      if (glossaryRows.length > 0) {
        context += `\n## Saved Legal Concepts (${glossaryRows.length} items)\n`;
        for (const row of glossaryRows as Record<string, unknown>[]) {
          const term = String(row.citation_text ?? '').trim();
          const definition = String(row.notes ?? '').trim();
          if (!term) continue;
          context += `- ${term}${definition ? `: ${definition.slice(0, 160)}` : ''}\n`;
        }
      }
    } catch (e) {
      console.warn('[Case Context] Glossary query failed:', e instanceof Error ? e.message : e);
    }

    // Load recent evidence with metadata (type, forensic flags, entities)
    try {
      const evidenceResult = await db.execute(
        sql`SELECT title, evidence_type, file_type, file_size, metadata
					FROM evidence WHERE case_id = ${caseId}
					ORDER BY created_at DESC LIMIT 15`
      );
      const evidenceRows = evidenceResult.rows || [];

      if (evidenceRows.length > 0) {
        context += `\n## Evidence on File (${evidenceRows.length} items)\n`;
        for (const e of evidenceRows as Record<string, any>[]) {
          const type = (e.evidence_type || 'unknown').toUpperCase();
          const meta = (typeof e.metadata === 'string' ? JSON.parse(e.metadata) : e.metadata) || {};
          const entityCount =
            meta.entityCount ?? (Array.isArray(meta.entities) ? meta.entities.length : 0);
          const flags = Array.isArray(meta.forensicFlags) ? meta.forensicFlags : [];
          const highFlags = flags.filter((f: Record<string, unknown>) => f.severity === 'high');
          const forensicLabel = highFlags.length
            ? `Forensic: HIGH (${highFlags.length})`
            : flags.length
              ? `Forensic: ${flags.length} flags`
              : 'No forensic flags';
          const summary = meta.summary ? String(meta.summary).slice(0, 80) : '';
          context += `- [${type}] "${e.title || 'Untitled'}" (${e.file_type || 'unknown'}) | Entities: ${entityCount} | ${forensicLabel}${summary ? '\n  ' + summary : ''}\n`;
        }
      }
    } catch (e) {
      console.warn('[Case Context] Evidence query failed:', e instanceof Error ? e.message : e);
    }

    // Load linked citations
    try {
      const { savedCitations } = await import('$lib/server/db/schema');
      const citationRows = await db
        .select()
        .from(savedCitations)
        .where(eq(savedCitations.caseId, caseId))
        .limit(15);

      if (citationRows.length > 0) {
        context += `\n## Citations (${citationRows.length} items)\n`;
        for (const cit of citationRows) {
          context += `- ${cit.statuteCode}: ${cit.statuteTitle ?? ''}\n`;
        }
      }
    } catch (e) {
      console.warn('[Case Context] Citations query failed:', e instanceof Error ? e.message : e);
    }

    // Enforce token budget
    if (context.length > CASE_CONTEXT_MAX_CHARS) {
      context = context.slice(0, CASE_CONTEXT_MAX_CHARS) + '\n...(truncated)';
    }

    return context;
  } catch (error) {
    console.warn('[Case Context] Failed to load:', error);
    return null;
  }
}

async function loadGlossaryPayload(query: string): Promise<{
  text: string | null;
  matches: Awaited<ReturnType<typeof fetchGlossaryMatches>>;
}> {
  const matches = await fetchGlossaryMatches(query);
  if (!matches || matches.length === 0) {
    return { text: null, matches: null };
  }

  const lines = matches.slice(0, 4).map((entry) => {
    const meta = [entry.category, entry.jurisdiction, entry.citation].filter(Boolean).join(' | ');
    const suffix = meta ? ` (${meta})` : '';
    return `- ${entry.term}: ${entry.definition}${suffix}`;
  });

  return {
    text: `## Legal Definitions\n${lines.join('\n')}`,
    matches,
  };
}

function serializeGlossaryMatches(matches: Awaited<ReturnType<typeof fetchGlossaryMatches>>) {
  return (
    matches?.map((entry) => ({
      id: entry.id,
      term: entry.term,
      definition: entry.definition,
      source: entry.source,
      citation: entry.citation,
      confidence: entry.confidence,
      jurisdiction: entry.jurisdiction,
      sourceNodeId: entry.sourceNodeId,
    })) ?? []
  );
}

// All legal RAG collections to search (768-dim Cosine, embeddinggemma)
// Tiered retrieval: KB corpus (stable, heavily cacheable) vs Case evidence (case-scoped)
const KB_COLLECTIONS = [
  'case_chunks', // court opinions, rulings, case law (1 point)
  'court_opinions', // full court opinion embeddings (7,825 points)
  'legal_canon_chunks', // constitutions, statutes, regulations (59 points, named vec 'content')
  'legal_documents', // ACE ingest, knowledge docs, summaries (6,088 points, named vec 'content')
] as const;
const CASE_COLLECTIONS = [
  'evidence_vectors', // uploaded evidence: PDFs, images, documents
] as const;
const RAG_COLLECTIONS = [...KB_COLLECTIONS, ...CASE_COLLECTIONS] as const;

/**
 * Search a single Qdrant collection. Returns raw hits or empty array on failure.
 */
// buildVectorPayload imported from $lib/server/config/vector-config.js (single source of truth)

async function searchCollection(
  collection: string,
  vector: number[],
  limit: number,
  filter?: Record<string, unknown>
): Promise<Array<Record<string, unknown>>> {
  const searchStart = performance.now();
  try {
    const vectorPayload = buildVectorPayload(collection, vector);

    const res = await fetch(`${QDRANT_URL}/collections/${collection}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector: vectorPayload,
        limit,
        with_payload: true,
        score_threshold: RAG_SCORE_THRESHOLD,
        ...(filter ? { filter } : {}),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      logInference({
        type: 'vector_search',
        collection,
        backend: 'qdrant',
        latencyMs: Math.round(performance.now() - searchStart),
        cacheHit: false,
        resultCount: 0,
        error: `${res.status}`,
      });
      return [];
    }
    // GPU-accelerated JSON parsing via simdjson (5× faster for Qdrant responses)
    const rawText = await res.text();
    const data = fastJsonParse<{ result?: any[] }>(rawText);
    const results = (data.result ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      _collection: collection,
    }));
    logInference({
      type: 'vector_search',
      collection,
      backend: 'qdrant',
      latencyMs: Math.round(performance.now() - searchStart),
      cacheHit: false,
      resultCount: results.length,
    });
    return results;
  } catch {
    logInference({
      type: 'vector_search',
      collection,
      backend: 'qdrant',
      latencyMs: Math.round(performance.now() - searchStart),
      cacheHit: false,
      resultCount: 0,
      error: 'timeout',
    });
    return [];
  }
}

/**
 * Retrieve relevant context documents using Qdrant vector search.
 * Embeds the query via Ollama, searches all legal collections in parallel,
 * merges results by score, validates embedding consistency.
 * Returns empty array if embedding or search fails (chat continues without RAG).
 */
async function retrieveContext(
  query: string,
  limit = RAG_MAX_CHUNKS,
  graphFilter?: Record<string, unknown>
): Promise<ContextDoc[]> {
  try {
    // 0. Check embedding cache — skip Ollama call on hit
    const cachedVector = await getCachedEmbedding(query, EMBEDDING_MODEL).catch(() => null);
    let vector: number[];
    let embeddingDims: number;
    let embeddingModel: string;

    if (cachedVector) {
      vector = cachedVector;
      embeddingDims = cachedVector.length;
      embeddingModel = EMBEDDING_MODEL;
      console.log(`[RAG] Embedding cache HIT (${embeddingDims} dims)`);
    } else {
      // 1. Generate embedding for the user query
      const embedRes = await traceEmbedding(query, EMBEDDING_MODEL, () =>
        ollamaFetch(`${OLLAMA_URL}/api/embeddings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: EMBEDDING_MODEL,
            prompt: query,
            keep_alive: getEmbeddingModelKeepAlive(),
          }),
          signal: AbortSignal.timeout(8000),
        })
      );

      if (!embedRes.ok) return [];
      // GPU-accelerated JSON parsing via simdjson (5× faster for embedding responses)
      const embedRawText = await embedRes.text();
      const embedData = fastJsonParse<{ embedding?: number[]; model?: string }>(embedRawText);
      vector = embedData.embedding;
      if (!Array.isArray(vector) || vector.length === 0) return [];

      embeddingDims = vector.length;
      embeddingModel = String(embedData.model ?? EMBEDDING_MODEL);

      if (embeddingDims !== 768) {
        console.warn(`[RAG] Embedding dimension mismatch: expected 768, got ${embeddingDims}`);
        return [];
      }

      // Store in cache for future queries (fire-and-forget)
      setCachedEmbedding(query, EMBEDDING_MODEL, vector).catch((err) => {
        console.warn('[SSE chat] embedding cache persist failed:', (err as Error)?.message ?? err);
      });
    }

    // 2. Search tiered: KB corpus (no graph filter) + Case evidence (graph-filtered)
    const [kbHits, caseHits] = await Promise.all([
      Promise.all(KB_COLLECTIONS.map((col) => searchCollection(col, vector, limit))),
      Promise.all(CASE_COLLECTIONS.map((col) => searchCollection(col, vector, limit, graphFilter))),
    ]);
    const merged = [...kbHits.flat(), ...caseHits.flat()];

    // 3. Sort by score descending, take top `limit`
    merged.sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));
    const topResults = merged.slice(0, limit);

    if (topResults.length > 0) {
      const summary = topResults
        .map((r) => `${r._collection}:${Number(r.score ?? 0).toFixed(3)}`)
        .join(', ');
      console.log(
        `[RAG] ${merged.length} total hits across ${RAG_COLLECTIONS.length} collections → top ${topResults.length}: [${summary}]`
      );
    }

    // 4. Map to ContextDoc with validation
    return topResults
      .map((r) => {
        const payload = r.payload as Record<string, unknown> | undefined;

        const pointModel = payload?.embedding_model as string | undefined;
        const pointDims = payload?.embedding_dims as number | undefined;
        if (pointModel && pointModel !== embeddingModel) return null;
        if (pointDims && pointDims !== embeddingDims) return null;

        const rawContent = String(
          payload?.text ??
            payload?.content_preview ??
            payload?.full_text ??
            payload?.content ??
            payload?.title ??
            ''
        );
        const content =
          rawContent.length > RAG_CHUNK_MAX_CHARS
            ? rawContent.slice(0, RAG_CHUNK_MAX_CHARS) + '...'
            : rawContent;

        return {
          content,
          similarity: Number(r.score ?? 0),
          documentId: `${r._collection}:${r.id}`,
          sourceId: resolveContextSourceId(payload, `${r._collection}:${String(r.id ?? '')}`),
          model: pointModel,
        };
      })
      .filter((r: ContextDoc | null): r is ContextDoc => r !== null && r.content.length > 0);
  } catch (err) {
    console.warn('[RAG] Context retrieval skipped:', err);
    return [];
  }
}

async function retrieveContextWithBudget(
  query: string,
  limit = RAG_MAX_CHUNKS,
  timeoutMs = PRELUDE_RAG_TIMEOUT_MS,
  graphFilter?: Record<string, unknown>
): Promise<ContextDoc[]> {
  try {
    return await Promise.race([
      retrieveContext(query, limit, graphFilter),
      new Promise<ContextDoc[]>((resolve) => setTimeout(() => resolve([]), timeoutMs)),
    ]);
  } catch {
    return [];
  }
}

async function retrieveAttachmentContext(
  query: string,
  attachmentSourceHash: string,
  caseUuid?: string,
  limit = RAG_MAX_CHUNKS
): Promise<ContextDoc[]> {
  try {
    const embedRes = await traceEmbedding(query, EMBEDDING_MODEL, () =>
      ollamaFetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          prompt: query,
          keep_alive: getEmbeddingModelKeepAlive(),
        }),
        signal: AbortSignal.timeout(8000),
      })
    );

    if (!embedRes.ok) return [];
    // GPU-accelerated JSON parsing via simdjson (5× faster for embedding responses)
    const embedRawText = await embedRes.text();
    const embedData = fastJsonParse<{ embedding?: number[] }>(embedRawText);
    const vector = embedData.embedding;
    if (!Array.isArray(vector) || vector.length === 0) return [];

    const shouldFilterCase = typeof caseUuid === 'string' && caseUuid.length > 0;
    const filter = {
      must: [
        { key: 'source_hash', match: { value: attachmentSourceHash } },
        ...(shouldFilterCase ? [{ key: 'case_id', match: { value: caseUuid } }] : []),
      ],
    };

    const hits = await searchCollection('legal_documents', vector, limit, filter);
    hits.sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0));

    return hits
      .map((r) => {
        const payload = r.payload as Record<string, unknown> | undefined;
        const rawContent = String(
          payload?.full_text ?? payload?.content_preview ?? payload?.content ?? payload?.title ?? ''
        );
        const content =
          rawContent.length > RAG_CHUNK_MAX_CHARS
            ? rawContent.slice(0, RAG_CHUNK_MAX_CHARS) + '...'
            : rawContent;

        return {
          content,
          similarity: Number(r.score ?? 0),
          documentId: `legal_documents:${r.id}`,
          sourceId: resolveContextSourceId(payload, `legal_documents:${String(r.id ?? '')}`),
          model: payload?.embedding_model as string | undefined,
        };
      })
      .filter((r: ContextDoc | null): r is ContextDoc => r !== null && r.content.length > 0);
  } catch (err) {
    console.warn('[RAG] Attachment-scoped retrieval skipped:', err);
    return [];
  }
}

async function retrieveAttachmentContextWithBudget(
  query: string,
  attachmentSourceHash: string,
  caseUuid?: string,
  limit = RAG_MAX_CHUNKS,
  timeoutMs = PRELUDE_RAG_TIMEOUT_MS
): Promise<ContextDoc[]> {
  try {
    return await Promise.race([
      retrieveAttachmentContext(query, attachmentSourceHash, caseUuid, limit),
      new Promise<ContextDoc[]>((resolve) => setTimeout(() => resolve([]), timeoutMs)),
    ]);
  } catch {
    return [];
  }
}

async function lookupCachedResponseWithBudget(params: {
  query: string;
  context: string;
  model?: string;
  timeoutMs?: number;
}) {
  const { timeoutMs = CACHE_LOOKUP_TIMEOUT_MS, ...lookupParams } = params;
  try {
    return await Promise.race([
      lookupCachedResponse(lookupParams),
      new Promise<Awaited<ReturnType<typeof lookupCachedResponse>>>((resolve) =>
        setTimeout(() => resolve({ hit: false }), timeoutMs)
      ),
    ]);
  } catch {
    return { hit: false };
  }
}

/**
 * Corrective RAG: if retrieval quality is low, ask the LLM to reformulate the query
 * and perform a second retrieval pass. Returns improved context docs or original.
 */
async function correctiveRetrieval(
  originalQuery: string,
  originalDocs: ContextDoc[]
): Promise<{ docs: ContextDoc[]; reformulated: boolean; newQuery?: string }> {
  if (originalDocs.length === 0) {
    return { docs: originalDocs, reformulated: false };
  }

  const topScore = originalDocs.length > 0 ? Math.max(...originalDocs.map((d) => d.similarity)) : 0;

  // If top score is acceptable, keep original results
  if (topScore >= CORRECTIVE_RAG_THRESHOLD) {
    return { docs: originalDocs, reformulated: false };
  }

  // Low-quality retrieval — ask LLM to reformulate the query
  try {
    const reformulateRes = await ollamaFetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma4-legal:latest',
        prompt: `Rephrase this legal search query to improve retrieval results. Return ONLY the rephrased query, no explanation.\n\nOriginal query: "${originalQuery}"`,
        stream: false,
        keep_alive: getChatModelKeepAlive(),
        options: { temperature: 0.3, num_predict: 100 },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!reformulateRes.ok) return { docs: originalDocs, reformulated: false };

    // GPU-accelerated JSON parsing via simdjson (5× faster for LLM responses)
    const reformulateRawText = await reformulateRes.text();
    const reformulateData = fastJsonParse<{ response?: string }>(reformulateRawText);
    const newQuery = String(reformulateData.response ?? '')
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!newQuery || newQuery.length < 5) return { docs: originalDocs, reformulated: false };

    console.log(
      `[Corrective RAG] Reformulated: "${originalQuery.slice(0, 60)}" → "${newQuery.slice(0, 60)}" (top score was ${topScore.toFixed(3)})`
    );

    // Second retrieval pass with reformulated query
    const newDocs = await retrieveContext(newQuery);
    const newTopScore = newDocs.length > 0 ? Math.max(...newDocs.map((d) => d.similarity)) : 0;

    // Use reformulated results only if they're better
    if (newTopScore > topScore) {
      return { docs: newDocs, reformulated: true, newQuery };
    }

    // Merge both result sets, deduplicate, take top K
    const allDocs = [...originalDocs, ...newDocs];
    const seen = new Set<string>();
    const merged = allDocs.filter((d) => {
      if (seen.has(d.documentId)) return false;
      seen.add(d.documentId);
      return true;
    });
    merged.sort((a, b) => b.similarity - a.similarity);

    return { docs: merged.slice(0, RAG_MAX_CHUNKS), reformulated: true, newQuery };
  } catch (err) {
    console.warn('[Corrective RAG] Reformulation failed, using original results:', err);
    return { docs: originalDocs, reformulated: false };
  }
}

/**
 * DAG-order RAG context docs by citation dependency.
 * Cited sources appear before citing sources for better context flow.
 * Checks CouchDB cache first; stores result on miss.
 */
async function dagOrderContext(docs: ContextDoc[], caseId?: string): Promise<ContextDoc[]> {
  if (docs.length <= 1) return docs;

  const docIds = docs.map((d) => d.documentId);
  const dagStart = performance.now();

  // Check CouchDB DAG cache
  const cached = await getCachedDAG(docIds).catch(() => null);
  if (cached) {
    const docMap = new Map(docs.map((d) => [d.documentId, d]));
    const reordered = cached.orderedIds
      .map((id) => docMap.get(id))
      .filter((d): d is ContextDoc => d !== undefined);
    // Append any docs not in cache (new since cache was stored)
    for (const doc of docs) {
      if (!cached.orderedIds.includes(doc.documentId)) reordered.push(doc);
    }
    logInference({
      type: 'dag_ordering',
      backend: 'couchdb',
      latencyMs: Math.round(performance.now() - dagStart),
      cacheHit: true,
      resultCount: reordered.length,
    });
    return reordered;
  }

  const knownIds = new Set(docIds);

  // Build DAG documents with cross-references
  const dagDocs: DAGDocument[] = docs.map((d) => ({
    id: d.documentId,
    title: d.documentId,
    score: d.similarity,
    citations: extractCitationRefs(d.content, knownIds),
    content: d.content,
  }));

  const { ordered, cycles, edgesDropped } = orderByDependency(dagDocs);
  if (cycles.length > 0) {
    console.log(`[DAG] Reordered ${docs.length} RAG chunks, broke ${cycles.length} cycle(s)`);
  }

  // Map back to ContextDocs preserving DAG order
  const docMap = new Map(docs.map((d) => [d.documentId, d]));
  const result = ordered
    .map((dagDoc) => docMap.get(dagDoc.id))
    .filter((d): d is ContextDoc => d !== undefined);

  // Cache the ordering in CouchDB (fire-and-forget)
  setCachedDAG(
    docIds,
    ordered.map((d) => d.id),
    cycles,
    edgesDropped,
    caseId
  ).catch(() => {});

  logInference({
    type: 'dag_ordering',
    latencyMs: Math.round(performance.now() - dagStart),
    cacheHit: false,
    resultCount: result.length,
  });

  return result;
}

/**
 * Boost RAG results by graph connectivity.
 * Documents whose IDs appear in KAG graph neighbors get a score boost,
 * moving graph signals from prompt-only into retrieval ranking.
 */
function graphBoostRerank(
  docs: ContextDoc[],
  neighbors: Array<{ nodeId: string; title: string }>,
  boostFactor = 0.15
): ContextDoc[] {
  if (!neighbors.length || !docs.length) return docs;

  const neighborIds = new Set(neighbors.map((n) => n.nodeId));
  const neighborTitles = new Set(neighbors.map((n) => n.title.toLowerCase()));

  const boosted = docs.map((d) => {
    const docIdentity = d.sourceId ?? d.documentId;
    const docIdSuffix = docIdentity.split(':').pop() ?? '';
    const isGraphConnected = neighborIds.has(docIdSuffix) || neighborIds.has(docIdentity);

    // Also check if any neighbor title appears in the document content (fuzzy match)
    const contentLower = d.content.slice(0, 200).toLowerCase();
    const titleMatch =
      !isGraphConnected &&
      [...neighborTitles].some((t) => t.length > 3 && contentLower.includes(t));

    return {
      ...d,
      similarity:
        isGraphConnected || titleMatch ? Math.min(d.similarity + boostFactor, 1.0) : d.similarity,
    };
  });

  boosted.sort((a, b) => b.similarity - a.similarity);
  return boosted;
}

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  // GPU-accelerated JSON parsing via simdjson (5× faster for SSE request bodies)
  const rawText = await request.text();
  const raw = fastJsonParse<Record<string, unknown>>(rawText);
  const parsed = sseChatSchema.safeParse(raw);
  if (!parsed.success) {
    return new Response(parsed.error.issues[0]?.message ?? 'Invalid input', { status: 400 });
  }
  const {
    message,
    model,
    conversationId,
    emotionPrompt,
    emotionMood,
    attachmentSourceHash,
    currentRoute,
    enableTools,
  } = parsed.data;

  // Extract case UUID from conversationId (format: "case-{uuid}")
  const caseIdMatch = conversationId.match(CASE_ID_PATTERN);
  const caseUuidForDb = caseIdMatch ? caseIdMatch[1] : undefined;

  // Fire-and-forget: record into hot-query analytics ring buffer (feeds search-patterns API)
  recordSearchQuery({ query: message, pipeline: 'ace', cacheHit: false, userId: locals.user.id });

  // Save user message to chatMessages table
  try {
    await db.insert(chatMessages).values({
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      chatId: conversationId,
      role: 'user',
      content: message,
      ...(caseUuidForDb ? { caseId: caseUuidForDb } : {}),
    });
  } catch (e) {
    console.error('Failed to save user message', e);
  }

  // Publish user message to chat.context queue for embedding indexing (non-blocking)
  import('$lib/server/queue/dispatch-inline.js')
    .then(({ dispatchOrExecuteInline }) => {
      dispatchOrExecuteInline('chat.context', {
        sessionId: conversationId,
        message,
        role: 'user',
        metadata: { emotionMood: emotionMood ?? undefined },
      });
    })
    .catch(() => {
      /* dispatch unavailable — non-critical */
    });

  // Load conversation history for multi-turn context
  let conversationHistory: Array<{ role: string; content: string }> = [];
  try {
    const historyRows = await db
      .select({ role: chatMessages.role, content: chatMessages.content })
      .from(chatMessages)
      .where(eq(chatMessages.chatId, conversationId))
      .orderBy(desc(chatMessages.timestamp))
      .limit(CONVERSATION_HISTORY_LIMIT + 1); // +1 because we just inserted the current message

    // Reverse to chronological order, exclude the current message (already sent separately)
    conversationHistory = historyRows
      .reverse()
      .slice(0, -1) // remove last entry (current user message, added above)
      .map((r) => ({ role: r.role, content: r.content }));
  } catch (e) {
    console.warn(
      '[Chat] History load failed — continuing without history:',
      e instanceof Error ? e.message : e
    );
  }

  const abortSignal = request.signal;

  const shared = { cleanup: () => {} };
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const id = crypto.randomUUID();
      let closed = false;

      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      // Heartbeat every 25s to prevent proxy timeout
      const heartbeat = setInterval(() => {
        if (closed) {
          clearInterval(heartbeat);
          return;
        }
        try {
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          closed = true;
          clearInterval(heartbeat);
        }
      }, 25_000);

      // Clean up on client disconnect
      shared.cleanup = () => {
        closed = true;
        clearInterval(heartbeat);
      };
      abortSignal.addEventListener('abort', shared.cleanup, { once: true });

      // Set SSE reconnection interval (3s) for auto-reconnect on disconnect
      controller.enqueue(encoder.encode('retry: 3000\n\n'));

      send({ id, role: 'assistant', content: '', status: 'thinking' });

      // L0.5 Glyph Cache: emit diagnostic metrics
      const glyphMetrics = getGlyphCacheMetrics();
      if (glyphMetrics.entries > 0) {
        console.log(
          `[Glyph L0.5] ${glyphMetrics.entries} entries, hit rate: ${(glyphMetrics.hitRate * 100).toFixed(1)}%, compression: ${(glyphMetrics.avgCompressionRatio * 100).toFixed(0)}%`
        );
      }

      // ── L0.5 Intercept 1: Case Context ──────────────────────────
      // Cache case context per caseId (10min TTL) — identical for every
      // message in a conversation, saves 1 DB query + 2 evidence/citation queries
      let caseContext: string | null = null;
      const caseMatch = conversationId.match(CASE_ID_PATTERN);
      if (caseMatch) {
        const caseGlyphKey = `glyph:case:${caseMatch[1]}`;
        caseContext = getFragment(caseGlyphKey);
        if (caseContext) {
          console.log(`[Glyph L0.5] Case context HIT (${caseContext.length} chars)`);
        } else {
          caseContext = await loadCaseContext(caseMatch[1]);
          if (caseContext) {
            setFragment(caseGlyphKey, caseContext, FragmentType.CASE, 10 * 60_000);
          }
        }
      }

      // ── L0.5 Intercept 1b: Glossary Context ─────────────────────
      // Cache glossary matches per query hash (5min TTL).
      let glossaryContext: string | null = null;
      let glossaryMatches: Awaited<ReturnType<typeof fetchGlossaryMatches>> = null;
      const glossaryGlyphKey = `glyph:glossary:${createHash('md5').update(message).digest('hex').slice(0, 12)}`;
      glossaryContext = getFragment(glossaryGlyphKey);
      if (glossaryContext) {
        console.log(`[Glyph L0.5] Glossary context HIT (${glossaryContext.length} chars)`);
        glossaryMatches = await fetchGlossaryMatches(message).catch(() => null);
      } else {
        const glossaryPayload = await loadGlossaryPayload(message);
        glossaryContext = glossaryPayload.text;
        glossaryMatches = glossaryPayload.matches;
        if (glossaryContext) {
          setFragment(glossaryGlyphKey, glossaryContext, FragmentType.RAG, 5 * 60_000);
        }
      }

      // Code-intent gate: only run codebase retrieval for code-related queries
      const CODE_HINT =
        /(svelte|sveltekit|drizzle|ts-morph|playwright|hooks\.server|schema-postgres|route|endpoint|api\/|\.ts\b|\.svelte\b|stack trace|error|typescrip|build|vite|qdrant|rabbitmq|proto|grpc|function|handler|component|database|query|schema|migration|server)/i;
      const wantsCode =
        CODE_HINT.test(message) || message.includes('in this repo') || message.includes('codebase');
      const hasInlineAttachmentSource = message.includes('[ATTACHMENT SOURCE START]');

      // RAG + Codebase: retrieve context sources in parallel
      const caseUuid = caseMatch ? caseMatch[1] : undefined;
      const attachmentScopedDocs = attachmentSourceHash
        ? await retrieveAttachmentContextWithBudget(message, attachmentSourceHash, caseUuid)
        : [];

      // ── L0.5 Intercept 2: Codebase Context ──────────────────────
      // Cache codebase retrieval by query hash (5min TTL)
      let codebaseResult: {
        context: string;
        chunks: Array<{ relativePath: string; symbol: string; score: number }>;
      } | null = null;
      let codeGlyphHit = false;
      if (wantsCode) {
        const codeGlyphKey = `glyph:code:${createHash('md5').update(message).digest('hex').slice(0, 12)}`;
        const cachedCodeCtx = getFragment(codeGlyphKey);
        if (cachedCodeCtx) {
          codebaseResult = { context: cachedCodeCtx, chunks: [] };
          codeGlyphHit = true;
          console.log(`[Glyph L0.5] Codebase context HIT (${cachedCodeCtx.length} chars)`);
        }
      }

      // ── Pre-retrieval KAG: fetch case graph neighbors BEFORE vector search ──
      // Graph neighbor IDs become a Qdrant `should` filter that boosts
      // graph-connected documents during retrieval (not just post-retrieval).
      let preRetrievalNeighbors: GraphNeighbor[] = [];
      let preRetrievalFilter: Record<string, unknown> | undefined;
      if (caseUuid) {
        preRetrievalNeighbors = await getCaseGraphNeighborIds(caseUuid).catch(() => []);
        if (preRetrievalNeighbors.length > 0) {
          preRetrievalFilter = buildGraphShouldFilter(preRetrievalNeighbors) ?? undefined;
          console.log(
            `[KAG Pre-Retrieval] ${preRetrievalNeighbors.length} neighbors → ` +
              `${preRetrievalFilter ? 'filter built' : 'no strong neighbors'}`
          );
        }
      }

      // ── Neo4j Multi-Hop KAG: 2-3 hop Cypher traversal ──
      // Complements PG 1-hop with cross-case entity traversal.
      // Non-fatal: skipped if Neo4j unavailable.
      let neo4jContext: string | null = null;
      if (caseUuid) {
        const neo4jNeighbors = await getNeo4jMultiHopNeighbors(caseUuid).catch(() => []);
        if (neo4jNeighbors.length > 0) {
          // Deduplicate against PG neighbors
          const pgIds = new Set(preRetrievalNeighbors.map((n) => n.nodeId));
          const uniqueNeo4j = neo4jNeighbors.filter((n) => !pgIds.has(n.nodeId));
          if (uniqueNeo4j.length > 0) {
            preRetrievalNeighbors = [...preRetrievalNeighbors, ...uniqueNeo4j];
            preRetrievalFilter = buildGraphShouldFilter(preRetrievalNeighbors) ?? undefined;
            neo4jContext = formatNeo4jContext(uniqueNeo4j);
            console.log(
              `[KAG Neo4j] ${uniqueNeo4j.length} unique multi-hop neighbors ` +
                `(${neo4jNeighbors.length} total, ${preRetrievalNeighbors.length} combined)`
            );
          }
        }
      }

      // ── L0.5 Intercept: RAG Retrieval Cache (P2f) ──
      // Cache Qdrant retrieval results by (query, case) to skip embedding + search
      // on repeated queries within 2 minutes. Invalidated on new evidence upload.
      const ragGlyphKey = `glyph:rag:${createHash('md5')
        .update(message + (caseUuid ?? ''))
        .digest('hex')
        .slice(0, 12)}`;
      let ragGlyphHit = false;
      let cachedRagDocs: ContextDoc[] | null = null;
      if (!attachmentScopedDocs.length && !hasInlineAttachmentSource) {
        const cachedRag = getFragment(ragGlyphKey);
        if (cachedRag) {
          try {
            // GPU-accelerated JSON parsing via simdjson (5× faster for cached RAG docs)
            cachedRagDocs = fastJsonParse<ContextDoc[]>(cachedRag);
            ragGlyphHit = true;
            console.log(`[Glyph L0.5] RAG retrieval HIT (${cachedRagDocs?.length ?? 0} docs)`);
          } catch {}
        }
      }

      const [rawContextDocs, freshCodebaseResult, aceChunks] = await Promise.all([
        cachedRagDocs
          ? Promise.resolve(cachedRagDocs)
          : attachmentScopedDocs.length > 0
            ? Promise.resolve(attachmentScopedDocs)
            : hasInlineAttachmentSource
              ? Promise.resolve([])
              : retrieveContextWithBudget(
                  message,
                  RAG_MAX_CHUNKS,
                  PRELUDE_RAG_TIMEOUT_MS,
                  preRetrievalFilter
                ),
        wantsCode && !codeGlyphHit
          ? loadCodebaseContext(message).catch(() => null)
          : Promise.resolve(null),
        // ACE chunks: fast PostgreSQL cache read (parallel with Qdrant)
        caseUuid
          ? fetchCachedACEChunks(caseUuid).catch(
              () => [] as Array<{ content: string; score: number; source: string }>
            )
          : Promise.resolve([] as Array<{ content: string; score: number; source: string }>),
      ]);

      // Cache fresh RAG results for 2 minutes
      if (!ragGlyphHit && rawContextDocs.length > 0 && !attachmentScopedDocs.length) {
        try {
          const ragJson = JSON.stringify(rawContextDocs);
          if (ragJson.length < 60000) {
            // Stay under glyph 65535 byte limit
            setFragment(ragGlyphKey, ragJson, FragmentType.RAG, 2 * 60_000);
          }
        } catch {}
      }

      // If we got fresh codebase context, cache it in L0.5
      if (freshCodebaseResult && !codeGlyphHit) {
        codebaseResult = freshCodebaseResult;
        const codeGlyphKey = `glyph:code:${createHash('md5').update(message).digest('hex').slice(0, 12)}`;
        setFragment(codeGlyphKey, freshCodebaseResult.context, FragmentType.CODE, 5 * 60_000);
      }

      // ── Merge ACE chunks into context docs (deduplicate by content prefix) ──
      if (aceChunks.length > 0) {
        const existingPrefixes = new Set(rawContextDocs.map((d) => d.content.slice(0, 100)));
        for (const ac of aceChunks) {
          if (!existingPrefixes.has(ac.content.slice(0, 100))) {
            rawContextDocs.push({
              content:
                ac.content.length > RAG_CHUNK_MAX_CHARS
                  ? ac.content.slice(0, RAG_CHUNK_MAX_CHARS) + '...'
                  : ac.content,
              similarity: ac.score,
              documentId: `ace_chunks:${ac.source}`,
            });
            existingPrefixes.add(ac.content.slice(0, 100));
          }
        }
        console.log(
          `[ACE→SSE] Merged ${aceChunks.length} ace_chunks (${rawContextDocs.length} total context docs)`
        );
      }

      // ── Corrective RAG: auto-reformulate query on low retrieval scores ──
      const {
        docs: correctedDocs,
        reformulated,
        newQuery,
      } = await correctiveRetrieval(message, rawContextDocs);

      // ── Auto-Backfill: if retrieval still returns no useful results, research in background ──
      if (
        shouldBackfill(correctedDocs) &&
        !hasInlineAttachmentSource &&
        !attachmentScopedDocs.length
      ) {
        triggerBackfillAsync({
          query: reformulated ? (newQuery ?? message) : message,
          conversationId,
          caseId: caseUuid,
        });
      }

      // ── Query-time entity extraction (zero-cost regex) ──
      const queryEntities = extractLegalTags(message);
      if (queryEntities.statutes.length || queryEntities.cases.length) {
        console.log(
          `[Entity] Query entities: ${queryEntities.statutes.length} statutes, ${queryEntities.cases.length} cases`
        );
      }

      // ── DAG ordering: reorder context by citation dependency ──
      let contextDocs = await dagOrderContext(correctedDocs, caseUuid);

      // ── Authority Chain Drill-Down (P4): multi-hop statute/case expansion ──
      // When top results cite specific statutes or cases, embed those citations
      // and search for their full text to give the LLM primary authority sources.
      {
        const authQueryVector = await getCachedEmbedding(message, EMBEDDING_MODEL).catch(
          () => null
        );
        if (authQueryVector && contextDocs.length > 0) {
          const embedAuthority: EmbedFn = async (text) => {
            try {
              const res = await ollamaFetch(`${OLLAMA_URL}/api/embeddings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: EMBEDDING_MODEL,
                  prompt: text,
                  keep_alive: getEmbeddingModelKeepAlive(),
                }),
                signal: AbortSignal.timeout(5000),
              });
              if (!res.ok) return null;
              // GPU-accelerated JSON parsing via simdjson (5× faster for embedding responses)
              const rawText = await res.text();
              const data = fastJsonParse<{ embedding?: number[] }>(rawText);
              return Array.isArray(data.embedding) ? data.embedding : null;
            } catch {
              return null;
            }
          };

          const authResult = await authorityChainExpansion(
            authQueryVector,
            contextDocs,
            embedAuthority,
            { qdrantUrl: QDRANT_URL }
          ).catch(() => ({
            docs: contextDocs,
            hops: 0,
            expanded: 0,
            authorities: { statutes: [] as string[], cases: [] as string[] },
          }));

          if (authResult.expanded > 0) {
            contextDocs = authResult.docs.map((r) => ({
              content: r.content,
              similarity: r.score,
              documentId: r.sourceId ?? r.id,
              sourceId: r.sourceId,
              model: r.metadata?.['model'] as string | undefined,
            }));
          }
        }
      }

      const contextUsed = contextDocs.map((d) => d.documentId);

      // ── L0.5 Intercept 3: KAG Graph Context ─────────────────────
      // Cache graph traversal by evidence ID set (10min TTL)
      let graphContext: {
        context: string;
        neighbors: GraphNeighbor[];
      } | null = null;
      if (contextDocs.length > 0) {
        const evidenceIds = contextDocs
          .map((d) => d.sourceId ?? d.documentId.split(':').pop())
          .filter((id): id is string => !!id);

        const kagGlyphKey = `glyph:kag:${createHash('md5').update(evidenceIds.sort().join(',')).digest('hex').slice(0, 12)}`;
        const cachedKag = getFragment(kagGlyphKey);
        if (cachedKag) {
          graphContext = { context: cachedKag, neighbors: [] };
          console.log(`[Glyph L0.5] KAG graph context HIT (${cachedKag.length} chars)`);
        } else {
          graphContext = await getGraphContext(evidenceIds, caseUuid).catch(() => null);
          if (graphContext) {
            setFragment(kagGlyphKey, graphContext.context, FragmentType.KAG, 10 * 60_000);
          }
        }
      }

      // ── Graph-Informed Retrieval Expansion (P0 KAG Gap Fix) ──
      // Use graph neighbors to EXPAND the retrieval set, not just re-rank.
      // Fetches the query vector from embedding cache (stored by retrieveContext).
      if (graphContext?.neighbors?.length) {
        const queryVector = await getCachedEmbedding(message, EMBEDDING_MODEL).catch(() => null);
        if (queryVector) {
          const expandInput = contextDocs.map((d) => ({
            id: d.documentId,
            kind: 'legal_doc' as const,
            source: 'qdrant' as const,
            content: d.content,
            score: d.similarity,
            tags: [],
            sourceId: d.sourceId ?? d.documentId,
          }));
          const expandResult = await graphExpandRetrieval(
            queryVector,
            expandInput,
            graphContext.neighbors,
            { qdrantUrl: QDRANT_URL, collections: RAG_COLLECTIONS }
          ).catch((err) => {
            console.warn(
              '[KAG Expand] Graph expansion failed (non-fatal):',
              (err as Error)?.message ?? err
            );
            return expandInput;
          });
          contextDocs = expandResult.map((r) => ({
            content: r.content,
            similarity: r.score,
            documentId: r.sourceId ?? r.id,
            sourceId: r.sourceId,
            model: r.metadata?.['model'] as string | undefined,
          }));
        }
      }

      // ── Graph authority scoring: strength + confidence weighted re-ranking ──
      // Combines pre-retrieval neighbors (from case graph) with post-retrieval neighbors
      const allGraphNeighbors = [...preRetrievalNeighbors, ...(graphContext?.neighbors ?? [])];
      if (allGraphNeighbors.length > 0) {
        contextDocs = applyGraphAuthorityScoring(contextDocs, allGraphNeighbors);
      }

      // ── Fire-and-forget: persist top context docs to ace_chunks for future cache hits ──
      if (caseUuid && contextDocs.length > 0) {
        const aceRows = contextDocs
          .filter((d) => !d.documentId.startsWith('ace_chunks:'))
          .map((d) => ({ content: d.content, score: d.similarity, source: d.documentId }));
        if (aceRows.length > 0) {
          persistACEChunks(caseUuid, aceRows, [], []).catch((err) =>
            console.warn(
              '[ACE persist] SSE chat fire-and-forget failed:',
              (err as Error)?.message ?? err
            )
          );
        }
      }

      // ── ACE Policy Decision (P2-A fix: compute before systemPrompt so budget limits apply) ──
      const ssePolicyContext: ACEContext = {
        userProfile: null,
        caseContext,
        glossaryMatches,
        ragChunks: contextDocs.map((d) => ({
          id: d.documentId,
          kind: 'legal_doc' as const,
          source: 'qdrant' as const,
          content: d.content,
          score: d.similarity,
          tags: [],
          sourceId: d.sourceId ?? d.documentId,
        })),
        kbChunks: [],
        caseChunks: [],
        kagNeighbors:
          graphContext?.neighbors?.map((n) => ({
            nodeId: n.nodeId,
            title: n.title,
            relationship: n.connectionType,
          })) ?? [],
        chatHistory: conversationHistory
          .filter(
            (m): m is { role: 'user' | 'assistant' | 'system'; content: string } =>
              m.role === 'user' || m.role === 'assistant' || m.role === 'system'
          )
          .map((m) => ({ role: m.role, content: m.content })),
        entities: {
          statutes: queryEntities.statutes,
          cases: queryEntities.cases,
          persons: [],
          organizations: [],
          dates: [],
        },
        practiceTemplate: null,
        queryTags: [...queryEntities.statutes.slice(0, 3), ...queryEntities.cases.slice(0, 3)],
        webSearchContext: null,
        persona: 'neutral',
        evidenceMetadata: null,
        evidenceConnections: null,
        userAnalyticsContext: null,
        codebaseContext:
          codebaseResult?.chunks.map((chunk) => ({
            filePath: chunk.relativePath,
            content: chunk.symbol,
            score: chunk.score,
          })) ?? null,
        policyDecision: null,
      };
      const policyDecision: ACEPolicyDecision = determineACEPolicy(message, ssePolicyContext);
      // Apply budget limit: slice contextDocs to policy-determined chunk count before injecting into prompt
      const promptDocs = contextDocs.slice(0, policyDecision.budget.limits.mergedChunkCount);

      // ── Graph-aware KV prefix (≤150ms timeout, never blocks inference) ──────
      // buildGraphAwarePrefix pulls RL policy (L0), recent research summaries
      // (L1 Redis ZSET → L2 Postgres pgvector), DYM suggestions, and fires a
      // background crawl if the index is empty (L3). The returned prefix is
      // deterministic for a given RL policy + research index snapshot, so
      // llama-server's KV cache reuses it across many queries sharing the same
      // knowledge anchors. Fire-and-forget warm happens inside buildAndWarmPrefix.
      let graphAwarePrefix = '';
      try {
        const { buildAndWarmPrefix } = await import(
          '$lib/server/inference/turbo-prefix-cache.js'
        );
        graphAwarePrefix = await Promise.race([
          buildAndWarmPrefix(message, { caseContext: caseContext ?? undefined }),
          new Promise<string>((_, reject) => setTimeout(reject, 150)),
        ]);
      } catch { /* non-fatal — proceed without graph context */ }

      // Base role instructions. If we got a graph-aware prefix (which already
      // includes the base role instructions), use it directly; otherwise fall
      // back to the hardcoded base so the prompt is never empty.
      let systemPrompt = graphAwarePrefix ||
        'You are a legal AI assistant specialized in prosecutor and detective workflows. ' +
        'Provide accurate, detailed, and actionable legal analysis. ' +
        'Always cite relevant statutes and case law when possible. ' +
        'When retrieved source context is provided, answer from that context first, quote or summarize the strongest source directly, and do not claim that you lack access to the provided materials.';

      if (message.includes('[ATTACHMENT SOURCE START]')) {
        systemPrompt +=
          '\n\n[ATTACHMENT HANDLING RULES] The user message already contains attachment source text inline between [ATTACHMENT SOURCE START] and [ATTACHMENT SOURCE END]. Treat that text as a provided source document. Do not ask the user to provide the attachment, the excerpt, or the file contents again.';
      }

      // Inject current page context so assistant knows what the user is viewing
      if (currentRoute) {
        const pageLabel = describeRoute(currentRoute);
        systemPrompt +=
          `\n\n[PAGE CONTEXT — IMPORTANT] ` +
          `The user is chatting from within the application. Their current page is: ${pageLabel} (route: ${currentRoute}). ` +
          'You KNOW what page they are on because the application tells you. ' +
          'When they ask "what page am I on" or reference "this page", "this screen", "what I see", ' +
          `answer with: "${pageLabel}". Do NOT say you cannot see their screen — you have page context from the app.`;
      }

      // Inject case context (case details, evidence, citations)
      // Skip if the graph-aware prefix already included it via buildAndWarmPrefix
      if (caseContext && !graphAwarePrefix) {
        systemPrompt += `\n\n${caseContext}`;
      }

      // Inject uploaded document context from chat attachments
      const documentContext = await fetchChatDocumentContext(conversationId);
      if (documentContext) {
        systemPrompt += `\n\n${documentContext}`;
      }

      if (glossaryContext) {
        systemPrompt += `\n\n${glossaryContext}`;
      }

      // Inject RAG context (vector-similar documents, DAG-ordered, budget-capped by ACE policy)
      if (promptDocs.length > 0) {
        const contextText = promptDocs
          .map((d, i) => `[Source ${i + 1} (relevance: ${d.similarity.toFixed(2)})] ${d.content}`)
          .join('\n\n');
        systemPrompt += `\n\n## Retrieved Evidence (${promptDocs.length} sources${reformulated ? ', query-corrected' : ''})\n${contextText}`;
        systemPrompt +=
          '\n\n## Source Citation Rules (MANDATORY)' +
          '\n1. When answering factual questions, START with the highest-relevance source.' +
          '\n2. QUOTE a short phrase from the strongest source (use "..." quotation marks) then summarize.' +
          '\n3. Always cite sources as [Source N] — e.g. "According to [Source 1], ..."' +
          '\n4. If sources conflict, present both sides with their source numbers.' +
          '\n5. NEVER say "I don\'t have access to" or "I can\'t see" when source context IS provided above.' +
          '\n6. If no source is relevant to the question, say so explicitly rather than fabricating.';
      }

      // Inject KAG graph neighbors (related evidence from knowledge graph)
      if (graphContext) {
        systemPrompt += `\n${graphContext.context}`;
      }

      // Inject Neo4j multi-hop graph context (cross-case connections)
      if (neo4jContext) {
        systemPrompt += neo4jContext;
      }

      // Inject codebase context (recall→rerank pipeline)
      if (codebaseResult) {
        systemPrompt += `\n\n${codebaseResult.context}`;
      }

      // Inject emotion context from client-side detection (text + face + behavioral)
      if (emotionPrompt) {
        systemPrompt += `\n${emotionPrompt}`;
      }

      // Inject user analytics context (search patterns, graph neighbors, similar past queries)
      const chatUserId = (locals as { user?: { id?: string } })?.user?.id;
      if (chatUserId) {
        try {
          const { fetchUserAnalyticsContext } = await import(
            '$lib/server/ace/user-analytics-context.js'
          );
          const analyticsCtx = await fetchUserAnalyticsContext(chatUserId, message, caseUuid);
          if (analyticsCtx) {
            systemPrompt += `\n\n${analyticsCtx}`;
          }
        } catch {
          // Analytics context unavailable — non-fatal
        }
      }

      // ── Agentic Tool Calling: pre-stream tool detection ──────────
      // If enableTools is true (default for case-bound sessions), do a quick
      // non-streaming pass to check if the LLM wants to call tools (web search,
      // glossary, RAG). Tool results are injected into the system prompt.
      // ssePolicyContext + policyDecision computed above (before systemPrompt build).

      let toolResults: ContextualToolResult[] = [];
      const shouldRunTools = enableTools ?? !!caseMatch;
      if (shouldRunTools && !hasInlineAttachmentSource) {
        try {
          const { runToolDetectionPass } = await import('$lib/server/ai/contextual-tools.js');
          toolResults = await Promise.race([
            runToolDetectionPass(
              OLLAMA_URL,
              model ?? 'gemma4-legal:latest',
              systemPrompt,
              conversationHistory,
              message,
              getChatModelKeepAlive(),
              {
                message,
                caseId: caseUuid,
                retrievalConfidence: policyDecision.retrievalConfidence,
                parameterHints: {
                  query: message,
                  caseId: caseUuid,
                },
              }
            ),
            new Promise<typeof toolResults>((resolve) => setTimeout(() => resolve([]), 10_000)),
          ]);
          if (toolResults.length > 0) {
            const toolContext = toolResults
              .filter((r) => r.ok && r.result)
              .map((r) => `[Tool: ${r.tool}] ${r.result}`)
              .join('\n\n');
            if (toolContext) {
              systemPrompt += `\n\n## Tool Results\n${toolContext}`;
            }
            console.log(
              `[SSE Chat] Tool detection: ${toolResults.length} tool(s) called — ` +
                toolResults.map((r) => `${r.tool}:${r.durationMs}ms`).join(', ')
            );
          }
        } catch (toolErr) {
          console.warn(
            '[SSE Chat] Tool detection failed (non-fatal):',
            toolErr instanceof Error ? toolErr.message : toolErr
          );
        }
      }

      // ── TurboQuant KV prefix warm (fallback) ─────────────────────────────
      // buildAndWarmPrefix (called above) already fires the KV warm for the
      // stable graph-aware prefix. Only fall back here if the prefix build
      // timed out so the GPU slot still gets warmed with the ACE system prompt.
      if (!graphAwarePrefix) {
        import('$lib/server/inference/turbo-prefix-cache.js').then(({ warmTurboQuantKvCache }) => {
          warmTurboQuantKvCache(systemPrompt).catch(() => {});
        }).catch(() => {});
      }

      let fullResponse = '';

      // Versioned synthesis cache check (case-scoped, version-stamped)
      const synthCaseId = caseMatch?.[1];
      let synthCaseVersion = 0;
      let versionedSynthHit = false;
      if (synthCaseId && !hasInlineAttachmentSource) {
        synthCaseVersion = await getCaseVersion(synthCaseId);
        const sKey = synthesisKey.forQuery(
          synthCaseId,
          message,
          model ?? 'gemma4-legal:latest',
          'v1',
          synthCaseVersion
        );
        const memHit = getFromMemoryCache(sKey);
        if (memHit.found && typeof (memHit.value as any)?.response === 'string') {
          fullResponse = (memHit.value as any).response;
          versionedSynthHit = true;
          console.log(`[SSE Chat] Versioned synthesis cache HIT (memory, v${synthCaseVersion})`);
        } else {
          try {
            const { getFromRedisCache } = await import('$lib/server/cache.js');
            const parsed = await getFromRedisCache<{ response?: string }>(sKey);
            if (parsed?.response) {
              fullResponse = parsed.response;
              versionedSynthHit = true;
              console.log(`[SSE Chat] Versioned synthesis cache HIT (redis, v${synthCaseVersion})`);
            }
          } catch {
            /* miss */
          }
        }
      }

      // ── L1: Redis Exact-Match Cache (2ms on hit, 1,436× speedup) ──
      let cacheResult: Awaited<ReturnType<typeof lookupCachedResponseWithBudget>> = { hit: false };

      if (!versionedSynthHit && !hasInlineAttachmentSource) {
        // Try Redis L1 exact-match first (instant 2ms lookup)
        try {
          const { generateCacheKey, getExactMatchCache } = await import(
            '$lib/server/cache/redis-exact-match.js'
          );
          const exactCacheKey = generateCacheKey({
            model: model ?? 'gemma4-legal:latest',
            messages: [
              { role: 'system', content: systemPrompt },
              ...conversationHistory,
              { role: 'user', content: message },
            ],
            temperature: 0.7,
            maxTokens: 2048,
          });

          const exactMatch = await getExactMatchCache(exactCacheKey);
          if (exactMatch) {
            console.log(
              `[SSE Chat] L1 Redis EXACT-MATCH HIT (${exactMatch.backend}) — instant return`
            );
            cacheResult = {
              hit: true,
              response: exactMatch.content,
              similarity: 1.0,
              model: exactMatch.model,
              cachedAt: new Date().toISOString(),
              confidence: 0.95,
            };
          }
        } catch (l1Err) {
          console.warn('[SSE Chat] L1 Redis cache check failed:', l1Err);
          // Continue to L2 semantic cache on error
        }
      }

      // ── L2: Fallback to Qdrant Semantic Cache (500ms, similarity threshold) ──
      if (!cacheResult.hit) {
        cacheResult = versionedSynthHit
          ? { hit: true, response: fullResponse, similarity: 1.0 }
          : hasInlineAttachmentSource
            ? { hit: false }
            : await lookupCachedResponseWithBudget({
                query: message,
                context: systemPrompt,
                model: model ?? 'gemma4-legal:latest',
              });
      }

      if (cacheResult.hit && cacheResult.response) {
        // Cache HIT — stream the cached response in chunks to simulate live streaming
        console.log(`[SSE Chat] Cache HIT — similarity: ${cacheResult.similarity?.toFixed(3)}`);
        fullResponse = cacheResult.response;

        // Simulate streaming by sending chunks (improves UX, user sees progressive output)
        const chunkSize = 50; // characters per chunk
        for (let i = 0; i < fullResponse.length; i += chunkSize) {
          const chunk = fullResponse.slice(i, i + chunkSize);
          send({
            id,
            role: 'assistant',
            content: fullResponse.slice(0, i + chunkSize),
            status: 'streaming',
          });
          // Small delay to simulate natural typing speed
          await new Promise((resolve) => setTimeout(resolve, 20));
        }

        // Build confidence factors (use cached values if available)
        const topScore =
          contextDocs.length > 0 ? Math.max(...contextDocs.map((d) => d.similarity)) : null;

        const confidenceFactors: ConfidenceFactors = {
          caseContext: caseContext !== null,
          ragHits: contextDocs.length,
          topScore,
          embeddingModel: EMBEDDING_MODEL,
          codebaseHits: codebaseResult?.chunks.length ?? 0,
          kagNeighbors: graphContext?.neighbors.length ?? 0,
        };

        let confidence = cacheResult.confidence ?? 0.8; // Use cached confidence or default

        // Extract citations
        const extractedCitations = extractResponseCitations(fullResponse, contextDocs);

        // Persist assistant message
        const assistantMetadata = JSON.stringify({
          confidence,
          confidenceFactors,
          policyDecision,
          contextUsed: {
            case: caseContext !== null,
            glossaryMatches: serializeGlossaryMatches(glossaryMatches),
            ragDocIds: contextUsed,
            ragScores: contextDocs.map((d) => ({
              id: d.documentId,
              score: d.similarity,
            })),
            codebaseChunks:
              codebaseResult?.chunks.map((c) => ({
                path: c.relativePath,
                symbol: c.symbol,
                score: c.score,
              })) ?? [],
            citations: extractedCitations,
          },
          conversationTurns: conversationHistory.length,
          model: model ?? 'gemma4-legal:latest',
          glossaryMatches: serializeGlossaryMatches(glossaryMatches),
          cachedResponse: true,
          cachedAt: cacheResult.cachedAt,
          ...(toolResults.length > 0 ? { toolResults } : {}),
        });

        try {
          await db.insert(chatMessages).values({
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            chatId: conversationId,
            role: 'assistant',
            content: fullResponse,
            metadata: assistantMetadata,
            ...(caseUuidForDb ? { caseId: caseUuidForDb } : {}),
          });
        } catch (dbErr) {
          console.warn(
            '[SSE Chat] Failed to persist cached assistant message:',
            dbErr instanceof Error ? dbErr.message : dbErr
          );
        }

        send({
          id,
          role: 'assistant',
          content: fullResponse,
          status: 'done',
          confidence,
          confidenceFactors,
          contextUsed,
          citations: extractedCitations,
          glossaryMatches: serializeGlossaryMatches(glossaryMatches),
          conversationTurns: conversationHistory.length,
          cachedResponse: true,
          policyDecision,
          ...(toolResults.length > 0 ? { toolResults } : {}),
        });

        controller.close();
        return;
      }

      // Cache MISS — streaming inference cascade: TRT-LLM → Triton → Ollama
      try {
        // Build multi-turn messages array for Ollama /api/chat
        // Prepend page context to the user message so the model sees it inline
        let augmentedMessage = message;
        if (currentRoute) {
          const pageLabel = describeRoute(currentRoute);
          augmentedMessage = `[I am currently viewing: ${pageLabel}]\n\n${message}`;
        }

        // Flatten conversation into a single prompt for TRT-LLM/Triton (non-chat APIs)
        const flatPrompt = [
          `<|system|>\n${systemPrompt}`,
          ...conversationHistory.map(
            (m: { role: string; content: string }) => `<|${m.role}|>\n${m.content}`
          ),
          `<|user|>\n${augmentedMessage}`,
          '<|assistant|>',
        ].join('\n');

        const ollamaMessages = [
          { role: 'system', content: systemPrompt },
          ...conversationHistory,
          { role: 'user', content: augmentedMessage },
        ];

        const llmStreamStart = performance.now();
        let tokenSeq = 0;
        let inferenceBackend: 'tensorrt' | 'triton' | 'ollama' = 'ollama';

        await traceLLM(
          'sse-chat-generation',
          {
            model: model ?? 'gemma4-legal:latest',
            backend: 'auto',
            prompt: flatPrompt,
            policyAction: policyDecision.action,
            budgetTier: policyDecision.budget.tier,
            retrievalConfidence: policyDecision.retrievalConfidence,
          },
          async (generation) => {
            // Helper: consume an async generator and stream chunks to client
            const consumeStream = async (
              stream: AsyncGenerator<{ content: string; done: boolean }>
            ) => {
              for await (const chunk of stream) {
                if (chunk.done) break;
                if (chunk.content) {
                  fullResponse += chunk.content;
                  send({ id, role: 'assistant', content: fullResponse, status: 'streaming' });
                  produceTokenChunk(conversationId, tokenSeq++, chunk.content).catch((err) => {
                    console.warn(
                      '[SSE chat] token chunk persist failed:',
                      (err as Error)?.message ?? err
                    );
                  });
                }
              }
            };

            // ── Tier 0: Redis L1 Exact-Match Cache (instant, 5ms on hit) ──
            let streamed = false;
            let cacheHit = false;

            try {
              const cachedResponse = await getCachedStreamResponse(ollamaMessages, {
                model: model ?? 'gemma4-legal:latest',
                temperature: 0.7,
                maxTokens: 2048,
              });

              if (cachedResponse) {
                console.log('[SSE chat] Redis L1 cache HIT — streaming cached response');
                cacheHit = true;
                streamed = true;
                inferenceBackend = 'ollama'; // Mark as Ollama since that's where it came from originally

                // Stream cached response chunk-by-chunk using the consumeStream helper
                await consumeStream(
                  streamCachedResponse(cachedResponse, {
                    chunkSize: 5,
                    chunkDelayMs: 20,
                  })
                );

                fullResponse = cachedResponse;
              }
            } catch (cacheErr) {
              console.warn('[SSE chat] Redis L1 cache check failed (non-fatal):', cacheErr);
              // Continue to live inference
            }

            // ── Tier 1: TRT-LLM streaming (fastest, requires GPU lease) ──
            if (!streamed) {
              try {
                const trtHealthy = await trtHealthCheck().catch(() => false);
                if (trtHealthy) {
                  const lease = await acquireGpuLease('tensorrt', 120).catch(() => null);
                  if (lease) {
                    try {
                      await consumeStream(streamTrtLLM({ prompt: flatPrompt, temperature: 0.7 }));
                      inferenceBackend = 'tensorrt';
                      streamed = true;
                    } finally {
                      releaseGpuLease('tensorrt').catch((e) =>
                        console.warn('[sse/chat] GPU lease release failed:', e)
                      );
                    }
                  }
                }
              } catch (trtErr) {
                console.warn(
                  '[SSE chat] TRT-LLM streaming failed:',
                  (trtErr as Error)?.message ?? trtErr
                );
              }
            }

            // ── Tier 2: Triton streaming (GPU, no arbiter needed — separate server) ──
            if (!streamed) {
              try {
                const tritonHealthy = await tritonHealthCheck().catch(() => false);
                if (tritonHealthy) {
                  await consumeStream(streamTritonLLM({ prompt: flatPrompt, temperature: 0.7 }));
                  inferenceBackend = 'triton';
                  streamed = true;
                }
              } catch (tritonErr) {
                console.warn(
                  '[SSE chat] Triton streaming failed:',
                  (tritonErr as Error)?.message ?? tritonErr
                );
              }
            }

            // ── Tier 3: Ollama streaming (development fallback) ──
            if (!streamed) {
              const ollamaRes = await ollamaFetch(`${OLLAMA_URL}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  model: model ?? 'gemma4-legal:latest',
                  messages: ollamaMessages,
                  stream: true,
                  keep_alive: getChatModelKeepAlive(),
                }),
              });

              if (!ollamaRes.ok || !ollamaRes.body) {
                throw new Error(`Ollama error: ${ollamaRes.status}`);
              }

              const reader = ollamaRes.body.getReader();
              const decoder = new TextDecoder();

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = decoder.decode(value, { stream: true });
                for (const line of text.split('\n').filter(Boolean)) {
                  try {
                    const parsed = JSON.parse(line);
                    const chunk = parsed.message?.content ?? parsed.response;
                    if (chunk) {
                      fullResponse += chunk;
                      send({ id, role: 'assistant', content: fullResponse, status: 'streaming' });
                      produceTokenChunk(conversationId, tokenSeq++, chunk).catch((err) => {
                        console.warn(
                          '[SSE chat] token chunk persist failed:',
                          (err as Error)?.message ?? err
                        );
                      });
                    }
                  } catch {
                    // skip malformed JSON lines
                  }
                }
              }
              inferenceBackend = 'ollama';
            }

            generation.end({
              output: fullResponse.slice(0, 4000),
              usage: {
                completionTokens: tokenSeq,
                totalTokens: tokenSeq,
              },
              statusMessage: inferenceBackend,
            });
          }
        );

        // Store in Redis L1 cache for future instant retrieval (fire-and-forget)
        // Note: cacheHit tracking removed - always attempt to cache successful responses
        if (fullResponse) {
          storeCachedStreamResponse(ollamaMessages, fullResponse, {
            model: model ?? 'gemma4-legal:latest',
            temperature: 0.7,
            maxTokens: 2048,
          }).catch((cacheErr) => {
            console.warn('[SSE chat] Redis L1 cache storage failed (non-fatal):', cacheErr);
          });
        }

        // Trim the token stream to prevent unbounded growth
        trimTokenStream(conversationId, 2000).catch((err) => {
          console.warn('[SSE chat] token stream trim failed:', (err as Error)?.message ?? err);
        });

        // Build confidence factors (auditable)
        const topScore =
          contextDocs.length > 0 ? Math.max(...contextDocs.map((d) => d.similarity)) : null;

        const confidenceFactors: ConfidenceFactors = {
          caseContext: caseContext !== null,
          ragHits: contextDocs.length,
          topScore,
          embeddingModel: EMBEDDING_MODEL,
          codebaseHits: codebaseResult?.chunks.length ?? 0,
          kagNeighbors: graphContext?.neighbors.length ?? 0,
        };

        // Confidence: base 0.4, +0.15 for case context, +0.05 per RAG hit, +0.15 for high-quality top hit
        let confidence = 0.4;
        if (caseContext) confidence += 0.15;
        if (contextDocs.length > 0) {
          confidence += Math.min(contextDocs.length * 0.05, 0.25);
        }
        if (topScore !== null && topScore > 0.6) {
          confidence += 0.15;
        }
        if (codebaseResult && codebaseResult.chunks.length > 0) {
          confidence += Math.min(codebaseResult.chunks.length * 0.03, 0.1);
        }
        if (graphContext && graphContext.neighbors.length > 0) {
          confidence += Math.min(graphContext.neighbors.length * 0.02, 0.1);
        }
        confidence = Math.min(confidence, 0.95);

        // Extract [Source N] citations from the LLM response
        let extractedCitations = extractResponseCitations(fullResponse, contextDocs);

        // ── ACE Self-Evaluation: assess response quality, retry once if low ──
        // Wrap in a 15s wallclock timeout to prevent GPU queue stalls
        let aceEvaluation: {
          quality: number;
          completeness: number;
          accuracy: number;
          suggestions: string[];
          shouldRetry: boolean;
          evalMs: number;
        } | null = null;
        if (ACE_SELF_EVAL_ENABLED && fullResponse.length > 50) {
          try {
            send({ id, role: 'assistant', content: fullResponse, status: 'evaluating' });

            const evalTimeout = new Promise<null>((resolve) =>
              setTimeout(() => resolve(null), 15000)
            );
            aceEvaluation = await Promise.race([
              evaluateResponse({
                query: message,
                response: fullResponse,
                context: {
                  userProfile: null,
                  caseContext,
                  glossaryMatches,
                  ragChunks: contextDocs.map((d) => ({
                    id: d.documentId,
                    kind: 'legal_doc' as const,
                    source: 'qdrant' as const,
                    content: d.content,
                    score: d.similarity,
                    tags: [],
                    sourceId: d.sourceId ?? d.documentId,
                  })),
                  kagNeighbors:
                    graphContext?.neighbors.map((n) => ({
                      nodeId: n.nodeId,
                      title: n.title,
                      relationship: 'related',
                    })) ?? [],
                  chatHistory: conversationHistory.map((h) => ({
                    role: h.role as 'user' | 'assistant' | 'system',
                    content: h.content,
                  })),
                  entities: { statutes: [], cases: [], persons: [], organizations: [], dates: [] },
                  practiceTemplate: null,
                  queryTags: [],
                  webSearchContext: null,
                  persona: 'formal',
                  evidenceMetadata: null,
                  evidenceConnections: null,
                  userAnalyticsContext: null,
                  codebaseContext: null,
                  kbChunks: [],
                  caseChunks: [],
                  policyDecision: null,
                },
                backend: inferenceBackend,
              }),
              evalTimeout,
            ]);

            if (!aceEvaluation) {
              console.warn('[ACE Self-Eval] Timed out after 15s — skipping');
            } else {
              console.log(
                `[ACE Self-Eval] quality=${aceEvaluation.quality.toFixed(2)} completeness=${aceEvaluation.completeness.toFixed(2)} accuracy=${aceEvaluation.accuracy.toFixed(2)} evalMs=${aceEvaluation.evalMs}ms`
              );
            }

            // If quality is low, generate correction prompt and retry once
            if (aceEvaluation?.shouldRetry && aceEvaluation.quality < 0.6) {
              const correctionPrompt = generateCorrectionPrompt(
                aceEvaluation,
                message,
                fullResponse
              );
              if (correctionPrompt) {
                console.log(
                  `[ACE Self-Eval] Retrying with correction (quality was ${aceEvaluation.quality.toFixed(2)})`
                );
                send({ id, role: 'assistant', content: fullResponse, status: 'improving' });

                // Build retry prompt with correction context
                const retryFlatPrompt = [
                  `<|system|>\n${systemPrompt}`,
                  ...conversationHistory.map(
                    (m: { role: string; content: string }) => `<|${m.role}|>\n${m.content}`
                  ),
                  `<|user|>\n${augmentedMessage}`,
                  `<|assistant|>\n${fullResponse}`,
                  `<|user|>\n${correctionPrompt}`,
                  '<|assistant|>',
                ].join('\n');

                let improvedResponse = '';
                let retryStreamed = false;

                // Use same backend cascade for retry: TRT-LLM → Triton → Ollama
                const retryBackend = inferenceBackend as 'tensorrt' | 'triton' | 'ollama';
                if (retryBackend === 'tensorrt' || retryBackend === 'triton') {
                  try {
                    const retryStream =
                      retryBackend === 'tensorrt'
                        ? streamTrtLLM({ prompt: retryFlatPrompt, temperature: 0.7 })
                        : streamTritonLLM({ prompt: retryFlatPrompt, temperature: 0.7 });
                    for await (const chunk of retryStream) {
                      if (chunk.done) break;
                      if (chunk.content) {
                        improvedResponse += chunk.content;
                        send({
                          id,
                          role: 'assistant',
                          content: improvedResponse,
                          status: 'streaming',
                        });
                      }
                    }
                    retryStreamed = true;
                  } catch {
                    // Fall through to Ollama retry
                  }
                }

                if (!retryStreamed) {
                  const retryRes = await ollamaFetch(`${OLLAMA_URL}/api/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      model: model ?? 'gemma4-legal:latest',
                      messages: [
                        { role: 'system', content: systemPrompt },
                        ...conversationHistory,
                        { role: 'user', content: augmentedMessage },
                        { role: 'assistant', content: fullResponse },
                        { role: 'user', content: correctionPrompt },
                      ],
                      stream: true,
                      keep_alive: getChatModelKeepAlive(),
                    }),
                  });

                  if (retryRes.ok && retryRes.body) {
                    const retryReader = retryRes.body.getReader();
                    const retryDecoder = new TextDecoder();
                    while (true) {
                      const { done: retryDone, value: retryValue } = await retryReader.read();
                      if (retryDone) break;
                      const retryText = retryDecoder.decode(retryValue, { stream: true });
                      for (const retryLine of retryText.split('\n').filter(Boolean)) {
                        try {
                          const retryParsed = JSON.parse(retryLine);
                          const retryChunk = retryParsed.message?.content ?? retryParsed.response;
                          if (retryChunk) {
                            improvedResponse += retryChunk;
                            send({
                              id,
                              role: 'assistant',
                              content: improvedResponse,
                              status: 'streaming',
                            });
                          }
                        } catch {
                          /* skip malformed */
                        }
                      }
                    }
                  }
                }

                if (improvedResponse.length > 50) {
                  fullResponse = improvedResponse;
                  extractedCitations = extractResponseCitations(fullResponse, contextDocs);
                  console.log(
                    `[ACE Self-Eval] Improved response accepted (${improvedResponse.length} chars)`
                  );
                }
              }
            }

            // Adjust confidence based on ACE evaluation
            if (aceEvaluation && aceEvaluation.quality > 0.8)
              confidence = Math.min(confidence + 0.1, 0.95);
            else if (aceEvaluation && aceEvaluation.quality < 0.5)
              confidence = Math.max(confidence - 0.1, 0.2);
          } catch (aceErr) {
            console.warn(
              '[ACE Self-Eval] Evaluation failed:',
              aceErr instanceof Error ? aceErr.message : aceErr
            );
          }
        }

        // Persist assistant message with context metadata
        const assistantMetadata = JSON.stringify({
          confidence,
          confidenceFactors,
          policyDecision,
          contextUsed: {
            case: caseContext !== null,
            glossaryMatches: serializeGlossaryMatches(glossaryMatches),
            ragDocIds: contextUsed,
            ragScores: contextDocs.map((d) => ({
              id: d.documentId,
              score: d.similarity,
            })),
            codebaseChunks:
              codebaseResult?.chunks.map((c) => ({
                path: c.relativePath,
                symbol: c.symbol,
                score: c.score,
              })) ?? [],
            citations: extractedCitations,
          },
          conversationTurns: conversationHistory.length,
          model: model ?? 'gemma4-legal:latest',
          glossaryMatches: serializeGlossaryMatches(glossaryMatches),
          ...(aceEvaluation
            ? {
                aceEvaluation: {
                  quality: aceEvaluation.quality,
                  completeness: aceEvaluation.completeness,
                  accuracy: aceEvaluation.accuracy,
                  evalMs: aceEvaluation.evalMs,
                },
              }
            : {}),
          ...(reformulated ? { correctiveRag: { reformulated: true, newQuery } } : {}),
          ...(toolResults.length > 0 ? { toolResults } : {}),
        });

        try {
          await db.insert(chatMessages).values({
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            chatId: conversationId,
            role: 'assistant',
            content: fullResponse,
            metadata: assistantMetadata,
            ...(caseUuidForDb ? { caseId: caseUuidForDb } : {}),
          });
        } catch (dbErr) {
          console.warn(
            '[SSE Chat] Failed to persist assistant message:',
            dbErr instanceof Error ? dbErr.message : dbErr
          );
        }

        // Log to CouchDB inference_log with response + self-eval for QLoRA distillation
        if (fullResponse) {
          logInference({
            type: 'llm',
            model:
              inferenceBackend === 'ollama' ? (model ?? 'gemma4-legal:latest') : inferenceBackend,
            backend: inferenceBackend,
            latencyMs: Math.round(performance.now() - llmStreamStart),
            tokenCount: tokenSeq,
            cacheHit: false,
            queryHash: computeQueryHash(message),
            metadata: {
              query: message,
              response: fullResponse.slice(0, 20_000),
              self_eval_score: aceEvaluation?.quality ?? null,
              ace_completeness: aceEvaluation?.completeness ?? null,
              ace_accuracy: aceEvaluation?.accuracy ?? null,
              policyDecision,
              ragHits: contextDocs.length,
              codebaseHits: codebaseResult?.chunks.length ?? 0,
              kagNeighbors: graphContext?.neighbors.length ?? 0,
            },
          });
        }

        // Publish assistant response to chat.context queue (non-blocking)
        import('$lib/server/queue/dispatch-inline.js')
          .then(({ dispatchOrExecuteInline }) => {
            dispatchOrExecuteInline('chat.context', {
              sessionId: conversationId,
              message: fullResponse.slice(0, 5000),
              role: 'assistant',
              metadata: { model: model ?? 'gemma4-legal:latest', confidence },
            });
          })
          .catch((err) => {
            console.warn(
              '[SSE chat] Chat context dispatch failed:',
              (err as Error)?.message ?? err
            );
          });

        // Store response in LLM cache for future lookups (non-blocking)
        try {
          const embedRes = await ollamaFetch(`${OLLAMA_URL}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: EMBEDDING_MODEL,
              prompt: message,
              keep_alive: getEmbeddingModelKeepAlive(),
            }),
            signal: AbortSignal.timeout(8000),
          }).catch(() => null);

          if (embedRes?.ok) {
            // GPU-accelerated JSON parsing via simdjson (5× faster for embedding responses)
            const embedRawText = await embedRes.text();
            const embedData = fastJsonParse<{ embedding?: number[] }>(embedRawText);
            if (Array.isArray(embedData.embedding)) {
              // Store in L2 Qdrant semantic cache
              storeCachedResponse({
                query: message,
                queryEmbedding: embedData.embedding,
                context: systemPrompt,
                response: fullResponse,
                model: model ?? 'gemma4-legal:latest',
                confidence,
              }).catch((err) => console.warn('[SSE Chat] L2 Qdrant cache storage failed:', err));

              // Store in L1 Redis exact-match cache (for instant 2ms future hits)
              import('$lib/server/cache/redis-exact-match.js')
                .then(({ generateCacheKey, setExactMatchCache }) => {
                  const exactCacheKey = generateCacheKey({
                    model: model ?? 'gemma4-legal:latest',
                    messages: [
                      { role: 'system', content: systemPrompt },
                      ...conversationHistory,
                      { role: 'user', content: message },
                    ],
                    temperature: 0.7,
                    maxTokens: 2048,
                  });
                  setExactMatchCache(exactCacheKey, {
                    content: fullResponse,
                    model: model ?? 'gemma4-legal:latest',
                    backend: inferenceBackend,
                  }).catch((err) => console.warn('[SSE Chat] L1 Redis cache storage failed:', err));
                })
                .catch(() => {
                  /* L1 cache unavailable */
                });
            }
          }
        } catch (cacheErr) {
          console.warn(
            '[SSE Chat] Response caching failed:',
            cacheErr instanceof Error ? cacheErr.message : cacheErr
          );
        }

        // Versioned synthesis cache persist (case-scoped, separate from LLM cache)
        if (synthCaseId && fullResponse) {
          const sKey = synthesisKey.forQuery(
            synthCaseId,
            message,
            model ?? 'gemma4-legal:latest',
            'v1',
            synthCaseVersion
          );
          setCache(
            sKey,
            { response: fullResponse, confidence, model: model ?? 'gemma4-legal:latest' },
            TTL.SYNTHESIS * 1000
          ).catch((err) => {
            console.warn(
              '[SSE chat] synthesis cache persist failed:',
              (err as Error)?.message ?? err
            );
          });
        }

        send({
          id,
          role: 'assistant',
          content: fullResponse,
          status: 'done',
          confidence,
          confidenceFactors,
          contextUsed,
          citations: extractedCitations,
          glossaryMatches: serializeGlossaryMatches(glossaryMatches),
          conversationTurns: conversationHistory.length,
          policyDecision,
          ...(aceEvaluation
            ? {
                aceEval: {
                  quality: aceEvaluation.quality,
                  completeness: aceEvaluation.completeness,
                  accuracy: aceEvaluation.accuracy,
                },
              }
            : {}),
          ...(reformulated ? { correctiveRag: { reformulated: true, newQuery } } : {}),
          ...(toolResults.length > 0 ? { toolResults } : {}),
        });
      } catch (error) {
        console.error(
          '[SSE Chat] Generation error:',
          error instanceof Error ? error.message : String(error),
          error instanceof Error ? error.stack : ''
        );
        send({
          id,
          role: 'assistant',
          content: fullResponse || 'Sorry, I encountered an error processing your request.',
          status: 'error',
        });
      }

      shared.cleanup();
      controller.close();
    },

    cancel() {
      shared.cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
};
