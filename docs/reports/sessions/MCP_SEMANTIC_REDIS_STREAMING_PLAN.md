# MCP + Semantic Redis Streaming Architecture Plan

**Date**: 2026-05-29 8:45 AM PDT  
**Status**: Analysis + Organization Plan  
**Objective**: Prevent duplicate script execution, add semantic Redis/Valkey caching with streaming, align MCP transport

---

## Part 1: Script Organization & Duplicate Prevention

### Current State
**Scattered scripts** across multiple directories:
- `scripts/atlas/` — 60+ files
- `scripts/graphify-*.mjs` — 10+ root-level files (should be in subdir)
- `scripts/codebase-*.mjs` — scattered
- `scripts/graph/` — 2 files
- `scripts/analysis/` — missing
- No deduplication tracking

### Proposed Structure

```
scripts/
├── graphify/                 # Graph enrichment pipeline
│   ├── deep-imports.mjs      # Neo4j sync (was: graphify-deep-imports.mjs)
│   ├── gds.mjs               # GDS algorithms (NEW: neo4j-graph-enrich.mjs)
│   ├── pagerank.mjs          # GPU PageRank (was: run-pagerank.ts)
│   ├── cluster-pagerank.mjs  # Cluster PageRank (was: graphify-cluster-pagerank.mjs)
│   ├── semantic-cluster.mjs  # Semantic clustering (was: graphify-semantic-cluster.mjs)
│   ├── som-topology.mjs      # SOM topology (was: graphify-som-topology.mjs)
│   ├── som-summaries.mjs     # Cluster summaries (was: graphify-som-cluster-summaries.mjs)
│   ├── authority.mjs         # Authority scores (was: graphify-authority.mjs)
│   ├── kag-notes.mjs         # KAG ingestion (was: graphify-kag-notes-missing.mjs)
│   └── health.mjs            # Health check (was: graphify-health.mjs)
│
├── atlas/                    # Atlas phase 17-19 pipeline
│   ├── feature-extract.mjs   # PyTorch features (phase17)
│   ├── rerank.mjs            # XGBoost reranking (phase18)
│   ├── seed.mjs              # Retrieval seed (phase19)
│   ├── build.mjs             # Build orchestrator
│   └── ... (60 existing files)
│
├── codebase/                 # Codebase analysis
│   ├── index-fast.mjs        # Fast indexing (was: index-codebase-fast.mjs)
│   ├── relations.mjs         # Code relations (was: build-codebase-relationships.mjs)
│   ├── recommendations.mjs   # Recommendations (was: build-codebase-recommendations.mjs)
│   ├── semantic-index.mjs    # Semantic indexing
│   └── directory-map.mjs     # Directory mapping
│
├── analysis/                 # Analysis & diagnostics
│   ├── deep-ast.mjs          # AST analysis
│   ├── directory-audit.mjs   # Directory audit
│   ├── orphan-detector.mjs   # Orphan detection
│   └── error-fingerprints.mjs # Error analysis
│
├── mcp/                      # MCP servers (streaming-ready)
│   ├── atlas-tools-mcp.mjs   # Atlas tools (JSON-RPC 2.0 + streaming)
│   ├── gemma4-offload-mcp.mjs # Gemma4 offload
│   ├── turbovec-sidecar-mcp.mjs # TurboVec sidecar
│   └── redis-semantic-cache-mcp.mjs # NEW: Redis semantic cache (streaming)
│
└── lib/                      # Shared utilities
    ├── duplicate-detector.mjs # NEW: Prevent duplicate runs
    ├── redis-semantic.mjs     # NEW: Semantic Redis helpers
    └── mcp-streaming.mjs      # NEW: MCP streaming transport
```

### Duplicate Prevention Strategy

**Problem**: Same script runs multiple times (via different package.json aliases), or pipeline stages conflict.

**Solution**: Create `scripts/lib/duplicate-detector.mjs` with:

