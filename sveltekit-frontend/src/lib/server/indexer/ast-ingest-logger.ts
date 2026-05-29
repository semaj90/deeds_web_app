/**
 * AST Ingest Logger
 *
 * Observability for the full GPU indexing pipeline:
 *   ast_parse  → ts-morph chunked a file (kind breakdown, chunk count, duration)
 *   embed_index → dual-embedder persisted a chunk to Qdrant (latency, cache hit, skipped)
 *   rag_hit    → rerankChunks() returned results (query, top-k, scores, cluster, latency)
 *
 * Salvaged patterns from:
 *   deeds_labs/services/python-middleware/backend/pipeline/code_ingestion_pipeline.ts
 *     → PipelineMetrics shape (filesProcessed, totalChunks, embeddingsGenerated, errors, timing)
 *   deeds_labs/services/development-tools/ast-analysis/lib-ast/ast-processor.ts
 *     → ASTNode interface (id, kind, symbol, start/end)
 *   deeds_labs/services/python-middleware/backend/services/embedding_sse_broadcaster.ts
 *     → stats tracking, per-client SSE broadcast pattern
 *
 * Bifrost + 4D Topology wiring (added April 21, 2026):
 *   Every rag_hit is persisted to Redis under two keys:
 *     rag:hit:{sha8}          → JSON blob (2h TTL) — Bifrost L1/L2 semantic cache reads this
 *     hg:rag_hits             → ZSET (score = hit timestamp ms) — hypergraph-4d queries this
 *                               for ACE_CONTEXT edge building and addressHyperedges() 4D lookups
 *
 * Design:
 *  - In-memory circular buffer (no Redis/DB dep — zero overhead on the hot path)
 *  - Three typed event rings: ast_parse, embed_index, rag_hit (each capped at MAX_ENTRIES)
 *  - Aggregate stats recomputed lazily on GET
 *  - Thread-safe: Node.js single-threaded, plain arrays/Maps are fine
 */

// ── Buffer config ────────────────────────────────────────────────────────────

const MAX_ENTRIES = 2_000; // per ring

// ── Event interfaces ─────────────────────────────────────────────────────────

/** Emitted once per file that ts-morph/AST-chunker processes */
export interface AstParseEvent {
  type: 'ast_parse';
  ts: number;
  filePath: string;
  relativePath: string;
  chunkCount: number;
  /** how many chunks of each kind were emitted */
  kindBreakdown: Record<string, number>;
  durationMs: number;
  skipped: boolean;
  error?: string;
}

/** Emitted once per indexChunks() / indexChunksIncremental() call */
export interface EmbedIndexEvent {
  type: 'embed_index';
  ts: number;
  /** 'incremental' skips Qdrant-existing chunks; 'full' re-embeds everything */
  mode: 'incremental' | 'full';
  /** Relative path of first chunk — gives a file hint for logs */
  samplePath: string;
  chunksProcessed: number;
  /** Chunks already in Qdrant that were skipped (incremental only) */
  skippedExisting: number;
  /** Chunks skipped because their path matched an exclusion pattern (e.g. .venv/, site-packages/) */
  skippedIgnored?: number;
  embeddingsGenerated: number;
  storedInQdrant: number;
  failed: number;
  durationMs: number;
  error?: string;
}

/** Emitted once per rerankChunks() call */
export interface RagHitEvent {
  type: 'rag_hit';
  ts: number;
  query: string;
  /** Top-3 results — no need to store more for debugging */
  topHits: Array<{
    relativePath: string;
    symbol: string;
    score: number;
    gpuCluster: number | null;
    somCluster: number | null;
    kind: string;
    qdrantId?: string | number;
  }>;
  returned: number;
  vectorLanes: ('content' | 'signature' | 'error')[];
  embedMs: number;
  searchMs: number;
  totalMs: number;
  /** caller context — from fix-recommender, claude-assist, etc. */
  caller?: string;
  // Enrichment for 4D topology / Bifrost cache
  repoId?: string;
  relativePaths?: string[];
  qdrantIds?: string[];
  gpuClusters?: number[];
  somClusters?: number[];
  semanticTags?: string[];
  graphRegions?: string[];
  hyperEdges?: string[];
  language?: string | null;
  metadata?: Record<string, unknown>;
}

