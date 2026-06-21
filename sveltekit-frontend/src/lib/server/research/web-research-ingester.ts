/**
 * web-research-ingester.ts — Lane 3: Qdrant chunks_web_search indexer
 *
 * Normalises GitHub/Reddit/web crawl results into WebResearchChunk,
 * embeds them via Ollama embeddinggemma:latest, and upserts into the
 * `chunks_web_search` Qdrant collection.
 *
 * Also optionally enriches chunks with Gemma 4 legal semantic tags
 * (fire-and-forget — does not block the ingest path).
 *
 * Collection: chunks_web_search (768-dim, Cosine, HNSW)
 * Payload filters indexed: source, subreddit, repo, language, fetched_at
 */

import { ENV } from '$lib/server/env.server.js';
import { getOllamaEndpoint } from '$lib/server/ollama.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { generateEmbedding } from '$lib/server/grpc/embedding-client.js';
import { chunkText, truncateForEmbed } from './research-utils.js';
import { buildVectorPayload } from '$lib/server/config/vector-config.js';

export type ResearchSource =
  | 'github_issue'
  | 'github_code'
  | 'github_repo'
  | 'reddit_post'
  | 'web_page'
  | 'official_docs';

export interface WebResearchChunk {
  id: string;
  source: ResearchSource;
  url: string;
  title: string;
  body: string;
  text_matches?: Array<{ fragment: string; property: string }>;
  repo?: string;
  language?: string;
  subreddit?: string;
  score: number;
  fetched_at: string;
  /** Filled after Gemma 4 tagging pass */
  semantic_tags?: string[];
  /** Filled after embedding */
  embedding?: number[];
}

export const RESEARCH_COLLECTION = 'chunks_web_search';

/** Qdrant vector config for chunks_web_search */
const COLLECTION_CONFIG = {
  vectors: {
    content: { size: 768, distance: 'Cosine' as const, on_disk: true },
  },
  hnsw_config: { m: 16, ef_construct: 128 },
  optimizers_config: { indexing_threshold: 5000 },
  on_disk_payload: true,
};

const PAYLOAD_INDEXES = [
  { field: 'source',      schema: 'keyword' as const },
  { field: 'subreddit',   schema: 'keyword' as const },
  { field: 'repo',        schema: 'keyword' as const },
  { field: 'language',    schema: 'keyword' as const },
  { field: 'fetched_at',  schema: 'keyword' as const },
];

// ── Collection bootstrap ──────────────────────────────────────────────────────

let _collectionReady = false;

export async function ensureResearchCollection(): Promise<void> {
  if (_collectionReady) return;

  try {
    const info = await qdrant.client.getCollection(RESEARCH_COLLECTION);
    if (info) { _collectionReady = true; return; }
  } catch {
    // Collection does not exist — create it
  }

  try {
    await qdrant.client.createCollection(RESEARCH_COLLECTION, COLLECTION_CONFIG as any);
    for (const { field, schema } of PAYLOAD_INDEXES) {
      await qdrant.client.createPayloadIndex(RESEARCH_COLLECTION, {
        field_name: field,
        field_schema: schema,
        wait: false,
      });
    }
    console.log(`[research-ingester] Created collection: ${RESEARCH_COLLECTION}`);
    _collectionReady = true;
  } catch (err) {
    console.error('[research-ingester] Failed to create collection:', err);
  }
}

// ── Embedding ─────────────────────────────────────────────────────────────────

async function embedText(text: string): Promise<number[] | null> {
  try {
    const truncated = truncateForEmbed(text, 2000);
    const result = await generateEmbedding(truncated);
    if (result && result.length === 768) return result;
    return null;
  } catch (err) {
    console.warn('[research-ingester] Embedding failed:', err);
    return null;
  }
}

// ── Gemma 4 semantic tagging (fire-and-forget) ────────────────────────────────

