/**
 * Code-Path LLM-Output Index — Quick Redis hit-cache for ACE.
 *
 * Why this exists:
 *   - GlyphAtlas indexes at the *cluster* level (NxN MapReduce, hourly rebuild).
 *   - Bifrost L2 indexes at the *query* level (semantic vector match, 2-5s).
 *   - This module fills the gap: index at the *codebase path* level (file/dir),
 *     so ACE can recall the most recent successful LLM synthesis for a given
 *     path in <5ms — no embedding, no vector search, no rebuild.
 *
 * Keyspace (all under `code:llm_output:`):
 *   - `code:llm_output:path:<sha1>`     JSON entry (per-file or per-dir)        TTL 6h
 *   - `code:llm_output:hot`             ZSET (member=sha1, score=hitCount)      no TTL
 *   - `code:llm_output:recent`          ZSET (member=sha1, score=lastHitMs)     no TTL
 *   - `code:llm_output:by-cluster:<N>`  SET of sha1s belonging to cluster N    no TTL
 *
 * Path normalisation: paths are normalised to forward-slash and lowercase, then
 * sha1-hashed for fixed-length keys. The original path is stored in the JSON
 * entry so callers always see the canonical form.
 */

import { createHash }   from 'node:crypto';
import { getRedis }     from '$lib/server/redis.js';

// ── Constants ─────────────────────────────────────────────────────────────────

export const CODE_LLM_INDEX_VERSION = 'v2';
export const CODE_LLM_TTL_SECONDS   = 6 * 60 * 60; // 6h
export const CODE_LLM_PATH_PREFIX   = 'code:llm_output:path:';
export const CODE_LLM_HOT_KEY       = 'code:llm_output:hot';
export const CODE_LLM_RECENT_KEY    = 'code:llm_output:recent';
export const CODE_LLM_CLUSTER_PFX   = 'code:llm_output:by-cluster:';

// Qdrant semantic layer (path-keyed, 768-dim embeddinggemma)
export const CODE_LLM_QDRANT_COLLECTION = 'code_llm_outputs';
const QDRANT_URL  = process.env.QDRANT_URL  ?? 'http://127.0.0.1:6333';
const OLLAMA_URL  = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const EMBED_MODEL = process.env.EMBED_MODEL ?? 'embeddinggemma:latest';
const EMBED_BATCH_SIZE     = 16;
const EMBED_FLUSH_MS       = 500;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CodeLlmEntry {
  /** Canonical path (forward slashes, no leading ./) */
  path:           string;
  /** sha1 of normalised path — fixed-length Redis key suffix */
  pathHash:       string;
  /** True if path is a directory; false for individual files */
  isDir:          boolean;
  /** Most recent LLM synthesis output (Gemma4 summary, ACE answer, etc.) */
  llmOutput:      string;
  /** Optional: the user query that produced this output */
  query?:         string;
  /** Source pipeline that generated the output */
  source:         'ace' | 'gemma4-summary' | 'kag' | 'rag' | 'agent' | 'other';
  /** Cluster ID from glyph atlas — links into hypergraph layer */
  glyphClusterId?: number;
  /** Wall-clock when entry was created/refreshed */
  generatedAt:    string;
  /** Times this entry has been served from cache */
  hitCount:       number;
  /** Last time the entry was served (epoch ms) */
  lastHitMs:      number;
  /** Optional: token count of the cached llmOutput (for budget accounting) */
  tokenCount?:    number;
  /** True once the entry's embedding has been written to Qdrant */
  embedded?:      boolean;
}