export type IngestLogEvent = AstParseEvent | EmbedIndexEvent | RagHitEvent;

// ── Aggregate stats (recomputed on read) ────────────────────────────────────

export interface IngestLogStats {
  astParse: {
    total: number;
    skipped: number;
    errors: number;
    totalChunks: number;
    avgDurationMs: number;
    kindCounts: Record<string, number>;
  };
  embedIndex: {
    total: number;
    full: number;
    incremental: number;
    skippedExisting: number;
    errors: number;
    qdrantUpserted: number;
    avgDurationMs: number;
  };
  ragHit: {
    total: number;
    avgTotalMs: number;
    avgEmbedMs: number;
    avgSearchMs: number;
    topCallers: Record<string, number>;
    topClusters: Record<string, number>;
  };
  window: {
    oldestTs: number | null;
    newestTs: number | null;
    bufferCapacity: number;
  };
}

// ── Circular buffer ──────────────────────────────────────────────────────────

class Ring<T> {
  private buf: T[] = [];
  private _dropped = 0;

  constructor(private readonly cap: number) {}

  push(entry: T): void {
    if (this.buf.length >= this.cap) {
      this.buf.shift();
      this._dropped++;
    }
    this.buf.push(entry);
  }

  all(): readonly T[] {
    return this.buf;
  }

  get size(): number {
    return this.buf.length;
  }

  get dropped(): number {
    return this._dropped;
  }

  clear(): void {
    this.buf = [];
    this._dropped = 0;
  }
}

// ── Logger singleton ─────────────────────────────────────────────────────────

class AstIngestLogger {
  private parseRing = new Ring<AstParseEvent>(MAX_ENTRIES);
  private embedRing = new Ring<EmbedIndexEvent>(MAX_ENTRIES);
  private ragRing   = new Ring<RagHitEvent>(MAX_ENTRIES);

  // ── Writers ──

  logAstParse(event: Omit<AstParseEvent, 'type' | 'ts'>): void {
    this.parseRing.push({ type: 'ast_parse', ts: Date.now(), ...event });
  }

  logEmbedIndex(event: Omit<EmbedIndexEvent, 'type' | 'ts'>): void {
    this.embedRing.push({ type: 'embed_index', ts: Date.now(), ...event });
  }

  logRagHit(event: Omit<RagHitEvent, 'type' | 'ts'>): void {
    this.ragRing.push({ type: 'rag_hit', ts: Date.now(), ...event });
  }

  // ── Readers ──

  getAstParseLog(limit = 200): readonly AstParseEvent[] {
    const all = this.parseRing.all();
    return limit >= all.length ? all : all.slice(all.length - limit);
  }

  getEmbedIndexLog(limit = 200): readonly EmbedIndexEvent[] {
    const all = this.embedRing.all();
    return limit >= all.length ? all : all.slice(all.length - limit);
  }

  getRagHitLog(limit = 200): readonly RagHitEvent[] {
    const all = this.ragRing.all();
    return limit >= all.length ? all : all.slice(all.length - limit);
  }

  /** Combined tail of all three rings, sorted newest-first */
  getTail(limit = 100): IngestLogEvent[] {
    const combined: IngestLogEvent[] = [
      ...this.parseRing.all(),
      ...this.embedRing.all(),
      ...this.ragRing.all(),
    ];
    combined.sort((a, b) => b.ts - a.ts);
    return combined.slice(0, limit);
  }

