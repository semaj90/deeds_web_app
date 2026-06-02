/**
 * RediSearch L1.5 semantic cache
 *
 * Sits between Redis exact-match (L1, ~0ms) and Qdrant (L2, ~15ms).
 * Uses redis-stack-server's built-in vector search — no extra service.
 *
 * FLAT index: brute-force O(n), ~1-5ms for ≤50K cached entries.
 * Switch to HNSW once the cache grows beyond ~100K entries.
 *
 * Key layout:
 *   bifrost:sem:<sha256>        HASH — stores model, response, vec
 *
 * Index:
 *   bifrost:semantic:idx        FT index on the hash prefix above
 */

import type Redis from 'ioredis';
import { createHash } from 'node:crypto';

const INDEX_NAME  = 'bifrost:semantic:idx';
const KEY_PREFIX  = 'bifrost:sem:';
const DIM         = 768;
export const REDIS_SEMANTIC_THRESHOLD = 0.82; // cosine similarity (same as Qdrant L2)
export type SemanticCacheProvenance = {
  sourceRefs?: readonly string[];
  featureId?: string | null;
  primarySourceRef?: string | null;
  parentAtlasCardId?: string | null;
  queryHash?: string | null;
  source?: string | null;
};

export type SemanticCacheTuple = readonly [
  schemaVersion: 1,
  cacheKey: string,
  model: string,
  responseHash: string,
  sourceRefs: readonly string[],
  featureId: string | null,
  primarySourceRef: string | null,
  parentAtlasCardId: string | null,
  queryHash: string | null,
];

function isSemanticCacheTuple(value: unknown): value is SemanticCacheTuple {
  return (
    Array.isArray(value) &&
    value.length === 9 &&
    value[0] === 1 &&
    typeof value[1] === 'string' &&
    typeof value[2] === 'string' &&
    typeof value[3] === 'string' &&
    Array.isArray(value[4]) &&
    value[4].every((ref) => typeof ref === 'string') &&
    (typeof value[5] === 'string' || value[5] === null) &&
    (typeof value[6] === 'string' || value[6] === null) &&
    (typeof value[7] === 'string' || value[7] === null) &&
    (typeof value[8] === 'string' || value[8] === null)
  );
}

// ── Index bootstrap ──────────────────────────────────────────────────────────

let _indexEnsured = false;

