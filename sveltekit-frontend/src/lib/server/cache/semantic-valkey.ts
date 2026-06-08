/**
 * Semantic Valkey Prompt Cache
 *
 * Separate from bifrost:sem:* (which caches LLM completions by query embedding).
 * This module caches OpenCode/agent *prompts* and rule cards with:
 *   - Exact SHA-256 L0 lookup (0ms)
 *   - Vector FT.SEARCH L1.5 via Valkey Search HNSW index (~2ms)
 *   - OpenCode rule/fix/sourceRef card storage
 *
 * Index name:  prompt:sem:idx
 * Key prefix:  prompt:sem:v1:*  (packets)
 *              prompt:vec:v1:*  (vector field, co-located in same HASH)
 *              opencode:rule:v1:*
 *              opencode:fix:v1:*
 *              opencode:file:v1:*
 *
 * Stored as Valkey HASH so FT.CREATE ON HASH can index them.
 * Vector field name: "vec" — Float32, 768-dim, cosine distance.
 */

import type Redis from 'ioredis';
import {
  type SemanticPromptPacket,
  packetToHash,
  hashToPacket,
  promptSemKey,
  exactKey,
  routeKey,
  STATS_KEY,
  OPENCODE_RULE_PREFIX,
  OPENCODE_FIX_PREFIX,
  OPENCODE_FILE_PREFIX,
  SEMANTIC_HIT_SCORE,
  SEMANTIC_CTX_SCORE,
  type RouterDecision,
} from '$lib/server/ai/prompt-packet.js';

// ── Index config ──────────────────────────────────────────────────────────────

const INDEX_NAME = 'prompt:sem:idx';
const KEY_PREFIX = 'prompt:sem:v1:';
const DIM = 768;

let _indexEnsured = false;

export async function ensurePromptIndex(redis: Redis): Promise<void> {
  if (_indexEnsured) return;
  try {
    await redis.call('FT.INFO', INDEX_NAME);
    _indexEnsured = true;
  } catch {
    // Create HNSW index — better for growing prompt caches than FLAT
    await redis.call(
      'FT.CREATE', INDEX_NAME,
      'ON', 'HASH',
      'PREFIX', '1', KEY_PREFIX,
      'SCHEMA',
      'kind',  'TAG',
      'tags',  'TAG',  'SEPARATOR', ',',
      'model', 'TAG',
      'vec',   'VECTOR', 'HNSW', '10',
               'TYPE', 'FLOAT32',
               'DIM', String(DIM),
               'DISTANCE_METRIC', 'COSINE',
               'M', '16',
               'EF_CONSTRUCTION', '200',
    );
    _indexEnsured = true;
  }
}

// ── Write ─────────────────────────────────────────────────────────────────────

/**
 * Store a SemanticPromptPacket in Valkey.
 * Also writes the exact-match key (prompt:exact:v1:{inputHash}).
 * embedding must be Float32Array of length 768.
 */
export async function writePromptPacket(
  redis: Redis,
  packet: SemanticPromptPacket,
  embedding: Float32Array,
): Promise<void> {
  await ensurePromptIndex(redis);

  const hashKey = promptSemKey(packet.id);
  const fields = packetToHash(packet);

  const pipeline = redis.pipeline();

  // Store the semantic packet HASH (fields + vec for FT.SEARCH)
  pipeline.hset(hashKey, {
    ...fields,
    vec: Buffer.from(embedding.buffer),
  });
  pipeline.expire(hashKey, packet.ttlSeconds);

  // Store the exact-match shortcut (plain string, just the answer)
  if (packet.answer) {
    pipeline.set(exactKey(packet.inputHash), packet.answer, 'EX', packet.ttlSeconds);
  }

  await pipeline.exec();
}

/**
 * Write an OpenCode rule/fix/file card (no embedding — TAG-only lookup).
 * These are looked up by key prefix + topic, not by vector search.
 */
export async function writeOpenCodeCard(
  redis: Redis,
  key: string,
  card: {
    kind: 'rule' | 'fix' | 'source_ref';
    topic: string;
    summary: string;
    tags: string[];
    sourceRefs?: string[];
    ttlSeconds?: number;
  },
): Promise<void> {
  const ttl = card.ttlSeconds ?? 86_400; // 24h default
  const pipeline = redis.pipeline();
  pipeline.hset(key, {
    kind: card.kind,
    topic: card.topic,
    summary: card.summary,
    tags: JSON.stringify(card.tags),
    sourceRefs: JSON.stringify(card.sourceRefs ?? []),
  });
  pipeline.expire(key, ttl);
  await pipeline.exec();
}

// ── Read ──────────────────────────────────────────────────────────────────────

/** L0 exact-match lookup — 0ms when warm. */
export async function getExactMatch(
  redis: Redis,
  inputHash: string,
): Promise<string | null> {
  return redis.get(exactKey(inputHash));
}

/** Store an exact-match answer string keyed by SHA-256 hash. */
export async function setExactMatch(
  redis: Redis,
  inputHash: string,
  answer: string,
  ttlSeconds = 3600,
): Promise<void> {
  await redis.set(exactKey(inputHash), answer, 'EX', ttlSeconds);
}

/** Get a cached router decision so re-embedding is skipped for repeat prompts. */
export async function getCachedRouterDecision(
  redis: Redis,
  inputHash: string,
): Promise<RouterDecision | null> {
  const v = await redis.get(routeKey(inputHash));
  return v as RouterDecision | null;
}

export async function setCachedRouterDecision(
  redis: Redis,
  inputHash: string,
  decision: RouterDecision,
  ttlSeconds = 3600,
): Promise<void> {
  await redis.set(routeKey(inputHash), decision, 'EX', ttlSeconds);
}

