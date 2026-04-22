/**
 * Agentic Deep-Research Web Search Indexer
 *
 * Stage 10 of the codebase orchestration pipeline.
 *
 * Uses codebase cluster summaries as search-query seeds:
 *   1. Load all 20 cluster summaries from `cluster_summaries` table
 *   2. For each cluster, build a focused search query from purpose + top patterns
 *   3. Call webSearch() (SearXNG → Google → DuckDuckGo fallback)
 *   4. Fetch full page content with HTML stripping
 *   5. Embed via embeddinggemma (768-dim)
 *   6. Upsert into `web_search_index` table (dedup on content_hash)
 *   7. Mirror to Qdrant `knowledge_base` collection for RAG
 *
 * Non-fatal: each sub-step degrades gracefully so a single 404 or slow page
 * never aborts the entire pipeline run.
 */
import { createHash } from 'node:crypto';
import { db } from '$lib/server/db/client';
import { webSearchIndex } from '$lib/server/db/schema-postgres.js';
import { sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import { webSearch } from '$lib/server/retrieval/web-search.js';
import { generateSingleEmbedding } from '$lib/server/grpc/embedding-client.js';
import { JSDOM } from 'jsdom';

const QDRANT_URL = ENV.QDRANT_URL ?? 'http://localhost:6333';
const KNOWLEDGE_COLLECTION = 'knowledge_base';
const PAGE_FETCH_TIMEOUT = 12_000; // ms
const MAX_CONTENT_CHARS = 8_000;   // truncate long pages before embedding
const RESULTS_PER_QUERY = 5;

// ── Types ────────────────────────────────────────────────────────────────────

export interface DeepResearchOptions {
  /** Orchestrator run_id for tracking */
  runId?: string;
  /** Max GPU clusters to process (default: all) */
  maxClusters?: number;
  /** Number of web results per cluster query (default: 5) */
  resultsPerQuery?: number;
  /** Skip Qdrant mirror (DB only) */
  skipQdrant?: boolean;
  /** Recursive depth (default: 1, max: 2) */
  maxDepth?: number;
  /** Progress callback (optional) */
  onProgress?: (msg: string) => void;
}

export interface DeepResearchResult {
  queriesRun: number;
  pagesIndexed: number;
  pagesSkipped: number;
  pagesFailed: number;
  rowsInserted: number;
  rowsUpdated: number;
  durationMs: number;
}

interface ClusterSummaryRow {
  gpu_cluster: number;
  purpose: string;
  patterns: string[] | string | null;
  warnings: string[] | string | null;
  tags: string[] | string | null;
}

// ── HTML stripping ───────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ── Page fetcher ─────────────────────────────────────────────────────────────

async function fetchPageContent(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(PAGE_FETCH_TIMEOUT),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LegalAI-Research-Bot/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('html') && !contentType.includes('text')) return null;

    const html = await res.text();
    return stripHtml(html).slice(0, MAX_CONTENT_CHARS);
  } catch {
    return null;
  }
}

// ── Qdrant mirror ─────────────────────────────────────────────────────────────

async function mirrorToQdrant(
  pointId: number,
  embedding: number[],
  payload: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`${QDRANT_URL}/collections/${KNOWLEDGE_COLLECTION}/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      points: [{ id: pointId, vector: embedding, payload }],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Qdrant PUT ${res.status}`);
}

// Safely parse a value that may be a JS array, a JSON string, or a raw PG
// array literal like {"a","b"} into a JS string[].
function toStringArray(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v as string[];
  const s = String(v).trim();
  // PostgreSQL array literal: {"a","b"} or {a,b}
  if (s.startsWith('{') && s.endsWith('}')) {
    const inner = s.slice(1, -1);
    if (!inner) return [];
    // Split on commas not inside quotes
    return (
      inner
        .match(/"[^"]*"|[^,]+/g)
        ?.map((t) => t.replace(/^"|"$/g, '').trim())
        .filter(Boolean) ?? []
    );
  }
  // JSON array string
  if (s.startsWith('[')) {
    try {
      return JSON.parse(s) as string[];
    } catch {
      return [];
    }
  }
  return [s];
}

