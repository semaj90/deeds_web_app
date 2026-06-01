#!/usr/bin/env node
/**
 * Engram Embed MCP Server
 * 
 * Exposes 768-dim embedding, Bifrost ingestion, ACE packet injection,
 * and user chat memory store as MCP tools.
 *
 * Transport chain:
 *   gRPC :50051 → QUIC/NATS :4222 → HTTP batch /api/embed → HTTP sequential /api/embeddings
 *
 * Backed by: embeddinggemma:latest via Ollama :11434
 * 
 * Start: node scripts/mcp/engram-embed-mcp.mjs
 * Health: node scripts/mcp/engram-embed-mcp.mjs --health
 */

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';

const PORT = parseInt(process.env.ENGRAM_MCP_PORT ?? '8792', 10);
const OLLAMA_URL = process.env.OLLAMA_URL ?? process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';
const EMBED_DIM = 768;
let redisClient = null;
let redisClientPromise = null;

async function getRedis() {
  if (redisClient) return redisClient;
  if (redisClientPromise) return redisClientPromise;

  redisClientPromise = (async () => {
    const { default: Redis } = await import('ioredis');
    const client = new Redis(REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
      commandTimeout: 3000,
      retryStrategy: () => null,
    });
    await client.connect();
    redisClient = client;
    return client;
  })().finally(() => {
    redisClientPromise = null;
  });

  return redisClientPromise;
}

