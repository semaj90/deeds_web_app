/**
 * Multi-Protocol Embedding Client — server-only.
 *
 * 4-tier fallback chain for batch 768d embeddings:
 *   1. gRPC (50051) — binary protocol, lowest latency
 *   2. QUIC/NATS (4222) — HTTP/3, 0-RTT, multiplexed
 *   3. HTTP/Ollama Batch (/api/embed) — standard REST
 *   4. HTTP/Ollama Sequential (/api/embeddings) — legacy fallback
 *
 * All addresses resolved via ENV.* getters in env.server.ts.
 */
import { ENV } from '$lib/server/env.server.js';
import { SERVER_EMBEDDING_MODEL } from '$lib/ai/model-ids.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { buildGrpcClientChannelOptions } from './client-options.js';
// Proto types inlined (generated/proto archived — regenerate from proto/*.proto if gRPC revived)

// ── Types ──────────────────────────────────────────────────────────────────

export interface ProtoEmbeddingRequest {
  texts: string[];
  model?: string;
  dimensions?: number;
}
export interface ProtoEmbeddingResponse {
  embeddings: number[][];
  model: string;
  dimensions: number;
}
export interface ProtoHealthResponse {
  status: string;
  model: string;
  ready: boolean;
}

export interface EmbeddingOptions {
  httpBatchTimeoutMs?: number;
  httpSingleTimeoutMs?: number;
  preferSequentialHttp?: boolean;
  skipCacheRead?: boolean;
  skipCacheWrite?: boolean;
}

type EmbeddingSource = 'grpc' | 'quic' | 'http-ollama' | 'http-ollama-sequential';

export type EmbeddingAttemptStatus = 'success' | 'failed' | 'skipped' | 'cache-hit';

export interface EmbeddingAttempt {
  transport: EmbeddingSource;
  status: EmbeddingAttemptStatus;
  detail?: string;
  durationMs?: number;
}

export interface EmbeddingResult {
  vectors: number[][];
  model: string;
  dimension: number;
  source: EmbeddingSource;
  totalMs: number;
  cacheHit?: boolean;
  attempts?: EmbeddingAttempt[];
}

export interface EmbeddingTransportHealth {
  status: 'ok' | 'degraded' | 'disabled';
  detail: string;
  stateScope?: 'process';
  observedSinceAt?: string;
  retryAt?: string;
  lastFailureAt?: string;
  lastFailureDetail?: string;
  lastSuccessAt?: string;
}

/**
 * JSONB-compatible embedding cache entry.
 * Stored in Redis as JSON string; shape mirrors what would be indexed in a
 * PostgreSQL JSONB column if the cache were ever promoted to durable storage.
 *
 * Key: `embed:{model}:{sha256_16hex}` (24h TTL — embeddings are deterministic)
 * Qdrant tag enrichment (qdrantTags) is populated fire-and-forget after generation
 * and is used by bifrostChat() to sharpen the semantic cache key.
 */
export interface EmbeddingCacheEntry {
  vector: number[];
  source: EmbeddingSource;
  model: string;
  dimension: number;
  /** Top entity tags from nearest-neighbor Qdrant payload — used in Bifrost cache key */
  qdrantTags: string[];
  queryHash: string; // FNV-1a of original text (8 hex chars)
  createdAt: string; // ISO timestamp
  hitCount: number; // incremented on cache hits (approximate)
}

/** Legacy narrow shape for backwards-compat reads. */
interface CachedEmbeddingEntry {
  vector: number[];
  source?: EmbeddingSource;
}

class EmbeddingGenerationError extends Error {
  attempts: EmbeddingAttempt[];

  constructor(message: string, attempts: EmbeddingAttempt[]) {
    super(message);
    this.name = 'EmbeddingGenerationError';
    this.attempts = attempts;
  }
}

interface EmbeddingCallResult {
  vectors: number[][] | null;
  detail?: string;
}

const HTTP_BATCH_TIMEOUT_MS = ENV.ACE_EMBED_BATCH_TIMEOUT_MS;
const HTTP_SINGLE_TIMEOUT_MS = 45_000; // Standard single-embedding fallback

// ── gRPC client (lazy-loaded, singleton) ───────────────────────────────────

