import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { chatMessages } from '$lib/server/db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { loadCodebaseContext } from '$lib/server/retrieval/codebase-context.js';
import { getGraphContext } from '$lib/server/retrieval/graph-context.js';
import { lookupCachedResponse, storeCachedResponse } from '$lib/server/ai/llm-cache.js';
import { getFragment, setFragment, getGlyphCacheMetrics, FragmentType } from '$lib/server/glyph-prompt-cache.js';
import { createHash } from 'crypto';
import { traceEmbedding } from '$lib/server/observability/langfuse.js';
import { evaluateResponse, generateCorrectionPrompt } from '$lib/server/ace/self-prompt.js';
import { fetchGlossaryMatches } from '$lib/server/ace/context-assembler.js';
import { orderByDependency, extractCitationRefs } from '$lib/server/retrieval/document-dag.js';
import type { DAGDocument } from '$lib/server/retrieval/document-dag.js';
import { getCachedEmbedding, setCachedEmbedding } from '$lib/server/knowledge-cache.js';
import { produceTokenChunk, trimTokenStream } from '$lib/server/redis-streams.js';
import { z } from 'zod';

const sseChatSchema = z.object({
  message: z.string().min(1, 'Message is required').max(50000),
  model: z.string().max(100).optional(),
  conversationId: z.string().min(1, 'Missing conversationId').max(200),
  emotionPrompt: z.string().max(5000).optional(),
  emotionMood: z.string().max(100).optional(),
  attachmentSourceHash: z.string().max(64).optional(),
  currentRoute: z.string().max(500).optional(),
});

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const QDRANT_URL = ENV.QDRANT_URL;

// Embedding model used for both indexing and retrieval — must match
const EMBEDDING_MODEL = 'embeddinggemma:latest';

// Token budget caps (chars, ~4 chars per token)
const CASE_CONTEXT_MAX_CHARS = 1200;
const RAG_CHUNK_MAX_CHARS = 600;
const RAG_MAX_CHUNKS = 5;

// Qdrant uses cosine distance — score is already 0..1 similarity.
// For cosine with embeddinggemma, useful hits typically score > 0.30.
const RAG_SCORE_THRESHOLD = 0.3;

// Conversation memory: load last N messages for multi-turn context
const CONVERSATION_HISTORY_LIMIT = 10;
const PRELUDE_RAG_TIMEOUT_MS = 6000;
const CACHE_LOOKUP_TIMEOUT_MS = 2000;

// Corrective RAG: if top retrieval score is below this, reformulate query and retry
const CORRECTIVE_RAG_THRESHOLD = 0.5;

