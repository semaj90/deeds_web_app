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
import { LLM_MODEL_ID } from '$lib/server/llm/runtime-contract.js';
import { createHash } from 'node:crypto';
import { bifrostChat } from '$lib/server/ollama.js';
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
export const RESEARCH_INGESTION_SCHEMA_REVISION = 'atlas.research-ingest:v2';
export const RESEARCH_EMBEDDING_REVISION = 'embeddinggemma:latest:semantic_768';
export const RESEARCH_INGESTER_REVISION = 'web-research-ingester:v2';

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
  { field: 'fetched_at',  schema: 'datetime' as const },
];

export interface ResearchChunkPlan {
  pointId: string;
  chunkId: string;
  parentId: string;
  segmentIndex: number;
  source: ResearchSource;
  url: string;
  contentChecksum: string;
  embeddingDimension: 768;
}
export interface ResearchCollectionContract {
  collection: string;
  status: 'MISSING' | 'CONTRACT_MATCH' | 'CONTRACT_MISMATCH';
  vector: { name: string; size: number | null; distance: string | null };
  indexes: Record<string, string | null>;
  mismatches: string[];
}

// ── Collection bootstrap ──────────────────────────────────────────────────────

let _collectionReady = false;

function collectionVector(info: any): any {
  return info?.config?.params?.vectors ?? info?.result?.config?.params?.vectors ?? info?.vectors ?? info?.result?.vectors;
}
function collectionPayloadSchema(info: any): Record<string, any> {
  return info?.payload_schema ?? info?.result?.payload_schema ?? {};
}

export async function inspectResearchCollectionContract(): Promise<ResearchCollectionContract> {
  let info: any;
  try {
    info = await qdrant.client.getCollection(RESEARCH_COLLECTION);
  } catch {
    return {
      collection: RESEARCH_COLLECTION,
      status: 'MISSING',
      vector: { name: 'content', size: null, distance: null },
      indexes: Object.fromEntries(PAYLOAD_INDEXES.map(({ field }) => [field, null])),
      mismatches: ['COLLECTION_MISSING'],
    };
  }

  const vectors = collectionVector(info);
  const content = vectors?.content ?? vectors;
  const payloadSchema = collectionPayloadSchema(info);
  const indexes = Object.fromEntries(PAYLOAD_INDEXES.map(({ field }) => [
    field,
    payloadSchema[field]?.data_type ?? payloadSchema[field]?.schema ?? null,
  ]));
  const mismatches: string[] = [];
  if (!content || content.size !== 768) mismatches.push('VECTOR_CONTENT_SIZE');
  if (!content || String(content.distance).toLowerCase() !== 'cosine') mismatches.push('VECTOR_CONTENT_DISTANCE');
  for (const { field, schema } of PAYLOAD_INDEXES) {
    if (indexes[field] !== schema) mismatches.push(`PAYLOAD_INDEX_${field}`);
  }
  return {
    collection: RESEARCH_COLLECTION,
    status: mismatches.length ? 'CONTRACT_MISMATCH' : 'CONTRACT_MATCH',
    vector: { name: 'content', size: content?.size ?? null, distance: content?.distance ?? null },
    indexes,
    mismatches,
  };
}