  getStats(): IngestLogStats {
    // ── ast_parse stats ──
    const parses = this.parseRing.all();
    const kindCounts: Record<string, number> = {};
    let parseTotalDuration = 0;
    let parseTotalChunks = 0;
    let parseErrors = 0;
    let parseSkipped = 0;
    for (const e of parses) {
      if (e.skipped) parseSkipped++;
      if (e.error) parseErrors++;
      parseTotalDuration += e.durationMs;
      parseTotalChunks += e.chunkCount;
      for (const [kind, count] of Object.entries(e.kindBreakdown)) {
        kindCounts[kind] = (kindCounts[kind] ?? 0) + count;
      }
    }

    // ── embed_index stats ──
    const embeds = this.embedRing.all();
    let embedFull = 0, embedIncremental = 0, embedErrors = 0;
    let embedUpserted = 0, embedSkipped = 0, embedTotalDuration = 0;
    for (const e of embeds) {
      if (e.mode === 'full')        embedFull++;
      if (e.mode === 'incremental') embedIncremental++;
      if (e.error) embedErrors++;
      embedUpserted      += e.storedInQdrant;
      embedSkipped       += e.skippedExisting;
      embedTotalDuration += e.durationMs;
    }

    // ── rag_hit stats ──
    const rags = this.ragRing.all();
    let ragTotalMs = 0, ragEmbedMs = 0, ragSearchMs = 0;
    const callerCounts: Record<string, number> = {};
    const clusterCounts: Record<string, number> = {};
    for (const e of rags) {
      ragTotalMs  += e.totalMs;
      ragEmbedMs  += e.embedMs;
      ragSearchMs += e.searchMs;
      const caller = e.caller ?? 'unknown';
      callerCounts[caller] = (callerCounts[caller] ?? 0) + 1;
      for (const h of e.topHits) {
        if (h.gpuCluster != null) {
          const k = `cluster_${h.gpuCluster}`;
          clusterCounts[k] = (clusterCounts[k] ?? 0) + 1;
        }
      }
    }

    const allTs = [
      parses[0]?.ts, parses.at(-1)?.ts,
      embeds[0]?.ts, embeds.at(-1)?.ts,
      rags[0]?.ts,   rags.at(-1)?.ts,
    ].filter((t): t is number => t != null);

    return {
      astParse: {
        total: parses.length,
        skipped: parseSkipped,
        errors: parseErrors,
        totalChunks: parseTotalChunks,
        avgDurationMs: parses.length > 0 ? Math.round(parseTotalDuration / parses.length) : 0,
        kindCounts,
      },
      embedIndex: {
        total: embeds.length,
        full: embedFull,
        incremental: embedIncremental,
        skippedExisting: embedSkipped,
        errors: embedErrors,
        qdrantUpserted: embedUpserted,
        avgDurationMs: embeds.length > 0 ? Math.round(embedTotalDuration / embeds.length) : 0,
      },
      ragHit: {
        total: rags.length,
        avgTotalMs:  rags.length > 0 ? Math.round(ragTotalMs  / rags.length) : 0,
        avgEmbedMs:  rags.length > 0 ? Math.round(ragEmbedMs  / rags.length) : 0,
        avgSearchMs: rags.length > 0 ? Math.round(ragSearchMs / rags.length) : 0,
        topCallers:  callerCounts,
        topClusters: clusterCounts,
      },
      window: {
        oldestTs: allTs.length > 0 ? Math.min(...allTs) : null,
        newestTs: allTs.length > 0 ? Math.max(...allTs) : null,
        bufferCapacity: MAX_ENTRIES,
      },
    };
  }

  clearAll(): void {
    this.parseRing.clear();
    this.embedRing.clear();
    this.ragRing.clear();
  }

  clearType(type: IngestLogEvent['type']): void {
    if (type === 'ast_parse')   this.parseRing.clear();
    if (type === 'embed_index') this.embedRing.clear();
    if (type === 'rag_hit')     this.ragRing.clear();
  }
}

// Exported singleton — shared across all server imports within a process
export const ingestLogger = new AstIngestLogger();