/** Read an OpenCode card by its full key. */
export async function getOpenCodeCard(
  redis: Redis,
  key: string,
): Promise<{ kind: string; topic: string; summary: string; tags: string[]; sourceRefs: string[] } | null> {
  const h = await redis.hgetall(key);
  if (!h || !h.kind) return null;
  return {
    kind: h.kind,
    topic: h.topic ?? '',
    summary: h.summary ?? '',
    tags: safeParseArray(h.tags),
    sourceRefs: safeParseArray(h.sourceRefs),
  };
}

// ── Semantic vector search ────────────────────────────────────────────────────

export interface SemanticSearchResult {
  packet: SemanticPromptPacket;
  score: number;   // cosine similarity 0–1
}

/**
 * KNN semantic search over prompt:sem:v1:* keys.
 * Returns top-k results sorted by cosine similarity descending.
 *
 * Pre-filters by `kind` TAG when provided (e.g. 'prompt', 'fix', 'rule').
 */
export async function searchSimilarPackets(
  redis: Redis,
  queryEmbedding: Float32Array,
  opts: { k?: number; kind?: string; minScore?: number } = {},
): Promise<SemanticSearchResult[]> {
  await ensurePromptIndex(redis);

  const k = opts.k ?? 10;
  const minScore = opts.minScore ?? SEMANTIC_CTX_SCORE;

  const vecBuf = Buffer.from(queryEmbedding.buffer);

  // Build FT.SEARCH query
  const filterExpr = opts.kind
    ? `(@kind:{${opts.kind}})=>[KNN ${k} @vec $BLOB AS __score]`
    : `*=>[KNN ${k} @vec $BLOB AS __score]`;

  let rawResult: unknown;
  try {
    rawResult = await redis.call(
      'FT.SEARCH', INDEX_NAME,
      filterExpr,
      'PARAMS', '2', 'BLOB', vecBuf,
      'SORTBY', '__score', 'ASC',
      'DIALECT', '2',
      'RETURN', '12',
        'id', 'kind', 'inputHash', 'normalizedPrompt',
        'summary', 'tags', 'sourceRefs', 'model',
        'answer', 'createdAt', 'ttlSeconds', '__score',
    );
  } catch {
    return [];
  }

  return parseKnnResults(rawResult, minScore);
}

function parseKnnResults(raw: unknown, minScore: number): SemanticSearchResult[] {
  if (!Array.isArray(raw) || raw.length < 1) return [];

  const results: SemanticSearchResult[] = [];
  // Format: [count, key1, [fields…], key2, [fields…], …]
  for (let i = 1; i < raw.length; i += 2) {
    const fields = raw[i + 1] as string[];
    if (!Array.isArray(fields)) continue;

    const obj: Record<string, string> = {};
    for (let j = 0; j < fields.length; j += 2) {
      obj[fields[j]] = fields[j + 1];
    }

    // Valkey FT.SEARCH cosine distance = 1 - similarity; convert to similarity
    const dist = parseFloat(obj['__score'] ?? '1');
    const similarity = 1 - dist;

    if (similarity < minScore) continue;

    const packet = hashToPacket(obj);
    packet.score = similarity;
    results.push({ packet, score: similarity });
  }

  return results.sort((a, b) => b.score - a.score);
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function incrementStat(
  redis: Redis,
  field: 'exact_hits' | 'semantic_hits' | 'context_injections' | 'model_calls' | 'misses',
): Promise<void> {
  await redis.hincrby(STATS_KEY, field, 1);
}

export async function getStats(redis: Redis): Promise<Record<string, number>> {
  const h = await redis.hgetall(STATS_KEY);
  if (!h) return {};
  return Object.fromEntries(
    Object.entries(h).map(([k, v]) => [k, Number(v)]),
  );
}

// ── OpenCode card helpers ─────────────────────────────────────────────────────

/**
 * Scan all rule cards matching a topic prefix.
 * Uses SCAN MATCH — suitable for small cardinality opencode:rule:* sets.
 */
export async function listOpenCodeRules(
  redis: Redis,
  prefixFilter?: string,
): Promise<Array<{ key: string; summary: string; tags: string[] }>> {
  const pattern = prefixFilter
    ? `${OPENCODE_RULE_PREFIX}*${prefixFilter}*`
    : `${OPENCODE_RULE_PREFIX}*`;

  const keys = await scanKeys(redis, pattern);
  if (!keys.length) return [];

  const pipeline = redis.pipeline();
  for (const k of keys) {
    pipeline.hmget(k, 'summary', 'tags');
  }
  const results = await pipeline.exec();
  if (!results) return [];

  return results.flatMap(([, vals], i) => {
    const [summary, tagsRaw] = vals as [string | null, string | null];
    if (!summary) return [];
    return [{ key: keys[i], summary, tags: safeParseArray(tagsRaw ?? '') }];
  });
}

export async function listOpenCodeFixes(redis: Redis): Promise<string[]> {
  return scanKeys(redis, `${OPENCODE_FIX_PREFIX}*`);
}

export async function listOpenCodeFiles(redis: Redis): Promise<string[]> {
  return scanKeys(redis, `${OPENCODE_FILE_PREFIX}*`);
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function scanKeys(redis: Redis, pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', '200');
    cursor = next;
    keys.push(...batch);
  } while (cursor !== '0');
  return keys;
}

function safeParseArray(raw: string | undefined): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; } catch { return []; }
}

// ── Re-export decision thresholds for consumers ───────────────────────────────
export { SEMANTIC_HIT_SCORE, SEMANTIC_CTX_SCORE };
