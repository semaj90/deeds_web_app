/**
 * context-compression.ts
 *
 * Level-2 compression pipeline: raw chunks/files/traces → compact cards.
 *
 * Design rules:
 *  - No Gemma4 calls for every chunk — prefer cached LLMS.md wiki notes and
 *    Qdrant directory summaries.
 *  - All functions are pure-ish (I/O only to Redis; no DB writes here).
 *  - Redis TTLs: file cards 24h, trace cards 24h, research cards 7d, TOC 1h.
 */

import { createHash } from 'node:crypto';
import { getRedis } from '$lib/server/redis.js';

// ── Card types ────────────────────────────────────────────────────────────────

export type FileCard = {
  stableKey:        string;
  filePath:         string;
  oneLineSummary:   string;
  importantSymbols: string[];
  knownRisks:       string[];
  recentTraceHits:  string[];
  retrievalReasons: string[];
  score:            number;
};

export type TraceCard = {
  stableKey:      string;
  traceId:        string;
  query:          string;
  oneLineSummary: string;
  topSources:     string[];
  cacheHit:       boolean;
  durationMs:     number;
};

export type ResearchCard = {
  stableKey:         string;
  question:          string;
  oneLineSummary:    string;
  sources:           string[];
  recommendedAction: string;
  confidence:        number;
};

export type AttentionToc = {
  hotFiles:            string[];
  hotSymbols:          string[];
  hotTools:            string[];
  blockedAreas:        string[];
  nextToolSuggestions: string[];
};

// ── TTLs ──────────────────────────────────────────────────────────────────────

const TTL_CARD_FILE_SECS     = 86_400;       // 24h
const TTL_CARD_TRACE_SECS    = 86_400;       // 24h
const TTL_CARD_RESEARCH_SECS = 7 * 86_400;  // 7d
const TTL_TOC_SECS           = 3_600;        // 1h

// ── Helpers ───────────────────────────────────────────────────────────────────

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex').slice(0, 32);
}

// ── compressChunkToSentence ───────────────────────────────────────────────────

/** Extract the first 1–2 sentences from a chunk, capped at 200 chars. */
export async function compressChunkToSentence(chunk: string): Promise<string> {
  const normalized = chunk.replace(/\s+/g, ' ').trim();
  const sentences  = normalized.match(/[^.!?]+[.!?]+/g) ?? [];
  const result     = sentences.slice(0, 2).join(' ').slice(0, 200);
  return result || normalized.slice(0, 200);
}

// ── compressFileToCard ────────────────────────────────────────────────────────

/**
 * Build a compact FileCard for a given file path.
 *
 * Sources tried in order:
 *  1. Redis `kv:card:file:{hash}` (exact cache)
 *  2. Redis `wiki:note:dir:{dirPath}` (graphify wiki note for directory)
 *  3. Heuristic from the file path itself
 */