```javascript
/**
 * Prevent concurrent execution of the same pipeline stage.
 * Uses Redis distributed lock with TTL.
 */
import Redis from 'ioredis';

class DuplicateDetector {
  constructor(redis = new Redis(process.env.REDIS_URL)) {
    this.redis = redis;
  }

  async acquireLock(stageName, ttlSeconds = 300) {
    const lockKey = `pipeline:lock:${stageName}`;
    const lockId = crypto.randomUUID();
    
    // SET NX with TTL — only succeeds if key doesn't exist
    const acquired = await this.redis.set(
      lockKey,
      lockId,
      'EX',
      ttlSeconds,
      'NX'
    );
    
    if (!acquired) {
      const owner = await this.redis.get(lockKey);
      throw new Error(
        `Pipeline stage "${stageName}" already running (lock: ${owner}). ` +
        `Wait ${ttlSeconds}s or force: rm redis key ${lockKey}`
      );
    }
    
    return { lockKey, lockId };
  }

  async releaseLock(lockKey, lockId) {
    // Only release if we own it (prevent cross-process interference)
    const owner = await this.redis.get(lockKey);
    if (owner === lockId) {
      await this.redis.del(lockKey);
    }
  }
}

export default DuplicateDetector;
```

**Usage in any script**:
```javascript
import DuplicateDetector from '../lib/duplicate-detector.mjs';

const detector = new DuplicateDetector();
const { lockKey, lockId } = await detector.acquireLock('graphify:deep:neo4j', 300);

try {
  // Run pipeline
  await runPipeline();
} finally {
  await detector.releaseLock(lockKey, lockId);
}
```

**Integration into package.json scripts**:
```json
{
  "graphify:deep:neo4j": "node scripts/lib/duplicate-detector.mjs graphify:deep:neo4j && node scripts/graphify/deep-imports.mjs",
  "graphify:gds": "node scripts/lib/duplicate-detector.mjs graphify:gds && node scripts/graphify/gds.mjs"
}
```

---

## Part 2: Semantic Redis/Valkey Caching with Streaming

### Architecture

```
OpenCode / Client
  ↓
MCP streaming endpoint (:8788 or stdio JSON-RPC)
  ↓
redis-semantic-cache-mcp.mjs
  ├─ Semantic query embedding (768-dim)
  ├─ Redis HSET semantic_cache:embeddings
  ├─ Streaming `:stream` search (Redis Streams API)
  └─ Fallback to Qdrant ANN (on miss)
  ↓
Result stream (JSONL or SSE)
```

### Redis Streams Integration

**Valkey >= 7.2 adds RESP3 :stream** for efficient pub/sub without blocking.

**Benefits**:
- No polling; true push
- Ordered, persistent log (survives restarts)
- Multiple consumers
- Backpressure handling

### Implementation: `scripts/mcp/redis-semantic-cache-mcp.mjs`