// Convenience re-exports so callers don't need to access the singleton directly
export const logAstParse   = (e: Omit<AstParseEvent,   'type' | 'ts'>) => ingestLogger.logAstParse(e);
export const logEmbedIndex = (e: Omit<EmbedIndexEvent, 'type' | 'ts'>) => ingestLogger.logEmbedIndex(e);
export const logRagHit     = (e: Omit<RagHitEvent,     'type' | 'ts'>) => ingestLogger.logRagHit(e);

// ── Bifrost + 4D Topology persistence ────────────────────────────────────────
//
// Every rag_hit is written to Redis so that:
//   1. Bifrost semantic cache (L2) can associate this retrieval context with
//      future similar queries — avoids re-running the dual-vector search
//   2. hypergraph-4d.ts can build ACE_CONTEXT hyperedges from recent hit clusters
//      via hg:rag_hits ZSET (ZRANGEBYSCORE by time window)
//
// Both writes are fire-and-forget (never block the request path).

const RAG_HIT_TTL = 2 * 60 * 60;           // 2h — matches Bifrost L1 TTL
const HG_RAG_HITS_KEY = 'hg:rag_hits';     // ZSET used by hypergraph-4d ACE_CONTEXT builder
const HG_RAG_HITS_TTL = 6 * 60 * 60;       // 6h window — wide enough for a build cycle

/** FNV-1a 32-bit hash (8 hex chars) — fast enough for key generation without crypto overhead */
function fnv1a8(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (Math.imul(h, 0x01000193) >>> 0);
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Persist a rag_hit event to Redis.
 * - `rag:hit:{sha8}` → JSON blob for Bifrost L1/L2 semantic cache reads
 * - `hg:rag_hits` ZSET → member=sha8, score=ts_ms for 4D topology builder
 *
 * Fire-and-forget: called inside logRagHit, errors swallowed silently.
 */
async function persistHitToTopology(event: RagHitEvent): Promise<void> {
  // Lazy-import to avoid circular deps and keep logger boot cost zero
  const { getRedis } = await import('$lib/server/redis.js');
  const redis = getRedis();

  const sha = fnv1a8(`${event.query}:${event.ts}`);
  const key = `rag:hit:${sha}`;

  // Write the hit blob (Bifrost reads this for semantic context enrichment)
  const blob = JSON.stringify({
    query:    event.query,
    topHits:  event.topHits,
    caller:   event.caller ?? 'unknown',
    ts:       event.ts,
    totalMs:  event.totalMs,
    vectorLanes: event.vectorLanes,
    repoId:   event.repoId,
    relativePaths: event.relativePaths,
    qdrantIds: event.qdrantIds,
    gpuClusters: event.gpuClusters,
    somClusters: event.somClusters,
    semanticTags: event.semanticTags,
    graphRegions: event.graphRegions,
    hyperEdges: event.hyperEdges,
    language: event.language,
    metadata: event.metadata,
  });
  await redis.set(key, blob, 'EX', RAG_HIT_TTL);

  // Add to the hypergraph ZSET (score = ms timestamp for time-window queries)
  await redis.zadd(HG_RAG_HITS_KEY, event.ts, sha);
  // Trim to last 6h to keep ZSET bounded (2000 entries max at ~1 hit/10s)
  await redis.zremrangebyscore(HG_RAG_HITS_KEY, 0, event.ts - HG_RAG_HITS_TTL * 1_000);
  // Refresh ZSET TTL
  await redis.expire(HG_RAG_HITS_KEY, HG_RAG_HITS_TTL);
}

/**
 * logRagHitWithTopology — drop-in replacement for logRagHit.
 * Writes to the in-memory ring AND fire-and-forgets the Redis/4D topology persistence.
 * Constructs the stamped event locally so there is no ring read-back race.
 */
export function logRagHitWithTopology(e: Omit<RagHitEvent, 'type' | 'ts'>): void {
  const event: RagHitEvent = { type: 'rag_hit', ts: Date.now(), ...e };
  ingestLogger.logRagHit(e);
  persistHitToTopology(event).catch(() => {});
}
