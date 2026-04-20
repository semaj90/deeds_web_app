/**
 * Auto-Backfill Service — Karpathy LLM Wiki Pattern
 *
 * When RAG retrieval returns 0 results or all scores < threshold:
 *   1. Detect the "knowledge gap"
 *   2. Dispatch background research via web search + Wikipedia
 *   3. Chunk → embed → upsert to Qdrant knowledge_base
 *   4. Future queries on the same topic hit the new knowledge
 *
 * Can be triggered:
 *   - Inline from SSE chat (fire-and-forget background task)
 *   - Via RabbitMQ knowledge.backfill queue (async worker)
 *   - Via API route POST /api/knowledge/backfill
 */

import { ENV } from '$lib/server/env.server.js';
import { createHash } from 'crypto';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const QDRANT_URL = ENV.QDRANT_URL;
const EMBEDDING_MODEL = ENV.OLLAMA_EMBED_MODEL;
const BACKFILL_COLLECTION = 'knowledge_base';
const CHUNK_SIZE = 900;
const CHUNK_OVERLAP = 150;

// Minimum score to consider retrieval "successful" — below this triggers backfill
export const BACKFILL_SCORE_THRESHOLD = 0.35;

// Cooldown: don't backfill the same query within 30 minutes
const backfillCooldown = new Map<string, number>();
const COOLDOWN_MS = 30 * 60_000;

export interface BackfillRequest {
  query: string;
  conversationId?: string;
  caseId?: string;
  maxWebResults?: number;
  wikiLimit?: number;
}

export interface BackfillResult {
  query: string;
  documentsCollected: number;
  chunksIndexed: number;
  sources: string[];
  durationMs: number;
  skipped: boolean;
  reason?: string;
}

/**
 * Check if a query's retrieval results warrant auto-backfill.
 * Returns true if results are empty or all below threshold.
 */
export function shouldBackfill(
  results: Array<{ similarity?: number; score?: number }>,
  threshold = BACKFILL_SCORE_THRESHOLD
): boolean {
  if (results.length === 0) return true;
  const topScore = Math.max(...results.map((r) => r.similarity ?? r.score ?? 0));
  return topScore < threshold;
}

/**
 * Check cooldown — prevents hammering the same query.
 */
function isOnCooldown(query: string): boolean {
  const key = createHash('md5').update(query.toLowerCase().trim()).digest('hex');
  const lastRun = backfillCooldown.get(key);
  if (lastRun && Date.now() - lastRun < COOLDOWN_MS) return true;
  return false;
}

function markCooldown(query: string): void {
  const key = createHash('md5').update(query.toLowerCase().trim()).digest('hex');
  backfillCooldown.set(key, Date.now());
  // Prune old entries (> 1 hour)
  for (const [k, v] of backfillCooldown) {
    if (Date.now() - v > 60 * 60_000) backfillCooldown.delete(k);
  }
}

/**
 * Generate embedding via Ollama.
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        prompt: text.slice(0, 8_000),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data.embedding) ? data.embedding : null;
  } catch {
    return null;
  }
}

/**
 * Simple text chunking with overlap.
 */
function chunkText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 50) chunks.push(chunk);
    start += size - overlap;
  }
  return chunks;
}

/**
 * Build deterministic point ID from URL + chunk index.
 */