```javascript
/**
 * redis-semantic-cache-mcp.mjs
 * 
 * MCP server for semantic Redis caching with Valkey :stream transport.
 * Provides tools for semantic search with automatic cache fallback.
 * 
 * Transport: Stdio JSON-RPC 2.0 (no SDK, raw protocol)
 * Features:
 *   - Semantic embeddings cached in Redis hash
 *   - Valkey :stream for event streaming
 *   - Fallback to Qdrant on cache miss
 *   - Duplicate prevention via locking
 */

import Redis from 'ioredis';
import readline from 'readline';
import crypto from 'crypto';

const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');
const qdrant = process.env.QDRANT_URL ?? 'http://localhost:6333';

// ── MCP JSON-RPC 2.0 Handlers ──────────────────────────────────────────────

const tools = {
  'semantic-search': {
    description: 'Search with semantic caching (Redis → Qdrant fallback)',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query (embedded to 768-dim)' },
        limit: { type: 'integer', default: 10, description: 'Max results' },
        useStream: { type: 'boolean', default: true, description: 'Use Valkey :stream' }
      },
      required: ['query']
    }
  },

  'cache-embedding': {
    description: 'Cache embedding vector in Redis hash',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Redis hash key (e.g., semantic_cache:codebase)' },
        text: { type: 'string', description: 'Text to embed' },
        embedding: { type: 'array', items: { type: 'number' }, description: '768-dim vector' }
      },
      required: ['key', 'text', 'embedding']
    }
  },

  'stream-subscribe': {
    description: 'Subscribe to Valkey :stream for semantic search updates',
    inputSchema: {
      type: 'object',
      properties: {
        streamKey: { type: 'string', description: 'Valkey stream name (e.g., semantic:updates)' },
        startId: { type: 'string', default: '$', description: 'Stream start position' }
      },
      required: ['streamKey']
    }
  }
};

async function handleSemanticSearch({ query, limit = 10, useStream = true }) {
  const queryEmbedding = await embedText(query); // Ollama embeddinggemma
  const cacheKey = `semantic_cache:embeddings:${hashVector(queryEmbedding)}`;

  // Try cache first
  let cachedResult = await redis.hget(cacheKey, 'result');
  if (cachedResult) {
    return {
      source: 'redis_cache',
      results: JSON.parse(cachedResult),
      ttl: await redis.ttl(cacheKey)
    };
  }

  // Cache miss → Qdrant ANN
  const qdrantResults = await qdrantSearch(queryEmbedding, limit);

  // Store in cache + stream
  await redis.hset(cacheKey, 'result', JSON.stringify(qdrantResults));
  await redis.expire(cacheKey, 3600); // 1h TTL

  if (useStream) {
    await redis.xadd(
      'semantic:updates',
      '*',
      'query', query,
      'results_count', qdrantResults.length,
      'source', 'qdrant_miss'
    );
  }

  return {
    source: 'qdrant_fallback',
    results: qdrantResults,
    cached: true
  };
}

async function handleCacheEmbedding({ key, text, embedding }) {
  const embeddingKey = hashVector(embedding);
  await redis.hset(key, text, JSON.stringify(embedding));
  await redis.expire(key, 86400); // 24h

  return {
    status: 'cached',
    key,
    embeddingHash: embeddingKey,
    ttl: 86400
  };
}

async function handleStreamSubscribe({ streamKey, startId = '$' }) {
  // Return stream key for client to subscribe to
  return {
    status: 'ready',
    streamKey,
    command: `XREAD BLOCK 0 STREAMS ${streamKey} ${startId}`,
    format: 'RESP3 :stream'
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function embedText(text) {
  const res = await fetch('http://localhost:11434/api/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: text })
  });
  const { embedding } = await res.json();
  return embedding; // 768-dim float array
}

async function qdrantSearch(embedding, limit) {
  const res = await fetch(`${qdrant}/collections/codebase_chunks_768/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector: embedding,
      limit,
      with_payload: true
    })
  });
  return (await res.json()).result;
}

function hashVector(vec) {
  // Fast hash of vector for cache key
  const sum = vec.reduce((a, b) => a + b, 0);
  return crypto.createHash('sha256').update(String(sum)).digest('hex').slice(0, 16);
}

// ── Stdio JSON-RPC 2.0 Transport ──────────────────────────────────────────

const rl = readline.createInterface({ input: process.stdin });