export async function ensureSemanticIndex(redis: Redis): Promise<void> {
	if (_indexEnsured) return;
	try {
		await redis.call('FT.INFO', INDEX_NAME);
		_indexEnsured = true;
	} catch {
		// Index doesn't exist — create it
		await redis.call(
			'FT.CREATE', INDEX_NAME,
			'ON', 'HASH',
			'PREFIX', '1', KEY_PREFIX,
			'SCHEMA',
			'model',    'TAG',
			'response', 'TEXT',      // stored but not FT-searched directly
			'vec',      'VECTOR', 'FLAT', '6',
			            'TYPE', 'FLOAT32',
			            'DIM',  String(DIM),
			            'DISTANCE_METRIC', 'COSINE',
		);
		_indexEnsured = true;
		console.log('[RediSearch] Created bifrost:semantic:idx (FLAT 768-d COSINE)');
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function embeddingToBytes(vec: Float32Array | number[]): Buffer {
	const arr = vec instanceof Float32Array ? vec : new Float32Array(vec);
	return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

function keyFor(embedding: Float32Array | number[]): string {
	const arr = embedding instanceof Float32Array ? embedding : new Float32Array(embedding);
	const hash = createHash('sha256')
		.update(Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength))
		.digest('hex')
		.slice(0, 16);
	return `${KEY_PREFIX}${hash}`;
}

function responseHash(response: string): string {
  return createHash('sha256').update(response).digest('hex');
}

export function semanticTupleKey(cacheKey: string): string {
  return `${cacheKey}:tuple`;
}

export function exactSemanticTupleKey(promptHash: string, model: string): string {
  return `${KEY_PREFIX}exact:${promptHash}:${model}:tuple`;
}

export function buildSemanticCacheTuple(params: {
  cacheKey: string;
  model: string;
  response: string;
  provenance?: SemanticCacheProvenance;
}): SemanticCacheTuple {
  const provenance = params.provenance ?? {};
  return [
    1,
    params.cacheKey,
    params.model,
    responseHash(params.response),
    [...new Set((provenance.sourceRefs ?? []).map((ref) => String(ref).trim()).filter(Boolean))],
    provenance.featureId ?? null,
    provenance.primarySourceRef ?? null,
    provenance.parentAtlasCardId ?? null,
    provenance.queryHash ?? null,
  ] as const;
}

export function buildExactSemanticCacheTuple(params: {
  promptHash: string;
  model: string;
  response: string;
  provenance?: SemanticCacheProvenance;
}): SemanticCacheTuple {
  return buildSemanticCacheTuple({
    cacheKey: exactSemanticTupleKey(params.promptHash, params.model),
    model: params.model,
    response: params.response,
    provenance: {
      ...params.provenance,
      queryHash: params.provenance?.queryHash ?? params.promptHash,
    },
  });
}

export async function getExactSemanticCacheTuple(
  redis: Redis,
  promptHash: string,
  model: string
): Promise<SemanticCacheTuple | null> {
  try {
    const raw = await redis.get(exactSemanticTupleKey(promptHash, model));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isSemanticCacheTuple(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function storeExactSemanticCacheTuple(
  redis: Redis,
  promptHash: string,
  model: string,
  response: string,
  provenance: SemanticCacheProvenance = {},
  ttlSeconds = 7200
): Promise<void> {
  try {
    const tuple = buildExactSemanticCacheTuple({
      promptHash,
      model,
      response,
      provenance,
    });
    await redis.set(exactSemanticTupleKey(promptHash, model), JSON.stringify(tuple), 'EX', String(ttlSeconds));
  } catch (err) {
    console.warn('[RediSearch] exact tuple store error:', String((err as Error)?.message ?? err).slice(0, 80));
  }
}

// ── Search ────────────────────────────────────────────────────────────────────

export interface SemanticHit {
	response: string;
	score:    number; // 0-1, higher = more similar (1 - cosine_distance)
  cacheKey?: string;
  tuple?: SemanticCacheTuple | null;
}

/**
 * Search for a semantically similar cached response.
 * Returns null on miss or if RediSearch is unavailable.
 */
export async function searchSemanticCache(
	redis: Redis,
	embedding: Float32Array | number[],
	model: string,
	threshold = REDIS_SEMANTIC_THRESHOLD,
): Promise<SemanticHit | null> {
	try {
    await ensureSemanticIndex(redis);

    const vecBytes = embeddingToBytes(embedding);
    // KNN 1 over the semantic cache index.
    // Model gating is handled by similarity threshold and upstream prompt hash checks.
    const query = `*=>[KNN 1 @vec $vec AS __score]`;

    const raw = (await (redis as any).call(
      'FT.SEARCH',
      INDEX_NAME,
      query,
      'PARAMS',
      '2',
      'vec',
      vecBytes,
      'RETURN',
      '2',
      'response',
      '__score',
      'SORTBY',
      '__score',
      'ASC', // ASC = closest first (cosine distance 0..2)
      'LIMIT',
      '0',
      '1',
      'DIALECT',
      '2'
    )) as unknown[];

    const count = Number(raw[0]);
    if (count === 0) return null;

    // raw: [count, key, [field, value, ...], ...]
    const cacheKey = String(raw[1] ?? '');
    const fields = raw[2] as string[];
    const idx = (f: string) => fields.indexOf(f);
    const resp = fields[idx('response') + 1];
    // RediSearch returns cosine *distance* (0 = identical, 2 = opposite)
    const dist = parseFloat(fields[idx('__score') + 1] ?? '2');
    const score = 1 - dist / 2; // convert to similarity 0-1

    if (!resp || score < threshold) return null;
    const tuple = cacheKey ? await redis.get(semanticTupleKey(cacheKey)).catch(() => null) : null;
    let parsedTuple: SemanticCacheTuple | null = null;
    if (tuple) {
      try {
        const parsed = JSON.parse(tuple) as unknown;
        parsedTuple = isSemanticCacheTuple(parsed) ? parsed : null;
      } catch {
        parsedTuple = null;
      }
    }
    return { response: resp, score, cacheKey, tuple: parsedTuple };
  } catch (err: unknown) {
		// RediSearch unavailable — degrade silently to Qdrant L2
		const msg = String((err as Error)?.message ?? err);
		if (!msg.includes('Unknown Index name')) {
			console.warn('[RediSearch] search error (degrading to L2):', msg.slice(0, 120));
		}
		return null;
	}
}

// ── Store ─────────────────────────────────────────────────────────────────────

/**
 * Store a response in the RediSearch L1.5 cache.
 * Fire-and-forget — never blocks the caller.
 */
export async function storeSemanticCache(
	redis: Redis,
	embedding: Float32Array | number[],
	response: string,
	model: string,
  provenance: SemanticCacheProvenance = {},
	ttlSeconds = 7200,
): Promise<void> {
	try {
		await ensureSemanticIndex(redis);
		const key      = keyFor(embedding);
		const vecBytes = embeddingToBytes(embedding);
    const tuple = buildSemanticCacheTuple({
      cacheKey: key,
      model,
      response,
      provenance,
    });

		await redis.call(
			'HSET', key,
			'model',    model,
			'response', response,
			'vec',      vecBytes,
		);
		await redis.call('EXPIRE', key, String(ttlSeconds));
    await redis.set(semanticTupleKey(key), JSON.stringify(tuple), 'EX', String(ttlSeconds));
	} catch (err) {
		// Non-fatal — Qdrant L2 is still written
		console.warn('[RediSearch] store error:', String((err as Error)?.message ?? err).slice(0, 80));
	}
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getSemanticCacheStats(redis: Redis): Promise<{
	indexedDocs: number;
	indexName:   string;
	available:   boolean;
}> {
	try {
		const info = await (redis as any).call('FT.INFO', INDEX_NAME) as unknown[];
		// FT.INFO returns flat alternating key-value array
		const flat = info as string[];
		const numDocs = Number(flat[flat.indexOf('num_docs') + 1] ?? 0);
		return { indexedDocs: numDocs, indexName: INDEX_NAME, available: true };
	} catch {
		return { indexedDocs: 0, indexName: INDEX_NAME, available: false };
	}
}
