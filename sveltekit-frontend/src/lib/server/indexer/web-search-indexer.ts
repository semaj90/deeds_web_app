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
  patterns: string[];
  warnings: string[];
  tags: string[];
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
        'Accept': 'text/html,application/xhtml+xml',
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
  payload: Record<string, unknown>,
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

// ── Stable integer ID from content hash ──────────────────────────────────────

function hashToQdrantId(contentHash: string): number {
  const hex = createHash('md5').update(contentHash).digest('hex').slice(0, 8);
  return parseInt(hex, 16) >>> 0; // unsigned 32-bit integer
}

// ── Main pipeline ─────────────────────────────────────────────────────────────

export async function runDeepResearchIndex(
  opts: DeepResearchOptions = {},
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
      LIMIT ${maxClusters}
    `);
    const rowData = Array.isArray((rows as unknown as { rows?: unknown[] }).rows)
      ? ((rows as unknown as { rows: ClusterSummaryRow[] }).rows)
      : (rows as unknown as ClusterSummaryRow[]);
    clusters = rowData ?? [];
  } catch (err) {
    log(`[deep-research] Failed to load cluster summaries: ${(err as Error).message}`);
    return { queriesRun, pagesIndexed, pagesSkipped, pagesFailed, rowsInserted, rowsUpdated, durationMs: Date.now() - startedAt };
  }

  if (clusters.length === 0) {
    log('[deep-research] No cluster summaries found — run cluster summarization first');
    return { queriesRun, pagesIndexed, pagesSkipped, pagesFailed, rowsInserted, rowsUpdated, durationMs: Date.now() - startedAt };
  }

  log(`[deep-research] Processing ${clusters.length} clusters…`);

  // ── 2. Process each cluster ────────────────────────────────────────────────
  for (const cluster of clusters) {
    const clusterId = cluster.gpu_cluster;

    // Build focused query from cluster knowledge
    const queryParts = [cluster.purpose];
    const topPatterns = (cluster.patterns ?? []).slice(0, 2);
    if (topPatterns.length) queryParts.push(topPatterns.join(' '));
    const topTags = (cluster.tags ?? []).slice(0, 2);
    if (topTags.length) queryParts.push(topTags.join(' '));
    const query = `${queryParts.join(' ')} TypeScript SvelteKit site:github.com OR site:docs.rs OR site:dev.to`;

    log(`[deep-research] Cluster ${clusterId}: "${query.slice(0, 80)}…"`);

    // ── 3. Web search ────────────────────────────────────────────────────────
    let searchResults: Awaited<ReturnType<typeof webSearch>>['results'] = [];
    try {
      const searchResp = await webSearch(query, resultsPerQuery);
      searchResults = searchResp.results;
      queriesRun++;
    } catch (err) {
      log(`[deep-research] Search failed for cluster ${clusterId}: ${(err as Error).message}`);
      queriesRun++;
      continue;
    }

    if (searchResults.length === 0) {
      log(`[deep-research] Cluster ${clusterId}: no results`);
      continue;
    }

    // ── 4. Fetch, embed, persist each result ─────────────────────────────────
    for (const result of searchResults) {
      const urlHash = createHash('sha256').update(result.url).digest('hex').slice(0, 16);

      // Fetch full content (falls back to snippet on failure)
      let content = result.snippet;
      const fetched = await fetchPageContent(result.url);
      if (fetched && fetched.length > content.length) {
        content = fetched;
        pagesIndexed++;
      } else {
        pagesSkipped++;
      }

      if (!content || content.length < 30) {
        pagesFailed++;
        continue;
      }

      // Embed (title + content concatenated)
      const textToEmbed = `${result.title}\n\n${content.slice(0, 2000)}`;
      let embedding: number[] | null = null;
      try {
        const raw = await generateSingleEmbedding(textToEmbed);
        if (raw && raw.length === 768) embedding = Array.from(raw);
      } catch {
        // embedding optional — row still persisted
      }

      const snippet = content.slice(0, 400);
      const relevanceScore = 0.6; // base score; future: use cross-encoder rerank

      // ── 5. Upsert into web_search_index ────────────────────────────────────
      try {
        const existing = await db.execute(sql`
          SELECT id FROM web_search_index WHERE content_hash = ${urlHash} LIMIT 1
        `);
        const existingRows = Array.isArray((existing as unknown as { rows?: unknown[] }).rows)
          ? ((existing as unknown as { rows: Array<{ id: string }> }).rows)
          : (existing as unknown as Array<{ id: string }>);

        if (existingRows && existingRows.length > 0) {
          // Update existing row
          await db.execute(sql`
            UPDATE web_search_index
            SET
              content        = ${content},
              snippet        = ${snippet},
              relevance_score = ${relevanceScore},
              run_id         = ${runId},
              indexed_at     = now()
              ${embedding ? sql`, embedding = ${JSON.stringify(embedding)}::vector` : sql``}
            WHERE content_hash = ${urlHash}
          `);
          rowsUpdated++;
        } else {
          // Insert new row
          await db.insert(webSearchIndex).values({
            query,
            clusterId,
            url: result.url,
            title: result.title,
            content,
            snippet,
            provider: result.source,
            contentHash: urlHash,
            relevanceScore,
            runId,
            ...(embedding ? { embedding } : {}),
          });
          rowsInserted++;
        }
      } catch (err) {
        log(`[deep-research] DB upsert failed for ${result.url}: ${(err as Error).message}`);
        pagesFailed++;
        continue;
      }

      // ── 6. Mirror to Qdrant knowledge_base (optional) ───────────────────────
      if (!opts.skipQdrant && embedding) {
        try {
          const qdrantId = hashToQdrantId(urlHash);
          await mirrorToQdrant(qdrantId, embedding, {
            url: result.url,
            title: result.title,
            content: snippet,
            source: result.source,
            query,
            clusterId,
            contentHash: urlHash,
            relevanceScore,
            runId,
            type: 'web_search_index',
            indexedAt: new Date().toISOString(),
          });
        } catch {
          // Qdrant mirror is non-fatal
        }
      }
    }

    log(`[deep-research] Cluster ${clusterId} done: ${searchResults.length} results processed`);
  }

  const durationMs = Date.now() - startedAt;
  log(`[deep-research] Complete — queries:${queriesRun} indexed:${pagesIndexed} inserted:${rowsInserted} updated:${rowsUpdated} failed:${pagesFailed} (${durationMs}ms)`);

  return { queriesRun, pagesIndexed, pagesSkipped, pagesFailed, rowsInserted, rowsUpdated, durationMs };
}