let grpcClient: any = null;
let grpcLoadFailed = false;
let grpcRetryAt = 0; // Timestamp for next retry after failure
let grpcFailLogged = false; // Only log first failure to avoid spam

function getGrpcMethod(client: any, candidates: string[]): ((...args: any[]) => void) | null {
  for (const name of candidates) {
    if (typeof client?.[name] === 'function') {
      return client[name].bind(client);
    }
  }

  return null;
}

async function getGrpcClient(): Promise<any> {
  if (grpcLoadFailed) {
    // Retry after 30s instead of permanent disable
    if (Date.now() < grpcRetryAt) return null;
    grpcLoadFailed = false;
    grpcClient = null;
  }
  if (grpcClient) return grpcClient;

  try {
    const grpc = await import('@grpc/grpc-js');
    const protoLoader = await import('@grpc/proto-loader');
    const { resolve } = await import('path');

    // Use active proto definition (Go microservice archived, but proto still valid)
    const PROTO_PATH = resolve(process.cwd(), '../proto/active/embedding.proto');

    const packageDefinition = await protoLoader.load(PROTO_PATH, {
      keepCase: false,
      longs: Number,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
    const EmbeddingService = protoDescriptor.embedding.EmbeddingService;

    grpcClient = new EmbeddingService(
      ENV.EMBEDDING_GRPC_URL,
      grpc.credentials.createInsecure(),
      buildGrpcClientChannelOptions({
        maxConnectionIdleMs: 300_000,
        maxConnectionAgeMs: 600_000,
        maxSendMessageLength: 10 * 1024 * 1024,
        maxReceiveMessageLength: 10 * 1024 * 1024,
      })
    );

    return grpcClient;
  } catch (err) {
    if (!grpcFailLogged) {
      console.warn(
        '[embedding-client] gRPC client init failed, will retry silently:',
        (err as Error).message
      );
      grpcFailLogged = true;
    }
    grpcLoadFailed = true;
    grpcRetryAt = Date.now() + 30_000;
    return null;
  }
}

// ── gRPC embedding call ────────────────────────────────────────────────────

async function generateViaGrpc(texts: string[], timeoutMs = 5000): Promise<EmbeddingCallResult> {
  const client = await getGrpcClient();
  if (!client) return { vectors: null, detail: 'client unavailable' };

  return new Promise((resolve) => {
    const deadline = new Date(Date.now() + timeoutMs);

    // Proto: rpc GenerateEmbeddings(EmbeddingRequest) returns (EmbeddingResponse)
    // EmbeddingRequest uses `chunks` field with EmbeddingChunk messages
    const chunks = texts.map((text, i) => ({
      chunkId: `chunk-${i}`,
      text,
      language: 'en',
    }));

    client.generateEmbeddings(
      { chunks, normalize: true, batchSize: texts.length, maxLength: 512 },
      { deadline },
      (err: Error | null, response: any) => {
        if (err) {
          resolve({ vectors: null, detail: err.message });
          return;
        }

        if (!response || response.status === 'error') {
          console.warn('[embedding-client] gRPC response error:', response?.status);
          resolve({ vectors: null, detail: response?.status ?? 'response error' });
          return;
        }

        // Proto: EmbeddingResponse.embeddings[] each has .vector (repeated float)
        const vectors = (response.embeddings ?? []).map((e: any) =>
          Array.isArray(e.vector) ? e.vector : Array.isArray(e.values) ? e.values : []
        );

        resolve({ vectors, detail: 'ok' });
      }
    );
  });
}

// ── QUIC/NATS embedding call ──────────────────────────────────────────────

let natsConnection: any = null;
let natsLoadFailed = false;
let natsRetryAt = 0; // Timestamp for next retry after failure
let natsFailLogged = false; // Only log first failure to avoid spam
let natsLastFailureAt = 0;
let natsLastFailureDetail: string | null = null;
let natsLastSuccessAt = 0;
const quicStateObservedSinceAt = new Date().toISOString();

function markQuicFailure(detail: string, retryDelayMs = 30_000): void {
  natsLoadFailed = true;
  natsRetryAt = Date.now() + retryDelayMs;
  natsLastFailureAt = Date.now();
  natsLastFailureDetail = detail;
}

function markQuicSuccess(): void {
  natsLoadFailed = false;
  natsRetryAt = 0;
  natsLastSuccessAt = Date.now();
}

export function getQuicEmbeddingHealth(): EmbeddingTransportHealth {
  if (!ENV.EMBEDDING_QUIC_ENABLED) {
    return {
      status: 'disabled',
      detail: 'disabled by config',
      stateScope: 'process',
      observedSinceAt: quicStateObservedSinceAt,
    };
  }

  if (natsLoadFailed) {
    return {
      status: 'degraded',
      detail: 'recent connection or request failure',
      stateScope: 'process',
      observedSinceAt: quicStateObservedSinceAt,
      retryAt: natsRetryAt > 0 ? new Date(natsRetryAt).toISOString() : undefined,
      lastFailureAt: natsLastFailureAt > 0 ? new Date(natsLastFailureAt).toISOString() : undefined,
      lastFailureDetail: natsLastFailureDetail ?? undefined,
      lastSuccessAt: natsLastSuccessAt > 0 ? new Date(natsLastSuccessAt).toISOString() : undefined,
    };
  }

  if (natsConnection) {
    return {
      status: 'ok',
      detail: 'connected',
      stateScope: 'process',
      observedSinceAt: quicStateObservedSinceAt,
      lastSuccessAt: natsLastSuccessAt > 0 ? new Date(natsLastSuccessAt).toISOString() : undefined,
      lastFailureAt: natsLastFailureAt > 0 ? new Date(natsLastFailureAt).toISOString() : undefined,
      lastFailureDetail: natsLastFailureDetail ?? undefined,
    };
  }

  return {
    status: 'degraded',
    detail: 'enabled but not yet proven healthy',
    stateScope: 'process',
    observedSinceAt: quicStateObservedSinceAt,
    lastFailureAt: natsLastFailureAt > 0 ? new Date(natsLastFailureAt).toISOString() : undefined,
    lastFailureDetail: natsLastFailureDetail ?? undefined,
    lastSuccessAt: natsLastSuccessAt > 0 ? new Date(natsLastSuccessAt).toISOString() : undefined,
  };
}

async function getNatsConnection(): Promise<any> {
  if (natsLoadFailed) {
    // Retry after 30s instead of permanent disable
    if (Date.now() < natsRetryAt) return null;
    natsLoadFailed = false;
    natsConnection = null;
  }
  if (natsConnection) return natsConnection;

  try {
    const nats = await import('nats');
    natsConnection = await nats.connect({
      servers: [ENV.NATS_URL],
      name: 'embedding-client',
      maxReconnectAttempts: 2,
      reconnectTimeWait: 500,
      timeout: 3000,
    });
    markQuicSuccess();
    return natsConnection;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!natsFailLogged) {
      console.warn('[embedding-client] NATS/QUIC init failed, will retry silently:', message);
      natsFailLogged = true;
    }
    markQuicFailure(message);
    return null;
  }
}

async function generateViaQuic(texts: string[], timeoutMs = 5000): Promise<EmbeddingCallResult> {
  const nc = await getNatsConnection();
  if (!nc) return { vectors: null, detail: 'connection unavailable' };

  try {
    const codec = {
      encode: (obj: any) => new TextEncoder().encode(JSON.stringify(obj)),
      decode: (data: Uint8Array) => JSON.parse(new TextDecoder().decode(data)),
    };

    const request = {
      texts,
      model: SERVER_EMBEDDING_MODEL,
      normalize: true,
      timestamp: Date.now(),
    };

    const msg = await nc.request('legal.embedding.request', codec.encode(request), {
      timeout: timeoutMs,
    });

    const response = codec.decode(msg.data);
    if (response.status === 'success' && Array.isArray(response.embeddings)) {
      markQuicSuccess();
      return { vectors: response.embeddings, detail: 'ok' };
    }
    const detail = response?.status ?? 'response error';
    markQuicFailure(detail);
    return { vectors: null, detail };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[embedding-client] QUIC/NATS embedding failed:', message);
    markQuicFailure(message);
    return { vectors: null, detail: message };
  }
}

// ── HTTP/Ollama fallback ───────────────────────────────────────────────────

/**
 * Batch embedding via Ollama /api/embed (input: string[] → embeddings: number[][]).
 * Falls back to sequential /api/embeddings if batch API is unavailable.
 */
async function generateViaHttp(
  texts: string[],
  options: EmbeddingOptions = {}
): Promise<{
  vectors: number[][];
  source: Extract<EmbeddingSource, 'http-ollama' | 'http-ollama-sequential'>;
  attempts: EmbeddingAttempt[];
}> {
  const attempts: EmbeddingAttempt[] = [];

  if (options.preferSequentialHttp) {
    attempts.push({
      transport: 'http-ollama',
      status: 'skipped',
      detail: 'preferSequentialHttp enabled',
    });

    const sequentialStart = performance.now();
    try {
      return {
        vectors: await generateViaHttpSingle(texts, options),
        source: 'http-ollama-sequential',
        attempts: [
          ...attempts,
          {
            transport: 'http-ollama-sequential',
            status: 'success',
            durationMs: Math.round(performance.now() - sequentialStart),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new EmbeddingGenerationError(message, [
        ...attempts,
        {
          transport: 'http-ollama-sequential',
          status: 'failed',
          detail: message,
          durationMs: Math.round(performance.now() - sequentialStart),
        },
      ]);
    }
  }

  const batchStart = performance.now();
  try {
    const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: SERVER_EMBEDDING_MODEL, input: texts }),
      signal: AbortSignal.timeout(options.httpBatchTimeoutMs ?? HTTP_BATCH_TIMEOUT_MS),
    });

    if (res.ok) {
      const data = await res.json();
      if (
        data.embeddings &&
        Array.isArray(data.embeddings) &&
        data.embeddings.length === texts.length
      ) {
        return {
          vectors: data.embeddings,
          source: 'http-ollama',
          attempts: [
            {
              transport: 'http-ollama',
              status: 'success',
              durationMs: Math.round(performance.now() - batchStart),
            },
            {
              transport: 'http-ollama-sequential',
              status: 'skipped',
              detail: 'batch embedding succeeded',
            },
          ],
        };
      }

      attempts.push({
        transport: 'http-ollama',
        status: 'failed',
        detail: `unexpected response shape${res.status ? ` (${res.status})` : ''}`,
        durationMs: Math.round(performance.now() - batchStart),
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      '[embedding-client] HTTP batch embedding failed, falling back to sequential:',
      message
    );
    attempts.push({
      transport: 'http-ollama',
      status: 'failed',
      detail: message,
      durationMs: Math.round(performance.now() - batchStart),
    });
  }

  const sequentialStart = performance.now();
  try {
    return {
      vectors: await generateViaHttpSingle(texts, options),
      source: 'http-ollama-sequential',
      attempts: [
        ...attempts,
        {
          transport: 'http-ollama-sequential',
          status: 'success',
          durationMs: Math.round(performance.now() - sequentialStart),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new EmbeddingGenerationError(message, [
      ...attempts,
      {
        transport: 'http-ollama-sequential',
        status: 'failed',
        detail: message,
        durationMs: Math.round(performance.now() - sequentialStart),
      },
    ]);
  }
}

/** Sequential fallback using old /api/embeddings (single prompt per request) */
async function generateViaHttpSingle(
  texts: string[],
  options: EmbeddingOptions = {}
): Promise<number[][]> {
  const vectors: number[][] = [];

  for (const text of texts) {
    const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: SERVER_EMBEDDING_MODEL, prompt: text }),
      signal: AbortSignal.timeout(options.httpSingleTimeoutMs ?? HTTP_SINGLE_TIMEOUT_MS),
    });

    if (!res.ok) throw new Error(`Ollama embedding failed: ${res.status}`);
    const data = await res.json();
    vectors.push(data.embedding);
  }

  return vectors;
}

// ── Public API ─────────────────────────────────────────────────────────────

// ── Redis embedding cache ──────────────────────────────────────────────────

const EMBED_CACHE_TTL = 24 * 60 * 60; // 24h — embeddings are deterministic for same model+text

async function getCachedEmbedding(text: string): Promise<number[] | null> {
  try {
    const { getRedis } = await import('../redis.js');
    const redis = getRedis();
    if (!redis) return null;
    const { createHash } = await import('crypto');
    const key = `embed:${SERVER_EMBEDDING_MODEL}:${createHash('sha256').update(text).digest('hex').slice(0, 16)}`;
    const cached = await redis.get(key);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as number[] | CachedEmbeddingEntry;
    if (Array.isArray(parsed)) return parsed;
    return Array.isArray(parsed.vector) ? parsed.vector : null;
  } catch {
    return null;
  }
}

async function getCachedEmbeddingEntry(text: string): Promise<CachedEmbeddingEntry | null> {
  console.log('--- getCachedEmbeddingEntry start:', text);
  try {
    const { getRedis } = await import('../redis.js');
    console.log('--- getCachedEmbeddingEntry got getRedis');
    const redis = getRedis();
    console.log('--- getCachedEmbeddingEntry got redis:', !!redis);
    if (!redis) return null;
    const { createHash } = await import('crypto');
    console.log('--- getCachedEmbeddingEntry got createHash');
    const key = `embed:${SERVER_EMBEDDING_MODEL}:${createHash('sha256').update(text).digest('hex').slice(0, 16)}`;
    console.log('--- getCachedEmbeddingEntry key:', key);
    const cached = await redis.get(key);
    console.log('--- getCachedEmbeddingEntry got cached:', !!cached);
    if (!cached) return null;
    const parsed = JSON.parse(cached) as number[] | CachedEmbeddingEntry;
    if (Array.isArray(parsed)) {
      return { vector: parsed, source: 'http-ollama' };
    }
    if (!Array.isArray(parsed.vector)) return null;
    return parsed;
  } catch (err) {
    console.log('--- getCachedEmbeddingEntry error for text:', text, err);
    return null;
  }
}

async function setCachedEmbedding(
  text: string,
  vector: number[],
  source: EmbeddingSource,
  qdrantTags: string[] = [],
): Promise<void> {
  try {
    const { getRedis } = await import('../redis.js');
    const redis = getRedis();
    if (!redis) return;
    const { createHash } = await import('crypto');
    const sha = createHash('sha256').update(text).digest('hex').slice(0, 16);
    const key = `embed:${SERVER_EMBEDDING_MODEL}:${sha}`;
    const entry: EmbeddingCacheEntry = {
      vector,
      source,
      model:      SERVER_EMBEDDING_MODEL,
      dimension:  vector.length,
      qdrantTags,
      queryHash:  fnv1aHash(text),
      createdAt:  new Date().toISOString(),
      hitCount:   0,
    };
    await redis.set(key, JSON.stringify(entry), 'EX', EMBED_CACHE_TTL);
  } catch {
    // Cache write failure is non-fatal
  }
}

/** FNV-1a 32-bit (same algorithm used across the codebase for queryHash). */
function fnv1aHash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < Math.min(text.length, 512); i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * Enrich an embedding vector with entity tags from the nearest-neighbor
 * Qdrant payload. Fire-and-forget — never throws. Returns top-8 tags.
 *
 * Uses the `research_summaries` conceptual space; searches whichever
 * collections are available (legal_documents, legal_canon_chunks).
 */
export async function enrichEmbeddingWithQdrantTags(
  vector: number[],
  pipeline: string = 'ace',
): Promise<string[]> {
  try {
    const { qdrant } = await import('../vector/qdrant-manager.js');
    // Search the canon plus contextual legal documents for entity_tags in payload
    const collections = ['legal_documents', 'legal_canon_chunks'];
    const tagSets = await Promise.all(
      collections.map((col) =>
        qdrant
          .hybridSearch({
            query: '',
            queryEmbedding: vector,
            collection: col,
            limit: 3,
            scoreThreshold: 0.65,
          })
          .then((res: { results: { payload?: Record<string, unknown> }[] }) =>
            res.results.flatMap((r) => (r.payload?.entity_tags as string[] | undefined) ?? [])
          )
          .catch(() => [] as string[])
      )
    );
    const allTags = [...new Set(tagSets.flat())];
    // Also pull from web:research:idx for the pipeline — these have fresh tags
    if (allTags.length < 4) {
      const { getRedis } = await import('../redis.js');
      const redis = getRedis();
      const hashes = await redis
        .zrevrange(`web:research:idx:${pipeline}`, 0, 2)
        .catch(() => [] as string[]);
      for (const h of hashes) {
        const raw = await redis.get(`web:research:sum:${h}`).catch(() => null);
        if (!raw) continue;
        try {
          const s = JSON.parse(raw) as { entityTags?: string[] };
          allTags.push(...(s.entityTags ?? []));
        } catch {
          /* */
        }
      }
    }
    return [...new Set(allTags)].slice(0, 8);
  } catch {
    return [];
  }
}

/**
 * Generate embeddings and immediately persist a rich JSONB cache entry.
 * Returned EmbeddingCacheEntry.qdrantTags can be passed to bifrostChat()
 * as `entityTags` to sharpen the Bifrost semantic cache key.
 */
export async function generateEmbeddingsWithTags(
  texts: string[],
  pipeline: string = 'ace',
  options: EmbeddingOptions = {},
): Promise<{ result: EmbeddingResult; qdrantTags: string[] }> {
  const result = await generateEmbeddings(texts, options);
  // Enrich the first text's embedding with Qdrant tags (fire-and-forget for rest)
  const qdrantTags = result.vectors[0]?.length
    ? await enrichEmbeddingWithQdrantTags(result.vectors[0], pipeline)
    : [];
  // Back-fill tags into cache entries for all texts (non-blocking)
  if (qdrantTags.length && !options.skipCacheWrite) {
    for (let i = 0; i < texts.length; i++) {
      setCachedEmbedding(texts[i], result.vectors[i], result.source, qdrantTags).catch(() => {});
    }
  }
  return { result, qdrantTags };
}

/**
 * Generate embeddings for a batch of texts.
 * Checks Redis cache first, then falls back through 4-tier chain.
 * 4-tier fallback: gRPC → QUIC/NATS → HTTP batch → HTTP sequential.
 */
export async function generateEmbeddings(
  texts: string[],
  options: EmbeddingOptions = {}
): Promise<EmbeddingResult> {
  console.log('--- generateEmbeddings texts:', texts);
  const start = performance.now();
  const attempts: EmbeddingAttempt[] = [];

  const cachedEntries = options.skipCacheRead
    ? texts.map(() => null)
    : await Promise.all(texts.map(getCachedEmbeddingEntry));

  // Check cache for each text
  const cachedResults = cachedEntries.map((entry) => entry?.vector ?? null);
  const uncachedIndices = cachedResults.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);

  // All cached — return immediately
  if (uncachedIndices.length === 0) {
    const cachedSource = cachedEntries[0]?.source ?? 'http-ollama';
    return {
      vectors: cachedResults as number[][],
      model: SERVER_EMBEDDING_MODEL,
      dimension: cachedResults[0]?.length ?? 768,
      source: cachedSource,
      totalMs: Math.round(performance.now() - start),
      cacheHit: true,
      attempts: [
        {
          transport: cachedSource,
          status: 'cache-hit',
          detail: 'embedding-cache',
        },
      ],
    };
  }

  // Generate only uncached embeddings
  const uncachedTexts = uncachedIndices.map((i) => texts[i]);
  let newVectors: number[][] | null = null;
  let source: EmbeddingResult['source'] = 'http-ollama';
  let model = SERVER_EMBEDDING_MODEL;

  // Tier 1: gRPC (binary protocol, lowest latency)
  if (ENV.EMBEDDING_GRPC_ENABLED) {
    const grpcStart = performance.now();
    const grpcResult = await generateViaGrpc(uncachedTexts);
    const grpcVectors = grpcResult.vectors;
    if (grpcVectors && grpcVectors.length === uncachedTexts.length && grpcVectors[0]?.length > 0) {
      newVectors = grpcVectors;
      source = 'grpc';
      model = 'embeddinggemma-grpc';
      attempts.push({
        transport: 'grpc',
        status: 'success',
        detail: grpcResult.detail,
        durationMs: Math.round(performance.now() - grpcStart),
      });
    } else {
      attempts.push({
        transport: 'grpc',
        status: 'failed',
        detail: grpcResult.detail ?? 'unavailable',
        durationMs: Math.round(performance.now() - grpcStart),
      });
    }
  } else {
    attempts.push({ transport: 'grpc', status: 'skipped', detail: 'disabled by config' });
  }

  // Tier 2: QUIC/NATS (HTTP/3, 0-RTT, multiplexed)
  if (!newVectors && ENV.EMBEDDING_QUIC_ENABLED) {
    const quicStart = performance.now();
    const quicResult = await generateViaQuic(uncachedTexts);
    const quicVectors = quicResult.vectors;
    if (quicVectors && quicVectors.length === uncachedTexts.length && quicVectors[0]?.length > 0) {
      newVectors = quicVectors;
      source = 'quic';
      model = 'embeddinggemma-quic';
      attempts.push({
        transport: 'quic',
        status: 'success',
        detail: quicResult.detail,
        durationMs: Math.round(performance.now() - quicStart),
      });
    } else {
      attempts.push({
        transport: 'quic',
        status: 'failed',
        detail: quicResult.detail ?? 'unavailable',
        durationMs: Math.round(performance.now() - quicStart),
      });
    }
  } else if (!newVectors) {
    attempts.push({ transport: 'quic', status: 'skipped', detail: 'disabled by config' });
  }

  // Tier 3+4: HTTP/Ollama (batch → sequential fallback)
  if (!newVectors) {
    try {
      const httpResult = await generateViaHttp(uncachedTexts, options);
      newVectors = httpResult.vectors;
      source = httpResult.source;
      attempts.push(...httpResult.attempts);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const httpAttempts =
        error instanceof EmbeddingGenerationError
          ? error.attempts
          : [
              {
                transport: 'http-ollama-sequential' as const,
                status: 'failed' as const,
                detail: message,
              },
            ];
      attempts.push(...httpAttempts);
      throw new EmbeddingGenerationError(message, attempts);
    }
  }

  // Merge cached + new, and cache new results
  const vectors = [...cachedResults] as number[][];
  for (let j = 0; j < uncachedIndices.length; j++) {
    const idx = uncachedIndices[j];
    vectors[idx] = newVectors[j];
  }

  // Fire-and-forget cache writes for new embeddings
  for (let j = 0; !options.skipCacheWrite && j < uncachedIndices.length; j++) {
    setCachedEmbedding(texts[uncachedIndices[j]], newVectors[j], source).catch(() => {});
  }

  return {
    vectors,
    model,
    dimension: vectors[0]?.length ?? 768,
    source,
    totalMs: Math.round(performance.now() - start),
    cacheHit: false,
    attempts,
  };
}

