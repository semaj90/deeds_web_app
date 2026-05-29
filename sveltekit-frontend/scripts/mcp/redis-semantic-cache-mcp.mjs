#!/usr/bin/env node
/**
 * redis-semantic-cache-mcp.mjs — MCP server for semantic caching with Redis + Qdrant fallback
 *
 * Three tools:
 *   semantic_search          — Query → Redis hash cache → Qdrant ANN fallback
 *   cache_embedding          — Embed and store text in Redis with TTL
 *   get_cache_stats          — Cache hit rates and performance metrics
 *
 * Raw newline-delimited JSON-RPC 2.0 (no SDK dependency).
 */

import { createInterface } from 'node:readline';
import { SemanticRedisCache } from '../lib/redis-semantic.mjs';

const log = (...a) => process.stderr.write('[semantic-cache-mcp] ' + a.join(' ') + '\n');

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'redis-semantic-cache', version: '0.1.0' };

let cache = null;
let stats = { hits: 0, misses: 0, embeddings: 0, errors: 0 };

// ── Tool definitions ───────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'semantic_search',
    description:
      'Semantic search with Redis cache + Qdrant ANN fallback. Returns top-K results with source ' +
      '(redis_cache or qdrant_fallback), latency, and cache hit flag.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language query to search for.' },
        collection: { type: 'string', description: 'Qdrant collection name (default: codebase_chunks_768).' },
        limit: { type: 'number', description: 'Max results to return (1-50, default 10).' },
        cacheHashKey: { type: 'string', description: 'Redis hash key for cache (default: semantic_cache:queries).' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'cache_embedding',
    description:
      'Embed text and store in Redis hash with TTL. Useful for pre-caching frequent queries.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to embed and cache.' },
        hashKey: { type: 'string', description: 'Redis hash key name.' },
        ttlSeconds: { type: 'number', description: 'Cache TTL in seconds (default 3600).' },
      },
      required: ['text', 'hashKey'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_cache_stats',
    description: 'Get cache hit rates, miss counts, and performance metrics.',
    inputSchema: {
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
];

// ── Tool implementations ────────────────────────────────────────────────────────

async function semanticSearch({ query, collection = 'codebase_chunks_768', limit = 10, cacheHashKey = 'semantic_cache:queries' }) {
  if (!cache) {
    stats.errors++;
    return { ok: false, error: 'Cache not initialized', source: 'error' };
  }

  try {
    const start = Date.now();
    const result = await cache.semanticSearch(query, collection, limit, cacheHashKey);
    const latencyMs = Date.now() - start;

    if (result.cached) {
      stats.hits++;
    } else {
      stats.misses++;
    }

    return {
      ok: true,
      query,
      collection,
      source: result.source,
      cached: result.cached,
      latencyMs,
      resultCount: result.results?.length ?? 0,
      results: result.results?.slice(0, 5).map(r => ({
        id: r.id,
        score: r.score,
        payload: r.payload ? { text: (r.payload.text ?? '').slice(0, 100) } : null,
      })) ?? [],
    };
  } catch (e) {
    stats.errors++;
    return { ok: false, error: e.message, source: 'error' };
  }
}

async function cacheEmbedding({ text, hashKey, ttlSeconds = 3600 }) {
  if (!cache) {
    stats.errors++;
    return { ok: false, error: 'Cache not initialized', source: 'error' };
  }

  try {
    const start = Date.now();
    const embedding = await cache.embedText(text);
    const result = await cache.cacheEmbedding(hashKey, text, embedding, ttlSeconds);
    const latencyMs = Date.now() - start;

    stats.embeddings++;

    return {
      ok: true,
      hashKey,
      textLength: text.length,
      embeddingDim: embedding?.length ?? 0,
      ttlSeconds,
      latencyMs,
      cached: !!result,
    };
  } catch (e) {
    stats.errors++;
    return { ok: false, error: e.message, source: 'error' };
  }
}

function getCacheStats() {
  const total = stats.hits + stats.misses;
  const hitRate = total > 0 ? ((stats.hits / total) * 100).toFixed(1) : 'N/A';

  return {
    ok: true,
    stats: {
      hits: stats.hits,
      misses: stats.misses,
      total,
      hitRate: hitRate + '%',
      embeddings: stats.embeddings,
      errors: stats.errors,
    },
  };
}

// ── JSON-RPC dispatch ──────────────────────────────────────────────────────────

async function dispatch(method, params, id) {
  if (method === 'initialize') {
    // Lazy-init cache on first request
    if (!cache) {
      try {
        cache = new SemanticRedisCache();
        await cache.connect();
      } catch (e) {
        log('Failed to initialize cache:', e.message);
      }
    }
    return { protocolVersion: PROTOCOL_VERSION, serverInfo: SERVER_INFO, capabilities: { tools: {} } };
  }
  if (method === 'notifications/initialized') return null;
  if (method === 'tools/list') {
    return { tools: TOOLS };
  }
  if (method === 'tools/call') {
    const { name, arguments: args = {} } = params ?? {};
    try {
      let result;
      if (name === 'semantic_search') result = await semanticSearch(args);
      else if (name === 'cache_embedding') result = await cacheEmbedding(args);
      else if (name === 'get_cache_stats') result = getCacheStats();
      else throw new Error(`Unknown tool: ${name}`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }], isError: true };
    }
  }
  throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
}

// ── Stdio loop ─────────────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }

  const { method, params, id } = msg;
  const isNotif = id === undefined || id === null;

  try {
    const result = await dispatch(method, params, id);
    if (isNotif || result === null) return;
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
  } catch (e) {
    if (isNotif) return;
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0', id,
      error: { code: e.code ?? -32603, message: e.message },
    }) + '\n');
  }
});

log('redis-semantic-cache MCP ready (semantic_search, cache_embedding, get_cache_stats)');