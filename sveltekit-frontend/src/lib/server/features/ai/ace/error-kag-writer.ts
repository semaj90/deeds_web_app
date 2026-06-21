/**
 * Error → KAG Writer
 *
 * When the agentic tool loop encounters errors, this module:
 *   1. Summarizes the error context using Gemma 4
 *   2. Stores in research_summaries (Postgres pgvector) with entity_tags
 *   3. Embeds and upserts to Qdrant for future semantic retrieval
 *   4. Feeds the turbo-prefix-cache L2 Postgres lookup on next query
 *
 * This closes the loop:
 *   Error → Summarize → Store in KAG → Next query retrieves relevant error context
 *
 * Storage targets:
 *   - Postgres: research_summaries (pgvector embedding + entity_tags JSONB)
 *   - Redis:    web:research:idx:all ZSET (for turbo-prefix-cache L1 fast path)
 *   - Qdrant:   knowledge_base collection (for RAG retrieval)
 */

import { pool } from '$lib/server/db/client';
import { getOllamaEndpoint, ollamaFetch, VLM_MODELS } from '$lib/server/ollama.js';
import { ENV } from '$lib/server/env.server.js';
import { SERVER_EMBEDDING_MODEL } from '$lib/ai/model-ids.js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface ErrorKagEntry {
  query: string;
  errorMessage: string;
  errorStack?: string;
  toolResults?: Array<{ toolName: string; result: unknown }>;
  filePath?: string;
  pipeline: string;
}

export interface ErrorKagWriteResult {
  ok: boolean;
  summaryId?: string;
  summary?: string;
  entityTags?: string[];
  embeddingDims?: number;
  error?: string;
  durationMs: number;
}

// ── Entity tag extraction ──────────────────────────────────────────────────

/**
 * Extract entity tags from error text for JSONB filtering.
 * Pulls: TypeScript error codes, file paths, module names, HTTP status codes.
 */
function extractErrorTags(error: string, filePath?: string): string[] {
  const tags = new Set<string>();

  // TS error codes (TS2304, TS1005, etc.)
  const tsCodes = error.match(/TS\d{4,5}/g);
  tsCodes?.forEach(c => tags.add(c.toLowerCase()));

  // HTTP status codes
  const httpCodes = error.match(/\b[45]\d{2}\b/g);
  httpCodes?.forEach(c => tags.add(`http-${c}`));

  // Known error patterns
  if (/cannot find module/i.test(error)) tags.add('module-not-found');
  if (/connection refused/i.test(error)) tags.add('connection-refused');
  if (/timeout/i.test(error)) tags.add('timeout');
  if (/econnreset|econnrefused/i.test(error)) tags.add('network-error');
  if (/out of memory|oom/i.test(error)) tags.add('oom');
  if (/permission denied|unauthorized/i.test(error)) tags.add('auth-error');
  if (/syntax error|parsing error/i.test(error)) tags.add('syntax-error');
  if (/type.*not assignable/i.test(error)) tags.add('type-error');

  // File path segments
  if (filePath) {
    const segments = filePath.split(/[/\\]/).filter(s => s.length > 2);
    segments.slice(-3).forEach(s => tags.add(s.replace(/\.\w+$/, '').toLowerCase()));
  }

  return [...tags].slice(0, 10);
}

// ── Embedding helper ───────────────────────────────────────────────────────

async function embedText(text: string): Promise<number[] | null> {
  try {
    const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: SERVER_EMBEDDING_MODEL,
        prompt: text.slice(0, 2000),
        keep_alive: '24h',
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { embedding?: number[] };
    return data.embedding?.length === 768 ? data.embedding : null;
  } catch {
    return null;
  }
}

// ── Summarize error with Gemma 4 ───────────────────────────────────────────