/**
 * Generate a single embedding (convenience wrapper).
 */
export async function generateSingleEmbedding(text: string): Promise<number[]> {
  const result = await generateEmbeddings([text]);
  return result.vectors[0];
}

/**
 * Single-text nullable embedding — drop-in replacement for embeddings-simple.generateEmbedding().
 * Returns null on empty input or failure, compatible with null-check call sites.
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
  if (!text?.trim()) return null;
  try {
    const result = await generateEmbeddings([text]);
    return result.vectors[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Check gRPC service health.
 */
export async function checkGrpcHealth(): Promise<{
  available: boolean;
  enabled: boolean;
  url: string;
  status?: string;
  device?: string;
}> {
  const base = {
    enabled: ENV.EMBEDDING_GRPC_ENABLED,
    url: ENV.EMBEDDING_GRPC_URL,
  };

  if (!ENV.EMBEDDING_GRPC_ENABLED) {
    return { ...base, available: false };
  }

  const client = await getGrpcClient();
  if (!client) {
    return { ...base, available: false };
  }

  const healthMethod = getGrpcMethod(client, ['health', 'healthCheck', 'Health', 'HealthCheck']);
  if (!healthMethod) {
    return { ...base, available: false, status: 'unavailable' };
  }

  return new Promise((resolve) => {
    const deadline = new Date(Date.now() + 3000);
    const request = healthMethod.name.toLowerCase().includes('healthcheck')
      ? { checkGpu: true, checkRedis: true }
      : { service: 'embedding' };

    healthMethod(request, { deadline }, (err: Error | null, response: any) => {
      if (err) {
        resolve({ ...base, available: false });
        return;
      }
      resolve({
        ...base,
        available: response.healthy === true || response.status === 'healthy',
        status: response.status ?? (response.healthy ? 'healthy' : 'unhealthy'),
        device: response.device ?? (response.gpuAvailable ? 'cuda' : 'cpu'),
      });
    });
  });
}
