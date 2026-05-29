/**
 * Dual Embedding Indexer
 *
 * For each code chunk, generates TWO embeddings:
 * 1. Raw text embedding (the actual code content)
 * 2. Signature embedding (AST-derived metadata string)
 *
 * Both are stored in Qdrant as named vectors, enabling:
 * - Content search: "find database insert operations"
 * - Signature search: "POST /api/cases uses db.insert"
 * - Hybrid: weighted combination of both scores
 *
 * Uses embeddinggemma:latest (768-dim) via Ollama, standardized.
 */
import { ENV } from '$lib/server/env.server.js';
import { SERVER_EMBEDDING_MODEL, SERVER_EMBEDDING_DIMS } from '$lib/ai/model-ids.js';
import type { CodeChunk } from './ast-chunker.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { runWithAdaptiveBatch } from '$lib/server/gpu/libtorch-bridge.js';
import { getCachedEmbedding, setCachedEmbedding } from '$lib/server/knowledge-cache.js';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client.js';
import { logEmbedIndex } from './ast-ingest-logger.js';
import { topoByteFromPath, classifyPath } from '$lib/server/tensor/topology-byte-mapper.js';
import { normalizeLabels } from '$lib/server/labels/normalize-labels.js';
import fs from 'fs';
import path from 'path';

const QDRANT_COLLECTION = 'codebase_chunks_768';
const INITIAL_BATCH = 24; // starting batch size; runWithAdaptiveBatch halves on OOM

interface EmbeddingResult {
  embedding: number[];
}

interface IndexResult {
  chunksProcessed: number;
  embeddingsGenerated: number;
  storedInQdrant: number;
  failed: number;
  skippedIgnored?: number;
  durationMs: number;
}

export interface IndexChunksProgress {
  totalChunks: number;
  chunksCompleted: number;
  embeddingsGenerated: number;
  storedInQdrant: number;
  failed: number;
  batchIndex: number;
  batchSize: number;
  skippedIgnored?: number;
}

interface IndexChunksOptions {
  onProgress?: (progress: IndexChunksProgress) => void | Promise<void>;
}

function isValidEmbedding(value: unknown): value is number[] {
  return Array.isArray(value) && value.length === SERVER_EMBEDDING_DIMS;
}

/**
 * Generate a 768-dim embedding via the 4-tier embedding fallback chain.
 * Uses embedding-client.ts (gRPC→QUIC→HTTP batch→HTTP seq) which always
 * targets Ollama :11434 — NOT ollamaFetch which may route to llama-server :8090.
 * Redis-cached by content hash to avoid re-embedding identical text.
 */
async function embed(text: string): Promise<number[]> {
  const prompt = text.trim() || text;

  // Use the canonical 4-tier embedding client (avoids TurboQuant :8090 routing)
  const result = await generateEmbeddings([prompt]);
  const embedding = result.vectors[0];

  if (!isValidEmbedding(embedding)) {
    throw new Error('Embedding response returned an invalid vector (dim mismatch or empty)');
  }

  return embedding;
}

/**
 * Ensure a Qdrant collection exists with dual named vectors.
 */
async function ensureCollection(): Promise<void> {
  const qdrantUrl = ENV.QDRANT_URL;

  // Check if collection exists
  const check = await fetch(`${qdrantUrl}/collections/${QDRANT_COLLECTION}`);
  if (check.ok) return;

  // Create with named vectors for dual embedding
  const res = await fetch(`${qdrantUrl}/collections/${QDRANT_COLLECTION}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vectors: {
        content: { size: SERVER_EMBEDDING_DIMS, distance: 'Cosine' },
        signature: { size: SERVER_EMBEDDING_DIMS, distance: 'Cosine' },
        error: { size: SERVER_EMBEDDING_DIMS, distance: 'Cosine' },
        encoded_64: { size: 64, distance: 'Cosine' },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to create collection: ${await res.text()}`);
  }

  // Create payload indexes for filtered search
  const indexes = [
    'kind',
    'httpMethod',
    'routeId',
    'tags',
    'topo_class',
    'cluster_key',
    'centroid_label',
    'topology_label',
    'hotness_bucket',
    'feature_family',
  ];
  for (const field of indexes) {
    await fetch(`${qdrantUrl}/collections/${QDRANT_COLLECTION}/index`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        field_name: field,
        field_schema: { type: 'keyword', lookup: true },
      }),
    }).catch(() => {}); // ignore if already exists
  }
}