// ACE self-eval: evaluate response quality and retry once if below threshold
const ACE_SELF_EVAL_ENABLED = true;

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
  model?: string;
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
        for (const row of glossaryRows as any[]) {
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
					ORDER BY created_at DESC LIMIT 10`
      );
      const evidenceRows = evidenceResult.rows || [];

      if (evidenceRows.length > 0) {
        context += `\n## Evidence on File (${evidenceRows.length} items)\n`;
        for (const e of evidenceRows as any[]) {
          const type = (e.evidence_type || 'unknown').toUpperCase();
          const meta = (typeof e.metadata === 'string' ? JSON.parse(e.metadata) : e.metadata) || {};
          const entityCount =
            meta.entityCount ?? (Array.isArray(meta.entities) ? meta.entities.length : 0);
          const flags = Array.isArray(meta.forensicFlags) ? meta.forensicFlags : [];
          const highFlags = flags.filter((f: any) => f.severity === 'high');
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
        .limit(10);

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
const RAG_COLLECTIONS = [
  'evidence_vectors', // uploaded evidence: PDFs, images, documents
  'case_chunks', // court opinions, rulings, case law
  'law_sections', // statutes, constitutions, regulations, codes
  'legal_documents', // ACE ingest, knowledge docs, summaries
] as const;

/**
 * Search a single Qdrant collection. Returns raw hits or empty array on failure.
 */
async function searchCollection(
  collection: string,
  vector: number[],
  limit: number,
  filter?: Record<string, unknown>
): Promise<Array<Record<string, unknown>>> {
  try {
    const vectorPayload = collection === 'legal_documents' ? { name: 'content', vector } : vector;

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
    if (!res.ok) return [];
    const data = await res.json();
    return (data.result ?? []).map((r: Record<string, unknown>) => ({
      ...r,
      _collection: collection,
    }));
  } catch {
    return [];
  }
}

/**
 * Retrieve relevant context documents using Qdrant vector search.
 * Embeds the query via Ollama, searches all legal collections in parallel,
 * merges results by score, validates embedding consistency.
 * Returns empty array if embedding or search fails (chat continues without RAG).
 */
async function retrieveContext(query: string, limit = RAG_MAX_CHUNKS): Promise<ContextDoc[]> {
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
          body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: query, keep_alive: '24h' }),
          signal: AbortSignal.timeout(8000),
        })
      );

      if (!embedRes.ok) return [];
      const embedData = await embedRes.json();
      vector = embedData.embedding;
      if (!Array.isArray(vector) || vector.length === 0) return [];

      embeddingDims = vector.length;
      embeddingModel = String(embedData.model ?? EMBEDDING_MODEL);
      // Store in cache for future queries (fire-and-forget)
      setCachedEmbedding(query, EMBEDDING_MODEL, vector).catch(() => {});
    }

    // 2. Search ALL legal collections in parallel
    const allHits = await Promise.all(
      RAG_COLLECTIONS.map((col) => searchCollection(col, vector, limit))
    );
    const merged = allHits.flat();

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
  timeoutMs = PRELUDE_RAG_TIMEOUT_MS
): Promise<ContextDoc[]> {
  try {
    return await Promise.race([
      retrieveContext(query, limit),
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
        body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: query, keep_alive: '24h' }),
        signal: AbortSignal.timeout(8000),
      })
    );

    if (!embedRes.ok) return [];
    const embedData = await embedRes.json();
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
        model: 'gemma3-legal:latest',
        prompt: `Rephrase this legal search query to improve retrieval results. Return ONLY the rephrased query, no explanation.\n\nOriginal query: "${originalQuery}"`,
        stream: false,
        keep_alive: '24h',
        options: { temperature: 0.3, num_predict: 100 },
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!reformulateRes.ok) return { docs: originalDocs, reformulated: false };

    const reformulateData = await reformulateRes.json();
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
 */
function dagOrderContext(docs: ContextDoc[]): ContextDoc[] {
  if (docs.length <= 1) return docs;

  const knownIds = new Set(docs.map((d) => d.documentId));

  // Build DAG documents with cross-references
  const dagDocs: DAGDocument[] = docs.map((d) => ({
    id: d.documentId,
    title: d.documentId,
    score: d.similarity,
    citations: extractCitationRefs(d.content, knownIds),
    content: d.content,
  }));

  const { ordered, cycles } = orderByDependency(dagDocs);
  if (cycles.length > 0) {
    console.log(`[DAG] Reordered ${docs.length} RAG chunks, broke ${cycles.length} cycle(s)`);
  }

  // Map back to ContextDocs preserving DAG order
  const docMap = new Map(docs.map((d) => [d.documentId, d]));
  return ordered
    .map((dagDoc) => docMap.get(dagDoc.id))
    .filter((d): d is ContextDoc => d !== undefined);
}