export async function compressFileToCard(filePath: string): Promise<FileCard> {
  const redis     = getRedis();
  const cacheKey  = `kv:card:file:${sha256(filePath)}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as FileCard;
  } catch { /* miss */ }

  // Try the directory wiki note produced by the graphify pipeline
  let oneLineSummary = '';
  const dirPath = filePath.split('/').slice(0, -1).join('/');
  try {
    const wikiRaw = await redis.get(`wiki:note:dir:${dirPath}`);
    if (wikiRaw) {
      const wiki = JSON.parse(wikiRaw) as { summary?: string; text?: string } | string;
      if (typeof wiki === 'string') {
        oneLineSummary = wiki.slice(0, 200);
      } else {
        oneLineSummary = (wiki.summary ?? wiki.text ?? '').slice(0, 200);
      }
    }
  } catch { /* no wiki */ }

  if (!oneLineSummary) {
    const parts = filePath.split('/');
    const name  = parts[parts.length - 1].replace(/\.\w+$/, '');
    const dir   = parts.slice(-3, -1).join('/');
    oneLineSummary = `${name} — ${dir || filePath}`;
  }

  const card: FileCard = {
    stableKey:        `file:${filePath}`,
    filePath,
    oneLineSummary,
    importantSymbols: [],
    knownRisks:       [],
    recentTraceHits:  [],
    retrievalReasons: [],
    score:            0.5,
  };

  try {
    await redis.setex(cacheKey, TTL_CARD_FILE_SECS, JSON.stringify(card));
  } catch { /* non-fatal */ }

  return card;
}

// ── compressTraceToCard ───────────────────────────────────────────────────────

/**
 * Build a compact TraceCard for a trace ID (e.g. ACE retrieval trace key).
 * Looks up `ace:trace:{traceId}` from Redis for full detail.
 */
export async function compressTraceToCard(traceId: string): Promise<TraceCard> {
  const redis    = getRedis();
  const cacheKey = `kv:card:trace:${sha256(traceId)}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as TraceCard;
  } catch { /* miss */ }

  let query      = traceId;
  let topSources: string[] = [];
  let cacheHit   = false;
  let durationMs = 0;

  try {
    const traceRaw = await redis.get(`ace:trace:${traceId}`);
    if (traceRaw) {
      const parsed = JSON.parse(traceRaw) as {
        query?: string;
        sources?: string[];
        cacheHit?: boolean;
        durationMs?: number;
      };
      query      = parsed.query ?? traceId;
      topSources = (parsed.sources ?? []).slice(0, 5);
      cacheHit   = parsed.cacheHit ?? false;
      durationMs = parsed.durationMs ?? 0;
    }
  } catch { /* no trace */ }

  const card: TraceCard = {
    stableKey:      `trace:${traceId}`,
    traceId,
    query:          query.slice(0, 120),
    oneLineSummary: `"${query.slice(0, 80)}" — ${topSources.length} sources, ${cacheHit ? 'cache hit' : 'miss'}, ${durationMs}ms`,
    topSources,
    cacheHit,
    durationMs,
  };

  try {
    await redis.setex(cacheKey, TTL_CARD_TRACE_SECS, JSON.stringify(card));
  } catch { /* non-fatal */ }

  return card;
}

// ── compressResearchToCard ────────────────────────────────────────────────────

/**
 * Build a compact ResearchCard from a deep-research result.
 * Cached by sha256(question) so repeated look-ups are instant.
 */
export async function compressResearchToCard(
  question: string,
  summary:  string,
  sources:  string[] = [],
  opts: { confidence?: number; recommendedAction?: string } = {},
): Promise<ResearchCard> {
  const redis    = getRedis();
  const hash     = sha256(question);
  const cacheKey = `kv:card:research:${hash}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as ResearchCard;
  } catch { /* miss */ }

  const card: ResearchCard = {
    stableKey:         `research:${hash}`,
    question:          question.slice(0, 200),
    oneLineSummary:    await compressChunkToSentence(summary),
    sources:           sources.slice(0, 5),
    recommendedAction: opts.recommendedAction ?? '',
    confidence:        opts.confidence ?? 0.7,
  };

  try {
    await redis.setex(cacheKey, TTL_CARD_RESEARCH_SECS, JSON.stringify(card));
  } catch { /* non-fatal */ }

  return card;
}

// ── buildAttentionToc ─────────────────────────────────────────────────────────

/**
 * Build the Level-3 table-of-contents for a task.
 *
 * The TOC tells Gemma4 what exists and which tools to call first —
 * it does NOT include raw file content.
 */
export async function buildAttentionToc(
  taskId:       string,
  hotFiles:     string[] = [],
  hotSymbols:   string[] = [],
  blockedAreas: string[] = [],
): Promise<AttentionToc> {
  const redis    = getRedis();
  const cacheKey = `kv:toc:task:${taskId}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as AttentionToc;
  } catch { /* miss */ }

  const toc: AttentionToc = {
    hotFiles:   hotFiles.slice(0, 8),
    hotSymbols: hotSymbols.slice(0, 12),
    hotTools: [
      'search.hybrid',
      'trace.kag_search',
      'graph.expand_neighborhood',
      'context.get_compressed_card',
      'context.build_kv_packet',
    ],
    blockedAreas,
    nextToolSuggestions: [
      'context.get_compressed_card — expand a hot file into full compressed card',
      'search.hybrid — find structurally related files',
      'trace.kag_search — retrieve retrieval pipeline context',
    ],
  };

  try {
    await redis.setex(cacheKey, TTL_TOC_SECS, JSON.stringify(toc));
  } catch { /* non-fatal */ }

  return toc;
}