// ── Health check mode ──────────────────────────────────────────────────────────
if (process.argv.includes('--health')) {
  // Test embed endpoint
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`);
    const data = await res.json();
    const hasEmbedModel = data.models?.some(m => m.name === EMBED_MODEL || m.name.startsWith('embeddinggemma'));
    console.log(JSON.stringify({
      status: hasEmbedModel ? 'ok' : 'warn',
      server: 'engram-embed-mcp',
      port: PORT,
      embed_model: EMBED_MODEL,
      embed_model_present: hasEmbedModel,
      ollama_url: OLLAMA_URL,
    }));
  } catch (err) {
    console.log(JSON.stringify({ status: 'error', error: err.message }));
  }
  process.exit(0);
}

// ── Embedding helper ──────────────────────────────────────────────────────────

async function embedTexts(texts) {
  // Tier 3: HTTP batch /api/embed (Ollama >=0.1.33 — preferred)
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.embeddings) && data.embeddings[0]?.length === EMBED_DIM) {
        return { vectors: data.embeddings, source: 'http-batch-embed', model: EMBED_MODEL };
      }
    }
  } catch { /* fall through */ }

  // Tier 4: HTTP sequential /api/embeddings (legacy)
  const vectors = [];
  for (const text of texts) {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.embedding) && data.embedding.length === EMBED_DIM) {
          vectors.push(data.embedding);
          continue;
        }
      }
    } catch { /* fall through */ }
    vectors.push(new Array(EMBED_DIM).fill(0)); // zero vector on failure
  }
  return { vectors, source: 'http-sequential-embeddings', model: EMBED_MODEL };
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const TOOLS = {
  'engram.embed': {
    description: `Generate 768-dim embeddings via ${EMBED_MODEL}. 4-tier fallback: gRPC→QUIC→HTTP batch→HTTP seq.`,
    inputSchema: {
      type: 'object',
      properties: {
        texts: { type: 'array', items: { type: 'string' }, description: 'Texts to embed' },
      },
      required: ['texts'],
    },
    handler: async (args) => {
      const result = await embedTexts(args.texts);
      return {
        vectors: result.vectors,
        model: result.model,
        dimension: EMBED_DIM,
        source: result.source,
        count: result.vectors.length,
      };
    },
  },

  'engram.bifrost_ingest': {
    description: 'Embed text + upsert to Qdrant codebase_chunks_768 + prime Bifrost L2 cache',
    inputSchema: {
      type: 'object',
      properties: {
        chunk_id: { type: 'string' },
        text: { type: 'string' },
        labels: { type: 'object', description: 'Structural label metadata to attach' },
        collection: { type: 'string', default: 'codebase_chunks_768' },
      },
      required: ['chunk_id', 'text'],
    },
    handler: async (args) => {
      const embedResult = await embedTexts([args.text]);
      const vector = embedResult.vectors[0];
      if (!vector || vector.length !== EMBED_DIM) {
        return { ok: false, error: 'Embedding failed or wrong dimension', source: embedResult.source };
      }

      const collection = args.collection ?? 'codebase_chunks_768';
      const pointId = createHash('sha1').update(args.chunk_id).digest('hex').slice(0, 16);

      try {
        const res = await fetch(`${QDRANT_URL}/collections/${collection}/points`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            points: [{
              id: pointId,
              vector,
              payload: {
                chunk_id: args.chunk_id,
                ...(args.labels ?? {}),
                ingested_by: 'engram-embed-mcp',
                ingested_at: new Date().toISOString(),
              },
            }],
          }),
          signal: AbortSignal.timeout(15_000),
        });
        return {
          ok: res.ok,
          chunk_id: args.chunk_id,
          point_id: pointId,
          collection,
          source: embedResult.source,
          qdrant_status: res.status,
        };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
  },

  'engram.ace_packet_inject': {
    description: 'Write ACE context packet to Redis with 1h TTL: ace:packet:{runId}',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string' },
        context_blob: { type: 'string', description: 'Serialized ACE context or compressed card' },
        ttl_seconds: { type: 'number', default: 3600 },
      },
      required: ['run_id', 'context_blob'],
    },
    handler: async (args) => {
      const key = `ace:packet:${args.run_id}`;
      const ttl = args.ttl_seconds ?? 3600;
      const sizeBytes = Buffer.byteLength(args.context_blob, 'utf8');
      try {
        const redis = await getRedis();
        await redis.set(key, args.context_blob, 'EX', ttl);
        const [exists, storedTtl, storedSize] = await Promise.all([
          redis.exists(key),
          redis.ttl(key),
          redis.strlen(key),
        ]);
        return {
          ok: exists === 1,
          key,
          ttl,
          stored_ttl: storedTtl,
          size_bytes: sizeBytes,
          stored_size_bytes: storedSize,
          status: 'written',
        };
      } catch (err) {
        return {
          ok: false,
          key,
          ttl,
          size_bytes: sizeBytes,
          error: err instanceof Error ? err.message : String(err),
          status: 'degraded',
        };
      }
    },
  },

  'engram.ace_packet_read': {
    description: 'Read back an ACE context packet from Redis: ace:packet:{runId}',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string' },
      },
      required: ['run_id'],
    },
    handler: async (args) => {
      const key = `ace:packet:${args.run_id}`;
      try {
        const redis = await getRedis();
        const [value, ttl] = await Promise.all([redis.get(key), redis.ttl(key)]);
        return {
          ok: value !== null,
          key,
          ttl,
          size_bytes: value ? Buffer.byteLength(value, 'utf8') : 0,
          context_blob: value,
          status: value === null ? 'miss' : 'hit',
        };
      } catch (err) {
        return {
          ok: false,
          key,
          error: err instanceof Error ? err.message : String(err),
          status: 'degraded',
        };
      }
    },
  },

  'engram.chat_memory_recent': {
    description: 'Read recent chat memory turns from Redis sorted set: user:memory:{userId}',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        limit: { type: 'number', default: 10 },
      },
      required: ['user_id'],
    },
    handler: async (args) => {
      const key = `user:memory:${args.user_id}`;
      const limit = Math.max(1, Math.min(args.limit ?? 10, 100));
      try {
        const redis = await getRedis();
        const rows = await redis.zrevrange(key, 0, limit - 1, 'WITHSCORES');
        const turns = [];
        for (let i = 0; i < rows.length; i += 2) {
          const raw = rows[i];
          const score = Number(rows[i + 1]);
          try {
            turns.push({ score, turn: JSON.parse(raw) });
          } catch {
            turns.push({ score, turn: raw });
          }
        }
        return {
          ok: true,
          redis_key: key,
          count: turns.length,
          turns,
          status: 'read',
        };
      } catch (err) {
        return {
          ok: false,
          redis_key: key,
          error: err instanceof Error ? err.message : String(err),
          status: 'degraded',
        };
      }
    },
  },

  'engram.redis_health': {
    description: 'Check Redis availability used by Engram memory tools',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      try {
        const redis = await getRedis();
        const pong = await redis.ping();
        return { ok: pong === 'PONG', redis_url: REDIS_URL, pong };
      } catch (err) {
        return { ok: false, redis_url: REDIS_URL, error: err instanceof Error ? err.message : String(err) };
      }
    },
  },

  'engram.chat_memory_store': {
    description: 'Append a chat turn to user memory store (Redis sorted set + bounded trim)',
    inputSchema: {
      type: 'object',
      properties: {
        user_id: { type: 'string' },
        turn: {
          type: 'object',
          properties: {
            role: { type: 'string', enum: ['user', 'assistant', 'system'] },
            content: { type: 'string' },
            metadata: { type: 'object' },
          },
          required: ['role', 'content'],
        },
        max_turns: { type: 'number', default: 50 },
        ttl_seconds: { type: 'number', default: 604800 },
      },
      required: ['user_id', 'turn'],
    },
    handler: async (args) => {
      const key = `user:memory:${args.user_id}`;
      const score = Date.now();
      const maxTurns = Math.max(1, Math.min(args.max_turns ?? 50, 500));
      const ttl = args.ttl_seconds ?? 604800;
      const member = JSON.stringify({ ...args.turn, ts: score });
      try {
        const redis = await getRedis();
        await redis
          .multi()
          .zadd(key, score, member)
          .zremrangebyrank(key, 0, -(maxTurns + 1))
          .expire(key, ttl)
          .exec();
        const count = await redis.zcard(key);
        return {
          ok: true,
          redis_key: key,
          score,
          member_size: member.length,
          max_turns: maxTurns,
          count,
          ttl,
          status: 'written',
        };
      } catch (err) {
        return {
          ok: false,
          redis_key: key,
          score,
          member_size: member.length,
          max_turns: maxTurns,
          ttl,
          error: err instanceof Error ? err.message : String(err),
          status: 'degraded',
        };
      }
    },
  },

  'engram.health': {
    description: 'Check embedding service health and model availability',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      try {
        const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
        const data = await res.json();
        const models = data.models?.map(m => m.name) ?? [];
        const hasEmbedModel = models.some(n => n.startsWith('embeddinggemma'));
        return {
          ollama_ok: res.ok,
          embed_model: EMBED_MODEL,
          embed_model_present: hasEmbedModel,
          models_available: models,
          qdrant_url: QDRANT_URL,
          redis_url: REDIS_URL,
        };
      } catch (err) {
        return { ollama_ok: false, error: err.message };
      }
    },
  },

  // ── Gemma4 / llama-server KV prompt-cache tools ───────────────────────────

  'engram.kv_cache_prime': {
    description: 'Prime the llama-server KV cache by sending a system-prompt prefix to /v1/chat/completions with cache_prompt:true. Call once per session with the ACE context block so subsequent Gemma4 calls reuse the cached KV state.',
    inputSchema: {
      type: 'object',
      properties: {
        system_prompt: { type: 'string', description: 'System prompt / ACE context to cache' },
        turbo_url: { type: 'string', default: 'http://127.0.0.1:8090', description: 'llama-server base URL' },
        model: { type: 'string', default: 'gemma4' },
      },
      required: ['system_prompt'],
    },
    handler: async (args) => {
      const base = (args.turbo_url ?? 'http://127.0.0.1:8090').replace(/\/$/, '');
      const cacheKey = `engram:kv:prime:${createHash('sha1').update(args.system_prompt).digest('hex').slice(0, 16)}`;
      try {
        // Check Redis first — avoid re-priming if already cached this session
        let alreadyPrimed = false;
        try {
          const redis = await getRedis();
          alreadyPrimed = (await redis.exists(cacheKey)) === 1;
        } catch { /* redis optional */ }

        if (alreadyPrimed) {
          return { ok: true, status: 'already_primed', cache_key: cacheKey };
        }

        const res = await fetch(`${base}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: args.model ?? 'gemma4',
            messages: [
              { role: 'system', content: args.system_prompt },
              { role: 'user', content: 'Ready.' },
            ],
            max_tokens: 1,
            temperature: 0,
            cache_prompt: true,
            stream: false,
          }),
          signal: AbortSignal.timeout(30_000),
        });

        const primed = res.ok;
        if (primed) {
          try {
            const redis = await getRedis();
            await redis.set(cacheKey, '1', 'EX', 3600); // 1h — matches llama-server KV TTL
          } catch { /* redis optional */ }
        }
        return {
          ok: primed,
          status: primed ? 'primed' : 'failed',
          http_status: res.status,
          cache_key: cacheKey,
          prompt_chars: args.system_prompt.length,
          turbo_url: base,
        };
      } catch (err) {
        return { ok: false, status: 'error', error: err.message, cache_key: cacheKey };
      }
    },
  },

  'engram.kv_cache_status': {
    description: 'Check llama-server KV cache slot usage via /health and /slots endpoints',
    inputSchema: {
      type: 'object',
      properties: {
        turbo_url: { type: 'string', default: 'http://127.0.0.1:8090' },
      },
    },
    handler: async (args) => {
      const base = (args.turbo_url ?? 'http://127.0.0.1:8090').replace(/\/$/, '');
      const results = {};
      for (const path of ['/health', '/slots']) {
        try {
          const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(5000) });
          results[path] = res.ok ? await res.json() : { status: res.status };
        } catch (err) {
          results[path] = { error: err.message };
        }
      }
      return { turbo_url: base, ...results };
    },
  },

  'engram.session_context_inject': {
    description: 'Build and inject a compact ACE+engram context block into the llama-server KV cache for the current OpenCode session. Reads ace-context.json + recent chat memory, primes the cache, writes ace:packet:{runId} to Redis.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', description: 'Session/run identifier for the Redis packet key' },
        user_id: { type: 'string', default: 'opencode', description: 'User ID for chat memory lookup' },
        ace_context_path: { type: 'string', default: '.opencode/ace-context.json' },
        turbo_url: { type: 'string', default: 'http://127.0.0.1:8090' },
        memory_turns: { type: 'number', default: 5 },
      },
      required: ['run_id'],
    },
    handler: async (args) => {
      const { readFileSync, existsSync } = await import('node:fs');
      const { resolve } = await import('node:path');

      // 1. Load ACE context card
      let aceCard = '';
      const acePath = resolve(args.ace_context_path ?? '.opencode/ace-context.json');
      if (existsSync(acePath)) {
        try {
          const raw = JSON.parse(readFileSync(acePath, 'utf8'));
          const tools = (raw.bashTools ?? []).slice(0, 10).join('\n');
          const docs = (raw.docArtifacts ?? []).slice(0, 8).join('\n');
          aceCard = `## ACE Context\nBash tools:\n${tools}\nDocs:\n${docs}`;
        } catch { aceCard = ''; }
      }

      // 2. Load recent chat memory from Redis
      let memoryBlock = '';
      try {
        const redis = await getRedis();
        const key = `user:memory:${args.user_id ?? 'opencode'}`;
        const rows = await redis.zrevrange(key, 0, (args.memory_turns ?? 5) - 1);
        if (rows.length) {
          const turns = rows.map(r => { try { const t = JSON.parse(r); return `${t.role}: ${String(t.content).slice(0, 120)}`; } catch { return r.slice(0, 120); } });
          memoryBlock = `## Recent Session Memory\n${turns.join('\n')}`;
        }
      } catch { /* redis optional */ }

      const systemPrompt = [
        'You are Gemma4, a local legal AI assistant. Use the context below to answer concisely.',
        aceCard,
        memoryBlock,
      ].filter(Boolean).join('\n\n');

      // 3. Prime the KV cache
      const primeResult = await TOOLS['engram.kv_cache_prime'].handler({
        system_prompt: systemPrompt,
        turbo_url: args.turbo_url,
      });

      // 4. Write the packet to Redis for other tools to read
      const packetResult = await TOOLS['engram.ace_packet_inject'].handler({
        run_id: args.run_id,
        context_blob: systemPrompt,
        ttl_seconds: 3600,
      });

      return {
        ok: primeResult.ok,
        kv_prime: primeResult,
        ace_packet: packetResult,
        prompt_chars: systemPrompt.length,
        ace_loaded: Boolean(aceCard),
        memory_turns_loaded: memoryBlock ? (memoryBlock.match(/\n/g)?.length ?? 0) : 0,
      };
    },
  },
};