export async function ensureResearchCollection(): Promise<void> {
  if (_collectionReady) return;

  let collectionExists = false;
  try {
    await qdrant.client.getCollection(RESEARCH_COLLECTION);
    collectionExists = true;
  } catch {
    // Collection does not exist — create it
  }
  if (collectionExists) {
    const contract = await inspectResearchCollectionContract();
    if (contract.status !== 'CONTRACT_MATCH') {
      throw new Error(`RESEARCH_COLLECTION_CONTRACT_MISMATCH:${contract.mismatches.join(',')}`);
    }
    _collectionReady = true;
    return;
  }

  try {
    await qdrant.client.createCollection(RESEARCH_COLLECTION, COLLECTION_CONFIG as any);
    for (const { field, schema } of PAYLOAD_INDEXES) {
      await qdrant.client.createPayloadIndex(RESEARCH_COLLECTION, {
        field_name: field,
        field_schema: schema,
        wait: true,
      });
    }
    const contract = await inspectResearchCollectionContract();
    if (contract.status !== 'CONTRACT_MATCH') {
      throw new Error(`RESEARCH_COLLECTION_CONTRACT_MISMATCH:${contract.mismatches.join(',')}`);
    }
    console.log(`[research-ingester] Created collection: ${RESEARCH_COLLECTION}`);
    _collectionReady = true;
  } catch (err) {
    console.error('[research-ingester] Failed to create collection:', err);
    throw err;
  }
}

export function researchPointId(input: {
  source: ResearchSource;
  parentExternalId: string;
  url: string;
  segmentIndex: number;
  contentChecksum: string;
}): string {
  const digest = createHash('sha256')
    .update(JSON.stringify({ ...input, ingestionSchemaRevision: RESEARCH_INGESTION_SCHEMA_REVISION }))
    .digest('hex');
  const hex = digest.slice(0, 32).split('');
  hex[12] = '5';
  hex[16] = ['8', '9', 'a', 'b'][parseInt(hex[16], 16) % 4];
  const raw = hex.join('');
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

export function planResearchChunks(chunks: WebResearchChunk[]): ResearchChunkPlan[] {
  const planned: ResearchChunkPlan[] = [];
  for (const chunk of chunks) {
    const segments = chunkText(chunk.body, 800, 100);
    for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex++) {
      const content = `${chunk.title}\n\n${segments[segmentIndex]}`;
      const contentChecksum = `sha256:${createHash('sha256').update(content, 'utf8').digest('hex')}`;
      planned.push({
        pointId: researchPointId({ source: chunk.source, parentExternalId: chunk.id, url: chunk.url, segmentIndex, contentChecksum }),
        chunkId: `${chunk.id}_s${segmentIndex}`,
        parentId: chunk.id,
        segmentIndex,
        source: chunk.source,
        url: chunk.url,
        contentChecksum,
        embeddingDimension: 768,
      });
    }
  }
  return planned;
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

    const content = await bifrostChat(
      [{ role: 'user', content: prompt }],
      LLM_MODEL_ID,
      { temperature: 0.1, maxTokens: 80, timeoutMs: 20_000 }
    ).catch(() => '');

    if (!content) return [];
    const match = content.match(/\[.*?\]/s);
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
  errorMessages?: string[];
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
  const errorMessages: string[] = [];

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
            const contentChecksum = `sha256:${createHash('sha256').update(segText, 'utf8').digest('hex')}`;
            points.push({
              id: researchPointId({ source: chunk.source, parentExternalId: chunk.id, url: chunk.url, segmentIndex: si, contentChecksum }),
              // Qdrant REST named-vector shape is { content: [...] }.
              // Do not use the internal { name, vector } helper shape here.
              vector: { content: embedding },
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
                content_checksum: contentChecksum,
                embedding_model_id: 'embeddinggemma',
                embedding_dimension: 768,
                embedding_revision: RESEARCH_EMBEDDING_REVISION,
                ingestion_schema_revision: RESEARCH_INGESTION_SCHEMA_REVISION,
                ingester_revision: RESEARCH_INGESTER_REVISION,
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
          errorMessages.push(err instanceof Error ? err.message : String(err));
        }
      })
    );
  }

  return { ingested, skipped, errors, errorMessages };
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
    const results = await qdrant.client.query(RESEARCH_COLLECTION, {
      query: opts.queryEmbedding,
      using: 'content',
      limit: opts.limit ?? 10,
      score_threshold: opts.scoreThreshold ?? 0.55,
      filter,
      with_payload: true,
    });

    return (results.points ?? []).map((r) => ({
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