async function tagChunkAsync(chunk: WebResearchChunk): Promise<string[]> {
  try {
    const prompt = `You are a legal AI research tagger. Extract 3-6 short semantic tags from this content.
Tags should describe: legal concepts, programming topics, error types, framework names, or research domains.
Return only a JSON array of lowercase hyphenated strings. No explanation.

Title: ${chunk.title.slice(0, 100)}
Content: ${chunk.body.slice(0, 500)}

Tags:`;

    const res = await fetch(`${getOllamaEndpoint()}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: ENV.OLLAMA_CHAT_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.1, num_predict: 80 },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) return [];
    const data = (await res.json()) as { response: string };
    const match = data.response.match(/\[.*?\]/s);
    if (!match) return [];
    const tags = JSON.parse(match[0]) as string[];
    return Array.isArray(tags) ? tags.slice(0, 8) : [];
  } catch {
    return [];
  }
}

// ── Main ingest function ──────────────────────────────────────────────────────

export interface IngestResult {
  ingested: number;
  skipped: number;
  errors: number;
}

/**
 * Ingest an array of WebResearchChunks into chunks_web_search.
 * Each chunk is sub-chunked if > 800 chars, embedded, and upserted.
 * Gemma 4 tagging runs fire-and-forget after upsert.
 *
 * @param chunks  Raw chunks from github/reddit harvesters
 * @param addTags Whether to enrich with Gemma 4 semantic tags (async, ~20s/chunk)
 */
export async function ingestResearchChunks(
  chunks: WebResearchChunk[],
  addTags = false
): Promise<IngestResult> {
  await ensureResearchCollection();
  let ingested = 0;
  let skipped = 0;
  let errors = 0;

  // Process in batches of 10 to avoid overwhelming Ollama
  const BATCH = 10;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);

    await Promise.all(
      batch.map(async (chunk) => {
        try {
          // Sub-chunk large bodies
          const segments = chunkText(chunk.body, 800, 100);
          if (!segments.length) { skipped++; return; }

          const points: any[] = [];

          for (let si = 0; si < segments.length; si++) {
            const segText = `${chunk.title}\n\n${segments[si]}`;
            const embedding = await embedText(segText);
            if (!embedding) { skipped++; continue; }

            const segId = `${chunk.id}_s${si}`;
            points.push({
              id: chunkIdToUint(segId),
              vector: buildVectorPayload(RESEARCH_COLLECTION, embedding),
              payload: {
                chunk_id: segId,
                parent_id: chunk.id,
                segment_index: si,
                source: chunk.source,
                url: chunk.url,
                title: chunk.title,
                body: segments[si].slice(0, 2000),
                repo: chunk.repo ?? null,
                language: chunk.language ?? null,
                subreddit: chunk.subreddit ?? null,
                score: chunk.score,
                fetched_at: chunk.fetched_at,
                semantic_tags: chunk.semantic_tags ?? [],
              },
            });
          }

          if (points.length) {
            await qdrant.upsert({ collection: RESEARCH_COLLECTION, wait: true, points } as any);
            ingested += points.length;

            // Fire-and-forget tag enrichment
            if (addTags) {
              tagChunkAsync(chunk).then(async (tags) => {
                if (!tags.length) return;
                // Update semantic_tags on all segments for this chunk
                const ids = points.map((p) => p.id);
                await qdrant.client.setPayload(RESEARCH_COLLECTION, {
                  payload: { semantic_tags: tags },
                  points: ids,
                  wait: false,
                });
              }).catch(() => {/* non-fatal */});
            }
          }
        } catch (err) {
          console.error('[research-ingester] chunk error:', err);
          errors++;
        }
      })
    );
  }

  return { ingested, skipped, errors };
}

/**
 * Search chunks_web_search by semantic similarity.
 * Returns ranked results filtered by optional source type.
 */
export async function searchResearchChunks(opts: {
  queryEmbedding: number[];
  limit?: number;
  sourceFilter?: ResearchSource[];
  scoreThreshold?: number;
}): Promise<Array<{ chunk_id: string; source: ResearchSource; url: string; title: string; body: string; score: number; semantic_tags: string[] }>> {
  await ensureResearchCollection();
  const filter = opts.sourceFilter?.length
    ? { must: [{ key: 'source', match: { any: opts.sourceFilter } }] }
    : undefined;

  try {
    const results = await qdrant.client.search(RESEARCH_COLLECTION, {
      vector: { name: 'content', vector: opts.queryEmbedding },
      limit: opts.limit ?? 10,
      score_threshold: opts.scoreThreshold ?? 0.55,
      filter,
      with_payload: true,
    });

    return (results ?? []).map((r) => ({
      chunk_id: r.payload?.chunk_id as string ?? '',
      source: r.payload?.source as ResearchSource ?? 'web_page',
      url: r.payload?.url as string ?? '',
      title: r.payload?.title as string ?? '',
      body: r.payload?.body as string ?? '',
      score: r.score,
      semantic_tags: (r.payload?.semantic_tags as string[]) ?? [],
    }));
  } catch (err) {
    console.error('[research-ingester] search error:', err);
    return [];
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert a string chunk ID into a stable 32-bit integer for Qdrant point ID */
function chunkIdToUint(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash === 0 ? 1 : hash;
}