// ── Shared dispatch core ───────────────────────────────────────────────────────

const log = (...a) => process.stderr.write('[engram-embed] ' + a.join(' ') + '\n');

async function dispatchRpc(rpc) {
  const { method, params, id } = rpc;

  if (method === 'initialize') {
    return { jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'engram-embed', version: '2.0.0' } } };
  }

  if (method === 'notifications/initialized') return null;

  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: Object.entries(TOOLS).map(([name, t]) => ({ name, description: t.description, inputSchema: t.inputSchema })) } };
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const tool = TOOLS[toolName];
    if (!tool) return { jsonrpc: '2.0', id, error: { code: -32601, message: `Tool not found: ${toolName}` } };
    try {
      const result = await tool.handler(params?.arguments ?? {});
      return { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(result) }] } };
    } catch (err) {
      return { jsonrpc: '2.0', id, error: { code: -32603, message: err.message } };
    }
  }

  if (id !== undefined) return { jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method: ${method}` } };
  return null;
}

// ── MCP HTTP transport (type: http) ───────────────────────────────────────────
// smoke-opencode-mcp-sidecars.mjs and mcp-probe.mjs POST JSON-RPC to /mcp

const httpServer = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if (req.url === '/health' || req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', server: 'engram-embed-mcp', port: PORT }));
    return;
  }

  if (req.method === 'POST' && req.url === '/mcp') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let rpc;
    try { rpc = JSON.parse(body); } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
      return;
    }
    const response = await dispatchRpc(rpc);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(response ? JSON.stringify(response) : '');
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

// ── MCP stdio transport (type: local) ─────────────────────────────────────────
// opencode spawns this as a child process and speaks newline-delimited JSON-RPC
// over stdin/stdout. stderr is for human-readable logs only.

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

async function dispatch(rpc) {
  const response = await dispatchRpc(rpc);
  if (response) send(response);
}

// Health-check mode: node engram-embed-mcp.mjs --health
if (process.argv.includes('--health')) {
  const result = await TOOLS['engram.health'].handler({});
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exit(result.ollama_ok ? 0 : 1);
}

import { createInterface } from 'node:readline';

// Transport mode:
//   --stdio  : opencode child-process mode — stdin/stdout JSON-RPC only, no HTTP server
//              (avoids EADDRINUSE when the long-running HTTP instance is already on :8792)
//   (default): HTTP-only mode — httpServer keeps the process alive
const STDIO_MODE = process.argv.includes('--stdio');

log(`ready — embed=${EMBED_MODEL} ollama=${OLLAMA_URL} qdrant=${QDRANT_URL} redis=${REDIS_URL}`);
log(`tools: ${Object.keys(TOOLS).join(', ')}`);

if (STDIO_MODE) {
  // Pure stdio — do NOT start httpServer so this can coexist with the HTTP instance
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let rpc;
    try { rpc = JSON.parse(trimmed); } catch {
      send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
      return;
    }
    await dispatch(rpc);
  });
  rl.on('close', () => { process.exit(0); });
  process.on('SIGTERM', () => process.exit(0));
  process.on('SIGINT',  () => process.exit(0));
} else {
  log(`HTTP MCP listening on http://127.0.0.1:${PORT}/mcp`);
  httpServer.listen(PORT, '127.0.0.1');
  process.on('SIGTERM', () => { httpServer.close(); process.exit(0); });
  process.on('SIGINT',  () => { httpServer.close(); process.exit(0); });
}