async function summarizeError(entry: ErrorKagEntry): Promise<string> {
  const prompt = [
    `Summarize this error for a knowledge base entry (2-3 sentences):`,
    `Query: ${entry.query}`,
    `Error: ${entry.errorMessage.slice(0, 1000)}`,
    entry.errorStack ? `Stack: ${entry.errorStack.slice(0, 500)}` : '',
    entry.filePath ? `File: ${entry.filePath}` : '',
    entry.toolResults?.length
      ? `Tool results: ${entry.toolResults.map(t => `${t.toolName}: ${JSON.stringify(t.result).slice(0, 200)}`).join('; ')}`
      : '',
    'Include: what failed, likely cause, and which files/modules are involved.',
  ].filter(Boolean).join('\n');

  try {
    const res = await ollamaFetch(`${getOllamaEndpoint()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: VLM_MODELS.legal,
        prompt,
        stream: false,
        options: { temperature: 0.1, num_predict: 256 },
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) return entry.errorMessage.slice(0, 500);
    const data = (await res.json()) as { response?: string };
    return (data.response ?? entry.errorMessage).slice(0, 1000);
  } catch {
    return entry.errorMessage.slice(0, 500);
  }
}

// ── Write to KAG (Postgres + Redis + Qdrant) ──────────────────────────────

/**
 * Store an error summary into the Knowledge-Augmented Generation stores:
 *   1. Gemma 4 summarization
 *   2. Embedding via embeddinggemma
 *   3. Postgres research_summaries INSERT
 *   4. Redis ZSET update (L1 fast path)
 *   5. Qdrant upsert (optional, for RAG retrieval)
 *
 * All writes are best-effort — failures are logged but don't block.
 */
export async function writeErrorToKag(entry: ErrorKagEntry): Promise<ErrorKagWriteResult> {
  const startMs = performance.now();

  try {
    // ── Novelty gate: skip low-value and duplicate errors ──────────────
    const entityTags = extractErrorTags(entry.errorMessage, entry.filePath);

    // Skip obviously low-value noise
    if (entry.errorMessage.length < 20) {
      return { ok: false, error: 'Error too short — skipped', durationMs: Math.round(performance.now() - startMs) };
    }
    const noisePatterns = [
      /^fetch failed$/i,
      /^network error$/i,
      /^timeout$/i,
      /^aborted$/i,
      /^ECONNREFUSED$/i,
      /^socket hang up$/i,
    ];
    if (noisePatterns.some(p => p.test(entry.errorMessage.trim()))) {
      return { ok: false, error: 'Transient infrastructure noise — skipped', durationMs: Math.round(performance.now() - startMs) };
    }

    // Check for recent duplicates (same tags overlap in last 2 hours)
    if (entityTags.length > 0) {
      try {
        const { rows } = await pool.query<{ cnt: string }>(
          `SELECT COUNT(*) AS cnt FROM research_summaries
           WHERE created_at > NOW() - INTERVAL '2 hours'
             AND pipeline = $1
             AND entity_tags && $2::text[]
           LIMIT 1`,
          [entry.pipeline, entityTags],
        );
        const recent = Number(rows[0]?.cnt ?? 0);
        if (recent >= 3) {
          return { ok: false, error: `Duplicate — ${recent} similar errors in last 2h`, durationMs: Math.round(performance.now() - startMs) };
        }
      } catch {
        // DB check failed — proceed anyway (novelty unknown)
      }
    }

    // 1. Summarize
    const summary = await summarizeError(entry);

    // 2. Embed
    const embedding = await embedText(`${entry.query} ${summary}`);

    // 3. Qdrant semantic deduplication gate (cosine > 0.85 = near-duplicate, skip)
    if (embedding) {
      try {
        const dedupRes = await fetch(
          `${ENV.QDRANT_URL}/collections/knowledge_base/points/search`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              vector: embedding,
              limit: 1,
              score_threshold: 0.85,
              with_payload: false,
            }),
            signal: AbortSignal.timeout(4_000),
          },
        );
        if (dedupRes.ok) {
          const dedupData = (await dedupRes.json()) as { result?: Array<{ score: number }> };
          const topScore = dedupData.result?.[0]?.score ?? 0;
          if (topScore >= 0.85) {
            return {
              ok: false,
              error: `Near-duplicate in Qdrant (score ${topScore.toFixed(3)}) — skipped`,
              durationMs: Math.round(performance.now() - startMs),
            };
          }
        }
      } catch {
        // Qdrant dedup check failed — proceed (novelty unknown, better to store)
      }
    }

    // 4. Postgres INSERT
    let summaryId: string | undefined;
    try {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO research_summaries (query, summary, pipeline, relevance_score, entity_tags, embedding, source_url)
         VALUES ($1, $2, $3, $4, $5::text[], $6::vector, $7)
         RETURNING id::text`,
        [
          entry.query.slice(0, 500),
          summary,
          entry.pipeline,
          0.7,  // default relevance for error context
          entityTags,
          embedding ? JSON.stringify(embedding) : null,
          entry.filePath ?? null,
        ],
      );
      summaryId = result.rows[0]?.id;
    } catch (err) {
      console.warn('[error-kag] Postgres insert failed:', (err as Error).message);
    }

    // 5. Redis ZSET (fire-and-forget for turbo-prefix-cache L1)
    try {
      const { getRedis } = await import('$lib/server/redis.js');
      const redis = getRedis();
      const hashKey = summaryId ?? `err-${Date.now()}`;
      await redis.zadd('web:research:idx:all', 0.7, hashKey);
      await redis.setex(`web:research:sum:${hashKey}`, 7200, JSON.stringify({
        urlHash: hashKey,
        query: entry.query,
        summary,
        pipeline: entry.pipeline,
        relevanceScore: 0.7,
        entityTags,
      }));
    } catch {
      // Redis not available — non-fatal
    }

    // 6. Qdrant upsert (fire-and-forget for RAG retrieval)
    if (embedding && summaryId) {
      try {
        await fetch(`${ENV.QDRANT_URL}/collections/knowledge_base/points`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: [{
              id: summaryId,
              vector: embedding,
              payload: {
                query: entry.query,
                summary,
                pipeline: entry.pipeline,
                entityTags,
                source: 'error-kag',
                filePath: entry.filePath ?? null,
                createdAt: new Date().toISOString(),
              },
            }],
          }),
          signal: AbortSignal.timeout(5_000),
        });
      } catch {
        // Qdrant not available — non-fatal
      }
    }

    return {
      ok: true,
      summaryId,
      summary,
      entityTags,
      embeddingDims: embedding?.length,
      durationMs: Math.round(performance.now() - startMs),
    };
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message,
      durationMs: Math.round(performance.now() - startMs),
    };
  }
}