// ── Stable integer ID from content hash ──────────────────────────────────────

function hashToQdrantId(contentHash: string): number {
  const hex = createHash('md5').update(contentHash).digest('hex').slice(0, 8);
  return parseInt(hex, 16) >>> 0; // unsigned 32-bit integer
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export async function runDeepResearchIndex(
  opts: DeepResearchOptions = {}
): Promise<DeepResearchResult> {
  const startedAt = Date.now();
  const log = opts.onProgress ?? (() => {});
  const maxClusters = opts.maxClusters ?? 20;
  const resultsPerQuery = opts.resultsPerQuery ?? RESULTS_PER_QUERY;
  const runId = opts.runId ?? `dr-${Date.now()}`;

  let queriesRun = 0;
  let pagesIndexed = 0;
  let pagesSkipped = 0;
  let pagesFailed = 0;
  let rowsInserted = 0;
  let rowsUpdated = 0;

  // ── 1. Load cluster summaries ──────────────────────────────────────────────
  log('[deep-research] Loading cluster summaries…');
  let clusters: ClusterSummaryRow[] = [];
  try {
    const rows = await db.execute(sql`
      SELECT gpu_cluster, purpose, patterns, warnings, tags
      FROM cluster_summaries
      ORDER BY gpu_cluster
      LIMIT ${sql.raw(String(maxClusters))}
    `);
    const rowData = Array.isArray((rows as unknown as { rows?: unknown[] }).rows)
      ? (rows as unknown as { rows: ClusterSummaryRow[] }).rows
      : (rows as unknown as ClusterSummaryRow[]);
    clusters = rowData ?? [];
  } catch (err) {
    log(`[deep-research] Failed to load cluster summaries: ${(err as Error).message}`);
    return {
      queriesRun,
      pagesIndexed,
      pagesSkipped,
      pagesFailed,
      rowsInserted,
      rowsUpdated,
      durationMs: Date.now() - startedAt,
    };
  }

  if (clusters.length === 0) {
    log('[deep-research] No cluster summaries found — run cluster summarization first');
    return {
      queriesRun,
      pagesIndexed,
      pagesSkipped,
      pagesFailed,
      rowsInserted,
      rowsUpdated,
      durationMs: Date.now() - startedAt,
    };
  }

  log(`[deep-research] Processing ${clusters.length} clusters…`);

  // ── 2. Process each cluster ────────────────────────────────────────────────
  for (const cluster of clusters) {
    // Build focused query from cluster knowledge (patterns only — tags are file paths)
    const purposeStr = (cluster.purpose ?? '').trim();
    const patterns = toStringArray(cluster.patterns).slice(0, 2);
    // Build a clean, readable query: purpose + top 2 patterns + language context
    const queryParts = [purposeStr, ...patterns].filter(Boolean);
    const query = `${queryParts.join(' ')} TypeScript SvelteKit`;

    log(`[deep-research] Cluster ${cluster.gpu_cluster}: "${query.slice(0, 80)}"`);

    // ── 3. Web search ────────────────────────────────────────────────────────
    let searchResults: Awaited<ReturnType<typeof webSearch>>['results'] = [];
    try {
      const searchResp = await webSearch(query, resultsPerQuery);
      searchResults = searchResp.results;
      queriesRun++;
    } catch (err) {
      log(
        `[deep-research] Search failed for cluster ${cluster.gpu_cluster}: ${(err as Error).message}`
      );
      queriesRun++;
      continue;
    }

    if (searchResults.length === 0) {
      log(`[deep-research] Cluster ${cluster.gpu_cluster}: no results`);
      continue;
    }

    // ── 4. Fetch, embed, persist each result ─────────────────────────────────
    for (const result of searchResults) {
      await processAndIndexUrl(
        result.url,
        result.title,
        result.source,
        query,
        cluster.gpu_cluster,
        1,
        opts
      );
    }

    log(
      `[deep-research] Cluster ${cluster.gpu_cluster} done: ${searchResults.length} results processed`
    );
  }

  // ── 5. Autonomous Sync (Chronicler) ────────────────────────────────────────
  try {
    log('[deep-research] Triggering autonomous maintenance cycle…');
    const { execSync } = await import('node:child_process');
    execSync('node scripts/maintain-repo.mjs');
  } catch (err) {
    log(`[deep-research] Maintenance failed: ${(err as Error).message}`);
  }

  /** Internal processor for individual URLs (recursive) */
  async function processAndIndexUrl(
    url: string,
    title: string,
    source: string,
    query: string,
    clusterId: number,
    depth: number,
    opts: DeepResearchOptions
  ): Promise<void> {
    const urlHash = createHash('sha256').update(url).digest('hex').slice(0, 16);
    const runId = opts.runId ?? `dr-${Date.now()}`;
    const maxDepth = opts.maxDepth ?? 1;

    // 1. Fetch
    let rawHtml = '';
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(PAGE_FETCH_TIMEOUT) });
      if (res.ok) rawHtml = await res.text();
    } catch {
      return;
    }

    if (!rawHtml) return;

    // 2. Parse & Extract
    const dom = new JSDOM(rawHtml);
    const doc = dom.window.document;
    const cleanText = stripHtml(rawHtml).slice(0, MAX_CONTENT_CHARS);

    if (cleanText.length < 50) return;

    // 3. Embed
    const textToEmbed = `${title}\n\n${cleanText.slice(0, 2000)}`;
    let embedding: number[] | null = null;
    try {
      const raw = await generateSingleEmbedding(textToEmbed);
      if (raw && raw.length === 768) embedding = Array.from(raw);
    } catch {}

    // 4. DB Upsert
    try {
      const snippet = cleanText.slice(0, 400);
      const rel = 0.6 + (depth === 1 ? 0.2 : 0); // Primary results rank higher

      await db
        .insert(webSearchIndex)
        .values({
          query,
          clusterId,
          url,
          title,
          content: cleanText,
          snippet,
          provider: source,
          contentHash: urlHash,
          relevanceScore: rel,
          runId,
          ...(embedding ? { embedding } : {}),
        })
        .onConflictDoUpdate({
          target: webSearchIndex.contentHash,
          set: {
            content: cleanText,
            snippet,
            relevanceScore: rel,
            runId,
            indexedAt: sql`now()`,
            ...(embedding ? { embedding: sql`${JSON.stringify(embedding)}::vector` } : {}),
          },
        });
      rowsInserted++;
      pagesIndexed++;
    } catch (err) {
      pagesFailed++;
      return;
    }

    // 5. Recursion (Depth 2)
    if (depth < maxDepth && depth < 2) {
      const links = Array.from(doc.querySelectorAll('a'))
        .map((a) => (a as HTMLAnchorElement).href)
        .filter(
          (href) =>
            href.startsWith('http') && !href.includes('google.com') && !href.includes('search')
        )
        .slice(0, 3); // Max 3 child links per page

      for (const link of links) {
        await processAndIndexUrl(
          link,
          `Child: ${title}`,
          source,
          query,
          clusterId,
          depth + 1,
          opts
        );
      }
    }
  }

  const durationMs = Date.now() - startedAt;
  log(
    `[deep-research] Complete — queries:${queriesRun} indexed:${pagesIndexed} inserted:${rowsInserted} updated:${rowsUpdated} failed:${pagesFailed} (${durationMs}ms)`
  );

  return {
    queriesRun,
    pagesIndexed,
    pagesSkipped,
    pagesFailed,
    rowsInserted,
    rowsUpdated,
    durationMs,
  };
}