// Load index configuration (optional). Look for `indexing.config.json` at
// process.cwd() (CI / scripts) or repo root when running from npm tasks.
function loadIndexingConfig(): { excludePatterns?: string[] } | null {
  try {
    const cfgPath = path.join(process.cwd(), 'indexing.config.json');
    if (!fs.existsSync(cfgPath)) return null;
    const raw = fs.readFileSync(cfgPath, 'utf8');
    return JSON.parse(raw) as { excludePatterns?: string[] };
  } catch {
    return null;
  }
}

const INDEXING_CONFIG = loadIndexingConfig();
const EXCLUDE_PATTERNS: string[] = INDEXING_CONFIG?.excludePatterns ?? [
  '.venv/',
  '/.venv/',
  '/venv/',
  'venv/',
  'site-packages/',
  '__pycache__/',
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesExclude(lp: string): boolean {
  const low = lp.toLowerCase();
  for (const patRaw of EXCLUDE_PATTERNS) {
    const pat = patRaw.replace(/\\\\/g, '/').toLowerCase();
    if (pat.includes('*')) {
      const re = new RegExp('^' + pat.split('*').map(escapeRegExp).join('.*') + '$');
      if (re.test(low)) return true;
      continue;
    }
    if (pat.startsWith('**/')) {
      const sub = pat.slice(3);
      if (low.includes(sub)) return true;
      continue;
    }
    // simple substring or startsWith checks
    if (low.includes(pat) || low.startsWith(pat)) return true;
  }
  return false;
}

/**
 * Non-destructively add the `error` named vector to an existing collection.
 *
 * Qdrant v1.12+ supports PATCH /collections/{name} to add new named vectors
 * without touching existing `content` + `signature` vectors or their points.
 * Safe to call repeatedly — idempotent via Qdrant's update semantics.
 *
 * Call once during indexing setup or from /api/codebase-index/enrich-qdrant
 * to upgrade legacy collections created before the error vector was added.
 */
export async function patchErrorVectorSchema(): Promise<boolean> {
  const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vectors: {
        error: { size: SERVER_EMBEDDING_DIMS, distance: 'Cosine' },
      },
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  return res?.ok ?? false;
}

/**
 * Generate a 768-dim embedding for an error description and upsert it as the
 * `error` named vector on an existing `codebase_chunks_768` point.
 *
 * The error text is: "[ErrorCode] message (filePath)" — compact enough to embed
 * cleanly with embeddinggemma while capturing all three search dimensions.
 *
 * Fire-and-forget safe: caller can `.catch(() => {})` without consequence.
 * The `content` and `signature` vectors on the point are NOT touched.
 *
 * @param chunkId   - Qdrant point ID (number or UUID string)
 * @param errorCode - Error code (e.g. "TS2345", "SVELTE-401")
 * @param message   - Human-readable error message
 * @param filePath  - File path where the error was detected
 */
export async function upsertErrorVector(
  chunkId: string | number,
  errorCode: string,
  message: string,
  filePath: string
): Promise<boolean> {
  const errorText = `[${errorCode}] ${message} (${filePath})`.slice(0, 1_000);

  let errorEmbedding: number[];
  try {
    errorEmbedding = await embed(errorText);
  } catch {
    return false;
  }

  // Qdrant PUT /points with named vector — only updates the `error` vector slot;
  // existing `content` and `signature` vectors on the point are preserved.
  const pointId = typeof chunkId === 'string' ? hashToUint(chunkId) : chunkId;
  const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      points: [
        {
          id: pointId,
          vector: { error: errorEmbedding },
        },
      ],
    }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);

  return res?.ok ?? false;
}

/**
 * Search `codebase_chunks_768` using the `error` named vector.
 * Returns chunks ordered by semantic similarity to the error description.
 *
 * Use this to find code that is likely associated with a specific error pattern
 * (complementary to content-search, which finds code by what it does).
 *
 * @param errorText  - Error message or description to embed + search
 * @param limit      - Max results (default 10)
 * @param filter     - Optional Qdrant payload filter
 */
export async function searchByError(
  errorText: string,
  limit = 10,
  filter?: Record<string, unknown>
): Promise<Array<{ id: number | string; score: number; payload: Record<string, unknown> }>> {
  let vector: number[];
  try {
    vector = await embed(errorText.slice(0, 1_000));
  } catch {
    return [];
  }
  return searchVector('error', vector, limit, filter);
}

/**
 * Upsert points with dual named vectors to Qdrant.
 */