export interface CodeLlmHitStats {
  totalEntries:   number;
  totalHits:      number;
  hottestPaths:   Array<{ path: string; hitCount: number }>;
  recentPaths:    Array<{ path: string; lastHitMs: number }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function normalisePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

export function hashPath(p: string): string {
  return createHash('sha1').update(normalisePath(p)).digest('hex').slice(0, 16);
}

function entryKey(pathHash: string): string {
  return `${CODE_LLM_PATH_PREFIX}${pathHash}`;
}

// ── Read API ──────────────────────────────────────────────────────────────────

/**
 * Look up a single path. Returns null on miss. Updates hot/recent ZSETs on hit
 * (so subsequent calls to hottestPaths() reflect access patterns).
 */
export async function getLlmOutputHit(p: string): Promise<CodeLlmEntry | null> {
  const redis = getRedis();
  const hash  = hashPath(p);
  const raw   = await redis.get(entryKey(hash)).catch(() => null);
  if (!raw) return null;

  let entry: CodeLlmEntry;
  try { entry = JSON.parse(raw); } catch { return null; }

  // Increment hit counters (fire-and-forget — we don't want to block the read)
  const now = Date.now();
  entry.hitCount  = (entry.hitCount ?? 0) + 1;
  entry.lastHitMs = now;

  void redis.pipeline()
    .set(entryKey(hash), JSON.stringify(entry), 'EX', CODE_LLM_TTL_SECONDS)
    .zincrby(CODE_LLM_HOT_KEY, 1, hash)
    .zadd(CODE_LLM_RECENT_KEY, now, hash)
    .exec()
    .catch(() => null);

  return entry;
}

/**
 * Bulk-lookup. Returns one entry per path (null on miss). Single MGET round-trip.
 * Does NOT increment hit counters (use getLlmOutputHit() one-by-one for that).
 */
export async function getLlmOutputHitsBulk(paths: string[]): Promise<Array<CodeLlmEntry | null>> {
  if (!paths.length) return [];
  const redis  = getRedis();
  const hashes = paths.map(hashPath);
  const keys   = hashes.map(entryKey);
  const raws   = await redis.mget(...keys).catch(() => [] as Array<string | null>);

  return raws.map((raw) => {
    if (!raw) return null;
    try { return JSON.parse(raw) as CodeLlmEntry; } catch { return null; }
  });
}

// ── Write API ─────────────────────────────────────────────────────────────────

export interface RecordOpts {
  query?:         string;
  source?:        CodeLlmEntry['source'];
  glyphClusterId?: number;
  tokenCount?:    number;
  isDir?:         boolean;
}

/**
 * Record (or refresh) an LLM output for a code path. Idempotent — overwrites
 * any existing entry for the same path.
 */
export async function recordLlmOutputHit(
  p:          string,
  llmOutput:  string,
  opts:       RecordOpts = {},
): Promise<CodeLlmEntry> {
  const redis = getRedis();
  const path  = normalisePath(p);
  const hash  = hashPath(path);
  const now   = Date.now();

  const existing = await redis.get(entryKey(hash)).catch(() => null);
  const prevHits = existing ? (() => {
    try { return (JSON.parse(existing) as CodeLlmEntry).hitCount ?? 0; }
    catch { return 0; }
  })() : 0;

  const entry: CodeLlmEntry = {
    path,
    pathHash:       hash,
    isDir:          opts.isDir ?? !path.includes('.'),
    llmOutput,
    query:          opts.query,
    source:         opts.source ?? 'ace',
    glyphClusterId: opts.glyphClusterId,
    generatedAt:    new Date(now).toISOString(),
    hitCount:       prevHits, // preserves count across refreshes
    lastHitMs:      now,
    tokenCount:     opts.tokenCount,
  };

  const pipe = redis.pipeline()
    .set(entryKey(hash), JSON.stringify(entry), 'EX', CODE_LLM_TTL_SECONDS)
    .zadd(CODE_LLM_RECENT_KEY, now, hash);

  if (opts.glyphClusterId !== undefined) {
    pipe.sadd(`${CODE_LLM_CLUSTER_PFX}${opts.glyphClusterId}`, hash);
  }

  await pipe.exec().catch(() => null);

  // Fire-and-forget: queue for batched embedding + Qdrant upsert
  enqueueEmbed({
    hash,
    path,
    text:           llmOutput,
    glyphClusterId: opts.glyphClusterId,
    source:         entry.source,
  });

  // Fire-and-forget: durable Postgres mirror via UPSERT.
  // Survives Redis flush; analytics queries hit the SQL table for cluster aggregations.
  void persistToPostgres(entry).catch((err) =>
    console.warn('[code-llm-index] Postgres mirror failed:', (err as Error)?.message ?? err)
  );

  return entry;
}

/**
 * UPSERT into code_llm_index Postgres table. Mirrors the Redis entry.
 * Increments refreshed_at on conflict; preserves the higher hit_count.
 */
async function persistToPostgres(entry: CodeLlmEntry): Promise<void> {
  try {
    const { db } = await import('$lib/server/db/client');
    const { codeLlmIndex } = await import('$lib/server/db/schema-postgres.js');
    const { sql } = await import('drizzle-orm');

    await db.insert(codeLlmIndex).values({
      pathHash:       entry.pathHash,
      path:           entry.path,
      isDir:          entry.isDir,
      llmOutput:      entry.llmOutput,
      source:         entry.source,
      query:          entry.query ?? null,
      glyphClusterId: entry.glyphClusterId ?? null,
      hitCount:       entry.hitCount,
      tokenCount:     entry.tokenCount ?? null,
      generatedAt:    new Date(entry.generatedAt),
      lastHitAt:      new Date(entry.lastHitMs),
    }).onConflictDoUpdate({
      target: codeLlmIndex.pathHash,
      set: {
        llmOutput:    entry.llmOutput,
        source:       entry.source,
        query:        entry.query ?? null,
        // Use SQL GREATEST so refreshed entries don't lose accumulated hits
        hitCount:     sql`GREATEST(${codeLlmIndex.hitCount}, ${entry.hitCount})`,
        tokenCount:   entry.tokenCount ?? null,
        lastHitAt:    new Date(entry.lastHitMs),
        refreshedAt:  sql`now()`,
      },
    });
  } catch {
    // DB unreachable or schema not migrated — Redis remains source of truth
  }
}

/**
 * Invalidate a single path's cached output. Returns true if removed.
 * Broadcasts a CHR-ROM SSE event so connected clients (graph viewer,
 * NES texture pipeline, GraphifyViewer cluster tiles) can drop their
 * tile cache for the affected path/cluster.
 */
export async function invalidateLlmOutput(p: string): Promise<boolean> {
  const redis = getRedis();
  const hash  = hashPath(p);
  const path  = normalisePath(p);

  // Read entry first so we know which cluster set to clean up
  const raw = await redis.get(entryKey(hash)).catch(() => null);
  let glyphClusterId: number | undefined;
  if (raw) {
    try { glyphClusterId = (JSON.parse(raw) as CodeLlmEntry).glyphClusterId; } catch {}
  }

  const removed = await redis.del(entryKey(hash)).catch(() => 0);
  if (removed) {
    const pipe = redis.pipeline()
      .zrem(CODE_LLM_HOT_KEY, hash)
      .zrem(CODE_LLM_RECENT_KEY, hash);
    if (glyphClusterId !== undefined) {
      pipe.srem(`${CODE_LLM_CLUSTER_PFX}${glyphClusterId}`, hash);
    }
    await pipe.exec().catch(() => null);

    // Fire-and-forget CHRROM broadcast — connected SSE clients receive
    // a state-pattern event so they can drop matching cluster tiles.
    void (async () => {
      try {
        const { broadcastPatterns } = await import('$lib/server/chrrom/bus.js');
        broadcastPatterns([{
          key:       `code-llm:invalidate:${hash}`,
          type:      'state',
          createdAt: new Date().toISOString(),
          ttlMs:     0,
          payload:   { event: 'invalidate', path, pathHash: hash, glyphClusterId },
        }]);
      } catch { /* bus optional */ }
    })();
  }
  return Boolean(removed);
}

// ── Stats / discovery ─────────────────────────────────────────────────────────

/**
 * Top-K hottest paths by hit count, with the original path resolved from the
 * cached entry (so we don't need a separate hash→path map).
 */
export async function getHottestPaths(limit = 20): Promise<Array<{ path: string; hitCount: number }>> {
  const redis = getRedis();
  const rows  = await redis.zrevrange(CODE_LLM_HOT_KEY, 0, limit - 1, 'WITHSCORES').catch(() => [] as string[]);
  if (!rows.length) return [];

  const out: Array<{ path: string; hitCount: number }> = [];
  for (let i = 0; i < rows.length; i += 2) {
    const hash  = rows[i];
    const score = Number(rows[i + 1]);
    const raw   = await redis.get(entryKey(hash)).catch(() => null);
    if (!raw) continue;
    try {
      const entry = JSON.parse(raw) as CodeLlmEntry;
      out.push({ path: entry.path, hitCount: score });
    } catch {/* skip malformed */}
  }
  return out;
}

export async function getLlmIndexStats(): Promise<CodeLlmHitStats> {
  const redis = getRedis();

  const [hottest, recent, totalHits] = await Promise.all([
    getHottestPaths(10),
    (async (): Promise<Array<{ path: string; lastHitMs: number }>> => {
      const rows = await redis.zrevrange(CODE_LLM_RECENT_KEY, 0, 9, 'WITHSCORES').catch(() => [] as string[]);
      const out: Array<{ path: string; lastHitMs: number }> = [];
      for (let i = 0; i < rows.length; i += 2) {
        const raw = await redis.get(entryKey(rows[i])).catch(() => null);
        if (!raw) continue;
        try {
          const entry = JSON.parse(raw) as CodeLlmEntry;
          out.push({ path: entry.path, lastHitMs: Number(rows[i + 1]) });
        } catch {/* skip */}
      }
      return out;
    })(),
    redis.zrange(CODE_LLM_HOT_KEY, 0, -1, 'WITHSCORES').then((rows: string[]) => {
      let sum = 0;
      for (let i = 1; i < rows.length; i += 2) sum += Number(rows[i]);
      return sum;
    }).catch(() => 0),
  ]);

  const totalEntries = await redis.zcard(CODE_LLM_HOT_KEY).catch(() => 0);

  return {
    totalEntries,
    totalHits,
    hottestPaths: hottest,
    recentPaths:  recent,
  };
}

/**
 * Aggregate per-cluster hit counts. Scans `code:llm_output:by-cluster:*` SETs
 * and returns `{ clusterId: pathCount }` — used by GraphifyViewer to tint
 * cluster tiles by LLM-output density.
 */
export async function getClusterHitDensity(): Promise<Record<number, number>> {
  const redis = getRedis();
  const keys  = await redis.keys(`${CODE_LLM_CLUSTER_PFX}*`).catch(() => [] as string[]);
  if (!keys.length) return {};

  const counts = await Promise.all(
    keys.map((k) => redis.scard(k).catch(() => 0)),
  );

  const out: Record<number, number> = {};
  for (let i = 0; i < keys.length; i++) {
    const id = Number(keys[i].slice(CODE_LLM_CLUSTER_PFX.length));
    if (Number.isFinite(id) && counts[i] > 0) out[id] = counts[i];
  }
  return out;
}

/**
 * All cached paths belonging to a glyph cluster — for ACE community-context
 * preambles. Bulk-loads the entries in a single MGET.
 */
export async function getCachedPathsForCluster(clusterId: number): Promise<CodeLlmEntry[]> {
  const redis  = getRedis();
  const hashes = await redis.smembers(`${CODE_LLM_CLUSTER_PFX}${clusterId}`).catch(() => [] as string[]);
  if (!hashes.length) return [];

  const keys = hashes.map(entryKey);
  const raws = await redis.mget(...keys).catch(() => [] as Array<string | null>);

  const out: CodeLlmEntry[] = [];
  for (const raw of raws) {
    if (!raw) continue;
    try { out.push(JSON.parse(raw) as CodeLlmEntry); } catch {/* skip */}
  }
  return out;
}

// ── Semantic layer (Qdrant + embeddinggemma, batched) ─────────────────────────

interface PendingEmbed {
  hash:           string;
  path:           string;
  text:           string;
  glyphClusterId?: number;
  source:         CodeLlmEntry['source'];
}

const embedQueue: PendingEmbed[] = [];
let flushTimer: NodeJS.Timeout | null = null;
let collectionEnsured = false;

async function ensureQdrantCollection(): Promise<boolean> {
  if (collectionEnsured) return true;
  try {
    const probe = await fetch(`${QDRANT_URL}/collections/${CODE_LLM_QDRANT_COLLECTION}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (probe.ok) { collectionEnsured = true; return true; }
    const create = await fetch(`${QDRANT_URL}/collections/${CODE_LLM_QDRANT_COLLECTION}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: { size: 768, distance: 'Cosine' },
        hnsw_config: { m: 16, ef_construct: 64 },
      }),
      signal: AbortSignal.timeout(8000),
    });
    collectionEnsured = create.ok;
    return create.ok;
  } catch { return false; }
}