function buildPointId(url: string, chunkIndex: number): string {
  const hex = createHash('sha1').update(`${url}#${chunkIndex}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Upsert a single point to Qdrant knowledge_base collection.
 */
async function upsertPoint(
  pointId: string,
  vector: number[],
  payload: Record<string, unknown>
): Promise<boolean> {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${BACKFILL_COLLECTION}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: [{ id: pointId, vector, payload }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

interface SourceDocument {
  title: string;
  url: string;
  content: string;
  source: string;
}

/**
 * Search the web using SearXNG / Google / DuckDuckGo (same strategy as knowledge-base-builder).
 */
async function searchWeb(query: string, maxResults: number): Promise<SourceDocument[]> {
  const documents: SourceDocument[] = [];

  // Try SearXNG first
  if (ENV.SEARXNG_URL) {
    try {
      const searchUrl = new URL('/search', ENV.SEARXNG_URL);
      searchUrl.searchParams.set('q', query);
      searchUrl.searchParams.set('format', 'json');
      searchUrl.searchParams.set('categories', 'general');

      const res = await fetch(searchUrl.toString(), { signal: AbortSignal.timeout(10_000) });
      if (res.ok) {
        const data = await res.json();
        const results = Array.isArray(data.results) ? data.results.slice(0, maxResults) : [];
        for (const r of results) {
          if (r.url && r.content) {
            documents.push({
              title: String(r.title ?? ''),
              url: String(r.url),
              content: String(r.content),
              source: 'searxng',
            });
          }
        }
        if (documents.length > 0) return documents;
      }
    } catch { /* fall through */ }
  }

  // Try DuckDuckGo Instant Answer API as fallback
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(ddgUrl, { signal: AbortSignal.timeout(8_000) });
    if (res.ok) {
      const data = await res.json();
      if (data.AbstractText) {
        documents.push({
          title: String(data.Heading ?? query),
          url: String(data.AbstractURL ?? ''),
          content: String(data.AbstractText),
          source: 'duckduckgo',
        });
      }
      if (Array.isArray(data.RelatedTopics)) {
        for (const topic of data.RelatedTopics.slice(0, maxResults)) {
          if (topic.Text && topic.FirstURL) {
            documents.push({
              title: String(topic.Text).slice(0, 100),
              url: String(topic.FirstURL),
              content: String(topic.Text),
              source: 'duckduckgo',
            });
          }
        }
      }
    }
  } catch { /* non-critical */ }

  return documents;
}

/**
 * Search Wikipedia for relevant articles.
 */
async function searchWikipedia(query: string, limit: number): Promise<SourceDocument[]> {
  const documents: SourceDocument[] = [];
  try {
    const params = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: query,
      srlimit: String(limit),
      format: 'json',
      origin: '*',
    });
    const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return documents;
    const data = await res.json();
    const results = data.query?.search ?? [];

    for (const r of results) {
      // Get full extract from Wikipedia
      const extractParams = new URLSearchParams({
        action: 'query',
        pageids: String(r.pageid),
        prop: 'extracts',
        exintro: '1',
        explaintext: '1',
        format: 'json',
        origin: '*',
      });
      try {
        const extractRes = await fetch(`https://en.wikipedia.org/w/api.php?${extractParams}`, {
          signal: AbortSignal.timeout(5_000),
        });
        if (extractRes.ok) {
          const extractData = await extractRes.json();
          const page = Object.values(extractData.query?.pages ?? {})[0] as Record<string, unknown>;
          const extract = String(page?.extract ?? '');
          if (extract.length > 100) {
            documents.push({
              title: String(r.title ?? ''),
              url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(r.title ?? ''))}`,
              content: extract,
              source: 'wikipedia',
            });
          }
        }
      } catch { /* skip this article */ }
    }
  } catch { /* non-critical */ }
  return documents;
}

/**
 * Execute auto-backfill: search for knowledge, chunk, embed, and index.
 * Returns the result of the backfill operation.
 */
export async function executeBackfill(request: BackfillRequest): Promise<BackfillResult> {
  const start = performance.now();
  const { query, maxWebResults = 5, wikiLimit = 3 } = request;

  if (isOnCooldown(query)) {
    return {
      query,
      documentsCollected: 0,
      chunksIndexed: 0,
      sources: [],
      durationMs: Math.round(performance.now() - start),
      skipped: true,
      reason: 'cooldown',
    };
  }

  markCooldown(query);
  console.log(`[auto-backfill] Starting research for: "${query}"`);

  // Collect documents from web + Wikipedia
  const [webDocs, wikiDocs] = await Promise.all([
    searchWeb(query, maxWebResults).catch(() => []),
    searchWikipedia(query, wikiLimit).catch(() => []),
  ]);

  const documents = [...webDocs, ...wikiDocs];
  if (documents.length === 0) {
    console.log('[auto-backfill] No documents found');
    return {
      query,
      documentsCollected: 0,
      chunksIndexed: 0,
      sources: [],
      durationMs: Math.round(performance.now() - start),
      skipped: true,
      reason: 'no-sources',
    };
  }

  // Chunk all documents
  const chunks = documents.flatMap((doc) => {
    const docChunks = chunkText(doc.content);
    return docChunks.map((chunk, idx) => ({
      doc,
      chunk,
      chunkIndex: idx,
      chunkCount: docChunks.length,
    }));
  });

  // Embed and index
  let indexed = 0;
  for (const item of chunks) {
    const embedding = await generateEmbedding(item.chunk);
    if (!embedding) continue;

    const pointId = buildPointId(item.doc.url, item.chunkIndex);
    const success = await upsertPoint(pointId, embedding, {
      document_name: item.doc.title,
      content: item.chunk,
      source: item.doc.source,
      source_url: item.doc.url,
      topic: query,
      chunk_index: item.chunkIndex,
      chunk_count: item.chunkCount,
      indexed_at: new Date().toISOString(),
      text: item.chunk.slice(0, 500),
      backfill: true,
      conversation_id: request.conversationId,
    });

    if (success) indexed++;
  }

  const sources = [...new Set(documents.map((d) => d.source))];
  const duration = Math.round(performance.now() - start);
  console.log(
    `[auto-backfill] Complete: ${documents.length} docs → ${indexed}/${chunks.length} chunks indexed in ${duration}ms`
  );

  return {
    query,
    documentsCollected: documents.length,
    chunksIndexed: indexed,
    sources,
    durationMs: duration,
    skipped: false,
  };
}

/**
 * Fire-and-forget backfill — used from SSE chat to avoid blocking the response.
 */
export function triggerBackfillAsync(request: BackfillRequest): void {
  if (isOnCooldown(request.query)) return;

  // Try RabbitMQ first (preferred — decoupled worker)
  import('$lib/server/queue/rabbitmq-manager-fixed.js')
    .then(({ rabbitmq }) => {
      if (rabbitmq && typeof rabbitmq.publishKnowledgeBackfill === 'function') {
        rabbitmq.publishKnowledgeBackfill({
          query: request.query,
          conversationId: request.conversationId,
          caseId: request.caseId,
          maxWebResults: request.maxWebResults ?? 5,
          wikiLimit: request.wikiLimit ?? 3,
        }).catch(() => {
          // RabbitMQ unavailable — fall back to inline execution
          executeBackfill(request).catch((err) => {
            console.warn('[auto-backfill] Inline fallback failed:', (err as Error)?.message);
          });
        });
      } else {
        // publishKnowledgeBackfill not available — inline
        executeBackfill(request).catch((err) => {
          console.warn('[auto-backfill] Inline fallback failed:', (err as Error)?.message);
        });
      }
    })
    .catch(() => {
      // RabbitMQ module load failed — inline
      executeBackfill(request).catch((err) => {
        console.warn('[auto-backfill] Inline fallback failed:', (err as Error)?.message);
      });
    });
}