async function upsertPoints(
  points: Array<{
    id: string;
    vectors: { content: number[]; signature: number[] };
    payload: Record<string, unknown>;
  }>
): Promise<void> {
  const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      points: points.map((p) => ({
        id: hashToUint(p.id),
        vector: { content: p.vectors.content, signature: p.vectors.signature },
        payload: p.payload,
      })),
    }),
  });

  if (!res.ok) {
    throw new Error(`Qdrant upsert failed (${res.status}): ${await res.text()}`);
  }
}

/**
 * Search with dual vectors. Combines content + signature scores.
 */
export async function searchCodebase(
  query: string,
  opts: {
    limit?: number;
    filter?: Record<string, unknown>;
    contentWeight?: number;
    signatureWeight?: number;
  } = {}
): Promise<Array<{ chunk: { content: string } & Record<string, unknown>; score: number }>> {
  const limit = opts.limit ?? 10;
  const contentWeight = opts.contentWeight ?? 0.6;
  const signatureWeight = opts.signatureWeight ?? 0.4;

  const queryEmbedding = await embed(query);

  // Search both vector spaces
  const [contentResults, signatureResults] = await Promise.all([
    searchVector('content', queryEmbedding, limit * 2, opts.filter),
    searchVector('signature', queryEmbedding, limit * 2, opts.filter),
  ]);

  // Merge and re-rank by weighted score
  const scoreMap = new Map<string, { payload: Record<string, unknown>; score: number }>();

  for (const r of contentResults) {
    const key = r.id.toString();
    const existing = scoreMap.get(key);
    const score = (existing?.score ?? 0) + r.score * contentWeight;
    scoreMap.set(key, { payload: r.payload, score });
  }

  for (const r of signatureResults) {
    const key = r.id.toString();
    const existing = scoreMap.get(key);
    const score = (existing?.score ?? 0) + r.score * signatureWeight;
    scoreMap.set(key, { payload: existing?.payload ?? r.payload, score });
  }

  // Sort by combined score, take top N
  return [...scoreMap.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => ({
      chunk: {
        content: r.payload.content as string,
        path: r.payload.path as string,
        relativePath: r.payload.relativePath as string,
        kind: r.payload.kind as string,
        symbol: r.payload.symbol as string,
        httpMethod: r.payload.httpMethod as string | undefined,
        routeId: r.payload.routeId as string | undefined,
        exports: r.payload.exports as string[],
        tags: r.payload.tags as string[],
        lineStart: r.payload.lineStart as number,
        lineEnd: r.payload.lineEnd as number,
        topo_class: r.payload.topo_class as string | undefined,
        cluster_key: r.payload.cluster_key as string | undefined,
        centroid_label: r.payload.centroid_label as string | undefined,
        topology_label: r.payload.topology_label as string | undefined,
        hotness_bucket: r.payload.hotness_bucket as string | undefined,
        feature_family: r.payload.feature_family as string | undefined,
        label_json: r.payload.label_json as Record<string, unknown> | undefined,
        neo4j_gpuCluster: r.payload.neo4j_gpuCluster as number | undefined,
        gpu_cluster: r.payload.gpu_cluster as number | undefined,
        som_cluster: r.payload.som_cluster as number | undefined,
        som_bmu_row: r.payload.som_bmu_row as number | undefined,
        som_bmu_col: r.payload.som_bmu_col as number | undefined,
      },
      score: r.score,
    }));
}

async function searchVector(
  vectorName: string,
  vector: number[],
  limit: number,
  filter?: Record<string, unknown>
): Promise<Array<{ id: number | string; score: number; payload: Record<string, unknown> }>> {
  const body: Record<string, unknown> = {
    vector: { name: vectorName, vector },
    limit,
    with_payload: true,
  };
  if (filter) body.filter = filter;

  const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) return [];
  const data = await res.json();
  return data.result ?? [];
}

/**
 * Index an array of AST code chunks into Qdrant with dual embeddings.
 */