async function embedBatch(texts: string[]): Promise<Array<number[] | null>> {
  return Promise.all(texts.map(async (t) => {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBED_MODEL, prompt: t.slice(0, 8000) }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return null;
      const d = await res.json();
      return Array.isArray(d.embedding) && d.embedding.length === 768 ? d.embedding : null;
    } catch { return null; }
  }));
}

function pathHashToPointId(hash: string): number {
  // 16 hex chars → 64-bit, but Qdrant id is u64; we only use 53 bits to stay safe in JSON
  return parseInt(hash.slice(0, 13), 16);
}

async function flushEmbedQueue(): Promise<void> {
  flushTimer = null;
  if (!embedQueue.length) return;

  const batch = embedQueue.splice(0, EMBED_BATCH_SIZE);
  const ok = await ensureQdrantCollection();
  if (!ok) return;

  const vectors = await embedBatch(batch.map((b) => b.text));
  const points: Array<{ id: number; vector: number[]; payload: Record<string, unknown> }> = [];
  const redis = getRedis();

  for (let i = 0; i < batch.length; i++) {
    const v = vectors[i];
    if (!v) continue;
    const b = batch[i];
    points.push({
      id:      pathHashToPointId(b.hash),
      vector:  v,
      payload: {
        path:           b.path,
        pathHash:       b.hash,
        source:         b.source,
        glyphClusterId: b.glyphClusterId ?? -1,
        textPreview:    b.text.slice(0, 200),
        embeddedAt:     new Date().toISOString(),
      },
    });

    void redis.get(entryKey(b.hash)).then(async (raw) => {
      if (!raw) return;
      try {
        const entry = JSON.parse(raw) as CodeLlmEntry;
        entry.embedded = true;
        await redis.set(entryKey(b.hash), JSON.stringify(entry), 'EX', CODE_LLM_TTL_SECONDS);
      } catch { /* skip */ }
    }).catch(() => null);
  }

  if (!points.length) return;

  try {
    await fetch(`${QDRANT_URL}/collections/${CODE_LLM_QDRANT_COLLECTION}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch { /* fire-and-forget */ }

  if (embedQueue.length) scheduleFlush();
}

function scheduleFlush(): void {
  if (flushTimer) return;
  if (embedQueue.length >= EMBED_BATCH_SIZE) {
    void flushEmbedQueue();
    return;
  }
  flushTimer = setTimeout(() => { void flushEmbedQueue(); }, EMBED_FLUSH_MS);
}

/**
 * Enqueue an entry for batched embedding + Qdrant upsert.
 * Fire-and-forget — never throws, never blocks the caller.
 */
export function enqueueEmbed(p: PendingEmbed): void {
  embedQueue.push(p);
  scheduleFlush();
}

/**
 * Semantic search across cached LLM outputs by query text.
 * Embeds query, searches Qdrant, returns top-K matching entries.
 */
export async function searchLlmOutputsBySimilarity(
  query: string,
  limit = 10,
): Promise<Array<{ entry: CodeLlmEntry; score: number }>> {
  const ok = await ensureQdrantCollection();
  if (!ok) return [];

  const [vec] = await embedBatch([query]);
  if (!vec) return [];

  let hits: Array<{ id: number; score: number; payload: { path?: string; pathHash?: string } }> = [];
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${CODE_LLM_QDRANT_COLLECTION}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vector: vec, limit, with_payload: true }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const d = await res.json();
    hits = d.result ?? [];
  } catch { return []; }

  if (!hits.length) return [];

  const redis = getRedis();
  const keys  = hits.map((h) => entryKey(h.payload.pathHash ?? '')).filter(Boolean);
  const raws  = await redis.mget(...keys).catch(() => [] as Array<string | null>);

  const out: Array<{ entry: CodeLlmEntry; score: number }> = [];
  for (let i = 0; i < hits.length; i++) {
    const raw = raws[i];
    if (!raw) continue;
    try { out.push({ entry: JSON.parse(raw) as CodeLlmEntry, score: hits[i].score }); } catch {/* skip */}
  }
  return out;
}