export const POST: RequestHandler = async ({ request }) => {
  const raw = await request.json();
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
  } = parsed.data;

  // Save user message to chatMessages table
  try {
    await db.insert(chatMessages).values({
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      chatId: conversationId,
      role: 'user',
      content: message,
    });
  } catch (e) {
    console.error('Failed to save user message', e);
  }

  // Publish user message to chat.context queue for embedding indexing (non-blocking)
  import('$lib/server/queue/rabbitmq-manager-fixed.js')
    .then(({ rabbitmq }) => {
      rabbitmq.publishChatContext({
        sessionId: conversationId,
        message,
        role: 'user',
        metadata: { emotionMood: emotionMood ?? undefined },
      });
    })
    .catch(() => {
      /* RabbitMQ unavailable — non-critical */
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

      const [rawContextDocs, freshCodebaseResult] = await Promise.all([
        attachmentScopedDocs.length > 0
          ? Promise.resolve(attachmentScopedDocs)
          : hasInlineAttachmentSource
            ? Promise.resolve([])
            : retrieveContextWithBudget(message),
        wantsCode && !codeGlyphHit
          ? loadCodebaseContext(message).catch(() => null)
          : Promise.resolve(null),
      ]);

      // If we got fresh codebase context, cache it in L0.5
      if (freshCodebaseResult && !codeGlyphHit) {
        codebaseResult = freshCodebaseResult;
        const codeGlyphKey = `glyph:code:${createHash('md5').update(message).digest('hex').slice(0, 12)}`;
        setFragment(codeGlyphKey, freshCodebaseResult.context, FragmentType.CODE, 5 * 60_000);
      }

      // ── Corrective RAG: auto-reformulate query on low retrieval scores ──
      const {
        docs: correctedDocs,
        reformulated,
        newQuery,
      } = await correctiveRetrieval(message, rawContextDocs);

      // ── DAG ordering: reorder context by citation dependency ──
      const contextDocs = dagOrderContext(correctedDocs);

      const contextUsed = contextDocs.map((d) => d.documentId);

      // ── L0.5 Intercept 3: KAG Graph Context ─────────────────────
      // Cache graph traversal by evidence ID set (10min TTL)
      let graphContext: {
        context: string;
        neighbors: Array<{ nodeId: string; title: string }>;
      } | null = null;
      if (contextDocs.length > 0) {
        const evidenceIds = contextDocs
          .map((d) => d.documentId.split(':').pop())
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

      let systemPrompt =
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
      if (caseContext) {
        systemPrompt += `\n\n${caseContext}`;
      }

      if (glossaryContext) {
        systemPrompt += `\n\n${glossaryContext}`;
      }

      // Inject RAG context (vector-similar documents, DAG-ordered, budget-capped)
      if (contextDocs.length > 0) {
        const contextText = contextDocs
          .map((d, i) => `[Source ${i + 1} (relevance: ${d.similarity.toFixed(2)})] ${d.content}`)
          .join('\n\n');
        systemPrompt += `\n\n## Retrieved Evidence (${contextDocs.length} sources${reformulated ? ', query-corrected' : ''})\n${contextText}`;
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

      // Inject codebase context (recall→rerank pipeline)
      if (codebaseResult) {
        systemPrompt += `\n\n${codebaseResult.context}`;
      }

      // Inject emotion context from client-side detection (text + face + behavioral)
      if (emotionPrompt) {
        systemPrompt += `\n${emotionPrompt}`;
      }

      let fullResponse = '';

      // LLM Response Cache: Check if we have a cached response for this query + context
      const cacheResult = hasInlineAttachmentSource
        ? { hit: false }
        : await lookupCachedResponseWithBudget({
            query: message,
            context: systemPrompt,
            model: model ?? 'gemma3-legal:latest',
          });

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
          model: model ?? 'gemma3-legal:latest',
          glossaryMatches: serializeGlossaryMatches(glossaryMatches),
          cachedResponse: true,
          cachedAt: cacheResult.cachedAt,
        });

        try {
          await db.insert(chatMessages).values({
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            chatId: conversationId,
            role: 'assistant',
            content: fullResponse,
            metadata: assistantMetadata,
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
        });

        controller.close();
        return;
      }

      // Cache MISS — proceed with Ollama API call
      try {
        // Build multi-turn messages array for Ollama /api/chat
        // Prepend page context to the user message so the model sees it inline
        let augmentedMessage = message;
        if (currentRoute) {
          const pageLabel = describeRoute(currentRoute);
          augmentedMessage = `[I am currently viewing: ${pageLabel}]\n\n${message}`;
        }
        const ollamaMessages = [
          { role: 'system', content: systemPrompt },
          ...conversationHistory,
          { role: 'user', content: augmentedMessage },
        ];

        // Stream from Ollama with RAG-enriched system prompt + conversation history
        const ollamaRes = await ollamaFetch(`${OLLAMA_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: model ?? 'gemma3-legal:latest',
            messages: ollamaMessages,
            stream: true,
            keep_alive: '24h',
          }),
        });

        if (!ollamaRes.ok || !ollamaRes.body) {
          throw new Error(`Ollama error: ${ollamaRes.status}`);
        }

        const reader = ollamaRes.body.getReader();
        const decoder = new TextDecoder();
        let tokenSeq = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value, { stream: true });
          for (const line of text.split('\n').filter(Boolean)) {
            try {
              const parsed = JSON.parse(line);
              // Ollama /api/chat returns message.content; /api/generate returns response
              const chunk = parsed.message?.content ?? parsed.response;
              if (chunk) {
                fullResponse += chunk;
                send({
                  id,
                  role: 'assistant',
                  content: fullResponse,
                  status: 'streaming',
                });
                // Persist token chunk to Redis Stream for SSE crash recovery / replay
                produceTokenChunk(conversationId, tokenSeq++, chunk).catch(() => {});
              }
            } catch {
              // skip malformed JSON lines
            }
          }
        }

        // Trim the token stream to prevent unbounded growth
        trimTokenStream(conversationId, 2000).catch(() => {});

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
                    content: d.content,
                    score: d.similarity,
                    source: d.documentId,
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
                },
                backend: 'ollama',
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

                const retryRes = await ollamaFetch(`${OLLAMA_URL}/api/chat`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    model: model ?? 'gemma3-legal:latest',
                    messages: [
                      { role: 'system', content: systemPrompt },
                      ...conversationHistory,
                      { role: 'user', content: augmentedMessage },
                      { role: 'assistant', content: fullResponse },
                      { role: 'user', content: correctionPrompt },
                    ],
                    stream: true,
                    keep_alive: '24h',
                  }),
                });

                if (retryRes.ok && retryRes.body) {
                  let improvedResponse = '';
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
                  if (improvedResponse.length > 50) {
                    fullResponse = improvedResponse;
                    extractedCitations = extractResponseCitations(fullResponse, contextDocs);
                    console.log(
                      `[ACE Self-Eval] Improved response accepted (${improvedResponse.length} chars)`
                    );
                  }
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
          model: model ?? 'gemma3-legal:latest',
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
        });

        try {
          await db.insert(chatMessages).values({
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            chatId: conversationId,
            role: 'assistant',
            content: fullResponse,
            metadata: assistantMetadata,
          });
        } catch (dbErr) {
          console.warn(
            '[SSE Chat] Failed to persist assistant message:',
            dbErr instanceof Error ? dbErr.message : dbErr
          );
        }

        // Publish assistant response to chat.context queue (non-blocking)
        import('$lib/server/queue/rabbitmq-manager-fixed.js')
          .then(({ rabbitmq }) => {
            rabbitmq.publishChatContext({
              sessionId: conversationId,
              message: fullResponse.slice(0, 5000),
              role: 'assistant',
              metadata: { model: model ?? 'gemma3-legal:latest', confidence },
            });
          })
          .catch(() => {});

        // Store response in LLM cache for future lookups (non-blocking)
        try {
          const embedRes = await ollamaFetch(`${OLLAMA_URL}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: message, keep_alive: '24h' }),
            signal: AbortSignal.timeout(8000),
          }).catch(() => null);

          if (embedRes?.ok) {
            const embedData = await embedRes.json();
            if (Array.isArray(embedData.embedding)) {
              storeCachedResponse({
                query: message,
                queryEmbedding: embedData.embedding,
                context: systemPrompt,
                response: fullResponse,
                model: model ?? 'gemma3-legal:latest',
                confidence,
              }).catch((err) => console.warn('[SSE Chat] Cache storage failed:', err));
            }
          }
        } catch (cacheErr) {
          console.warn(
            '[SSE Chat] Response caching failed:',
            cacheErr instanceof Error ? cacheErr.message : cacheErr
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