export async function indexChunks(
  chunks: CodeChunk[],
  options: IndexChunksOptions = {}
): Promise<IndexResult> {
  const start = performance.now();
  let embeddingsGenerated = 0;
  let storedInQdrant = 0;
  let failed = 0;
  let skippedIgnored = 0;
  let chunksCompleted = 0;

  await ensureCollection();

  // runWithAdaptiveBatch handles CUDA OOM by halving batch size and retrying.
  // On success it doubles back toward INITIAL_BATCH (adaptive oscillation).
  // Embedding is the GPU bottleneck — batch size of 24 fills ~350 MB VRAM on RTX 3060 Ti.
  //
  // Embedding flow: generateEmbeddings() routes to the gRPC tier when
  // EMBEDDING_GRPC_ENABLED=true (Go embedding service on :50051), which batches
  // N texts in one RPC round-trip. Fallbacks: HTTP batch → sequential Ollama.
  // For a batch of 24 chunks we issue ONE call with 48 texts (24 content + 24
  // signature) instead of 48 sequential Ollama round-trips.
  await runWithAdaptiveBatch<CodeChunk>(
    chunks,
    async (batch, batchIndex) => {
      const points: Array<{
        id: string;
        vectors: { content: number[]; signature: number[] };
        payload: Record<string, unknown>;
      }> = [];

      // Flatten: [content_0, signature_0, content_1, signature_1, ...]
      const texts: string[] = [];
      for (const chunk of batch) {
        texts.push(chunk.content.slice(0, 2_000));
        texts.push(chunk.signature);
      }

      let vectors: number[][] = [];
      try {
        const result = await generateEmbeddings(texts);
        vectors = result.vectors;
      } catch {
        // Full batch failure — mark all as failed and skip Qdrant upsert
        failed += batch.length;
        chunksCompleted += batch.length;
        await options.onProgress?.({
          totalChunks: chunks.length,
          chunksCompleted,
          embeddingsGenerated,
          storedInQdrant,
          failed,
          skippedIgnored,
          batchIndex,
          batchSize: batch.length,
        });
        return;
      }

      // Split pairs back into content + signature per chunk
      for (let i = 0; i < batch.length; i++) {
        const contentEmb = vectors[i * 2];
        const signatureEmb = vectors[i * 2 + 1];
        if (!isValidEmbedding(contentEmb) || !isValidEmbedding(signatureEmb)) {
          failed++;
          continue;
        }
        embeddingsGenerated += 2;
        // Defensive ignore: skip ephemeral or virtualenv files that should not be
        // indexed. Many dev environments create .venv/ or venv/ folders and
        // Python site-packages which can pollute the code index. Also ignore
        // __pycache__ folders. If a chunk's relativePath matches any of these
        // patterns, do not create a Qdrant point for it.
        const relPath = (batch[i].metadata as unknown as Record<string, unknown>)?.relativePath as
          | string
          | undefined;
        if (relPath) {
          const lp = relPath.replace(/\\/g, '/').toLowerCase();
          if (matchesExclude(lp)) {
            // Skip indexing this chunk; it's environment noise.
            skippedIgnored++;
            // Emit a lightweight console log for traceability in smoke runs
            console.info('[indexer] skipped ignored path:', relPath);
            continue;
          }
        }
        points.push({
          id: batch[i].id,
          vectors: { content: contentEmb, signature: signatureEmb },
          payload: (() => {
            const meta = batch[i].metadata ?? {};
            const topoClass = classifyPath(
              ((meta as Record<string, unknown>).relativePath as string) ?? ''
            );
            const somCluster =
              (meta as Record<string, unknown>).som_cluster ??
              (meta as Record<string, unknown>).somCluster;
            const clusterKey = somCluster != null ? `${topoClass}:${somCluster}` : topoClass;
            const labels = normalizeLabels({
              jsonb: meta,
              centroid: {
                label: `gpu:${somCluster ?? topoClass}`,
                topology: String(topoClass),
                clusterKey: String(clusterKey),
              },
              karpathy: {
                blend:
                  typeof (meta as Record<string, unknown>).karpathyBlend === 'number'
                    ? Number((meta as Record<string, unknown>).karpathyBlend)
                    : typeof (meta as Record<string, unknown>).graphAuthorityScore === 'number'
                      ? Number((meta as Record<string, unknown>).graphAuthorityScore)
                      : undefined,
                score:
                  typeof (meta as Record<string, unknown>).graphAuthorityScore === 'number'
                    ? Number((meta as Record<string, unknown>).graphAuthorityScore)
                    : undefined,
                bucket:
                  typeof (meta as Record<string, unknown>).hotness_bucket === 'string'
                    ? String((meta as Record<string, unknown>).hotness_bucket)
                    : undefined,
              },
            });
            return {
              content: batch[i].content.slice(0, 4_000),
              signature: batch[i].signature,
              chunk_id: batch[i].id,
              ...meta,
              topo_byte: topoByteFromPath(
                ((meta as Record<string, unknown>).relativePath as string) ?? ''
              ),
              topo_class: labels.topology_label ?? topoClass,
              cluster_key: labels.cluster_key ?? clusterKey,
              centroid_label: labels.centroid_label,
              topology_label: labels.topology_label,
              hotness_bucket: labels.hotness_bucket,
              feature_family: labels.feature_family,
              label_json: labels.tags,
            };
          })(),
        });
      }

      if (points.length > 0) {
        try {
          await upsertPoints(points);
          storedInQdrant += points.length;
        } catch {
          failed += points.length;
        }
      }

      chunksCompleted += batch.length;
      await options.onProgress?.({
        totalChunks: chunks.length,
        chunksCompleted,
        embeddingsGenerated,
        storedInQdrant,
        failed,
        skippedIgnored,
        batchIndex,
        batchSize: batch.length,
      });
    },
    { initialBatch: INITIAL_BATCH, minBatch: 4 }
  );

  const result: IndexResult = {
    chunksProcessed: chunks.length,
    embeddingsGenerated,
    storedInQdrant,
    failed,
    skippedIgnored,
    durationMs: Math.round(performance.now() - start),
  };

  // ── ingest logger ────────────────────────────────────────────────────────
  logEmbedIndex({
    mode: 'full',
    samplePath: chunks[0]?.metadata?.relativePath ?? '',
    chunksProcessed: result.chunksProcessed,
    skippedExisting: 0,
    skippedIgnored,
    embeddingsGenerated: result.embeddingsGenerated,
    storedInQdrant: result.storedInQdrant,
    failed: result.failed,
    durationMs: result.durationMs,
  });

  return result;
}