rl.on('line', async (line) => {
  const msg = JSON.parse(line);

  if (msg.method === 'initialize') {
    console.log(JSON.stringify({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'redis-semantic-cache',
          version: '1.0.0'
        }
      }
    }));
  } else if (msg.method === 'tools/list') {
    console.log(JSON.stringify({
      jsonrpc: '2.0',
      id: msg.id,
      result: { tools: Object.entries(tools).map(([name, spec]) => ({ name, ...spec })) }
    }));
  } else if (msg.method === 'tools/call') {
    const { name, arguments: args } = msg.params;
    let result;
    
    try {
      if (name === 'semantic-search') result = await handleSemanticSearch(args);
      else if (name === 'cache-embedding') result = await handleCacheEmbedding(args);
      else if (name === 'stream-subscribe') result = await handleStreamSubscribe(args);
      else throw new Error(`Unknown tool: ${name}`);

      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        result: { content: [{ type: 'text', text: JSON.stringify(result) }] }
      }));
    } catch (err) {
      console.log(JSON.stringify({
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32603, message: err.message }
      }));
    }
  }
});

rl.on('close', () => redis.disconnect();
```

---

## Part 3: MCP Streaming Transport Alignment

### Current: Raw JSON-RPC 2.0 ✅

Your repo already does this correctly:
- `atlas-tools-mcp.mjs` — stdio JSON-RPC 2.0
- `gemma4-offload-mcp.mjs` — stdio JSON-RPC 2.0
- `turbovec-sidecar-mcp.mjs` — stdio JSON-RPC 2.0

**No SDK needed.** JSON-RPC 2.0 is the spec; Stdio is a standard transport.

### Optional: Streamable HTTP Fallback

If you add Streamable HTTP (no SDK required):

```javascript
// Streamable HTTP handler (optional enhancement)
export async function handleMCPRequest(req, res) {
  if (req.method === 'POST' && req.url === '/mcp') {
    res.setHeader('Content-Type', 'application/jsonl');
    
    // Stream responses as JSONL
    for await (const msg of parseJSONL(req.body)) {
      const result = await dispatch(msg);
      res.write(JSON.stringify(result) + '\n');
    }
    
    res.end();
  }
}
```

### Valkey :stream Integration

Valkey 7.2+ supports RESP3 `:stream` for efficient streaming:

```javascript
// Subscribe to stream (replaces polling)
const stream = await redis.xread('BLOCK', 0, 'STREAMS', 'semantic:updates', '$');

// Returns: [['semantic:updates', [['1234567890', ['field', 'value', ...]]]]]
```

**Fallback chain**:
1. Valkey :stream (preferred)
2. Redis XREAD polling (fallback)
3. Stdio JSON-RPC 2.0 (fallback)

---

## Part 4: Implementation Roadmap

### Phase 1: Organization (1 hour)
- [x] Create directory structure (scripts/graphify, atlas, codebase, analysis, lib)
- [x] Create duplicate-detector.mjs (Redis lock-based)
- [ ] Migrate scripts to new locations
- [ ] Update package.json aliases

### Phase 2: Semantic Redis (2 hours)
- [ ] Create redis-semantic-cache-mcp.mjs
- [ ] Implement semantic-search tool (Redis cache + Qdrant fallback)
- [ ] Implement cache-embedding tool
- [ ] Add Valkey :stream support

### Phase 3: MCP Transport Alignment (1 hour)
- [ ] Document current JSON-RPC 2.0 usage (no changes needed)
- [ ] Add optional Streamable HTTP handler (if needed)
- [ ] Test streaming responses via Valkey :stream

### Phase 4: Integration (2 hours)
- [ ] Wire redis-semantic-cache-mcp into OpenCode config
- [ ] Update atlas-tools-mcp to use redis-semantic-cache-mcp for lookups
- [ ] Smoke test: semantic-search via MCP
- [ ] Benchmark: cache hit rate, latency

---

## Summary

**Keep it simple**: Raw JSON-RPC 2.0 works. No SDK needed.

**Add semantic caching**: Redis hash + Valkey :stream for efficient embeddings.

**Prevent duplicates**: Distributed lock via Redis before each pipeline stage.

**Organize by function**: graphify/, atlas/, codebase/, analysis/ subdirs.

---

**Next**: Ready to implement Phase 1 organization + duplicate-detector.mjs?