/**
 * Deterministic hash of a string to a uint64 (for Qdrant point ID).
 */
function hashToUint(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}

/**
 * Batch-check which Qdrant point IDs already exist in the collection.
 * Uses POST /points with id filter — returns the set of IDs that are present.
 */
async function getExistingPointIds(ids: number[]): Promise<Set<number>> {
  const existing = new Set<number>();
  const BATCH = 500;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: batch, with_payload: false, with_vector: false }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!res?.ok) continue;
    const data = (await res.json()) as { result?: Array<{ id: number }> };
    for (const pt of data.result ?? []) existing.add(pt.id);
  }
  return existing;
}

interface IncrementalIndexResult extends IndexResult {
  skippedExisting: number;
}

/**
 * Index chunks incrementally — skip chunks whose point ID already exists in Qdrant.
 * On re-run, only new/changed chunks get embedded and upserted.
 */
export async function indexChunksIncremental(
  chunks: CodeChunk[],
  options: IndexChunksOptions = {}
): Promise<IncrementalIndexResult> {
  await ensureCollection();

  // Check which chunks are already in Qdrant
  const chunkIds = chunks.map((c) => hashToUint(c.id));
  const existing = await getExistingPointIds(chunkIds);

  const newChunks = chunks.filter((c) => !existing.has(hashToUint(c.id)));
  const skippedExisting = chunks.length - newChunks.length;

  if (newChunks.length === 0) {
    const zeroResult = {
      chunksProcessed: chunks.length,
      embeddingsGenerated: 0,
      storedInQdrant: 0,
      failed: 0,
      skippedExisting,
      durationMs: 0,
    };
    logEmbedIndex({
      mode: 'incremental',
      samplePath: chunks[0]?.metadata?.relativePath ?? '',
      chunksProcessed: zeroResult.chunksProcessed,
      skippedExisting,
      embeddingsGenerated: 0,
      storedInQdrant: 0,
      failed: 0,
      durationMs: 0,
    });
    return zeroResult;
  }

  const result = await indexChunks(newChunks, options);
  // Pull skippedIgnored from the inner result (indexChunks now returns it)
  const skippedIgnoredFromInner = (result as any).skippedIgnored ?? 0;
  // Override the 'full' log written by indexChunks with an incremental one
  // (the full log was already emitted inside indexChunks above — this is a summary)
  logEmbedIndex({
    mode: 'incremental',
    samplePath: chunks[0]?.metadata?.relativePath ?? '',
    chunksProcessed: chunks.length,
    skippedExisting,
    skippedIgnored: skippedIgnoredFromInner,
    embeddingsGenerated: result.embeddingsGenerated,
    storedInQdrant: result.storedInQdrant,
    failed: result.failed,
    durationMs: result.durationMs,
  });
  return {
    ...result,
    chunksProcessed: chunks.length,
    skippedExisting,
    skippedIgnored: skippedIgnoredFromInner,
  };
}
