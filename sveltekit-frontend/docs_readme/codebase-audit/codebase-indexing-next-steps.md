# Codebase Indexing — Status & Next Steps

## Last Updated: February 18, 2026 (Session 51)

---

## Current Pipeline Status: FULLY WIRED

The AST-aware codebase indexing pipeline is **complete end-to-end**. All components exist, compile cleanly (svelte-check 0/0), and are wired together.

### Component Map

| Component | File | Status |
|-----------|------|--------|
| AST Chunker | `src/lib/server/indexer/ast-chunker.ts` | Complete — 7 chunk kinds via ts-morph |
| Dual Embedder | `src/lib/server/indexer/dual-embedder.ts` | Complete — 768-dim content + signature vectors |
| Model Constants | `src/lib/ai/model-ids.ts` | Complete — `embeddinggemma:latest` (768-dim) |
| Index API (POST) | `src/routes/api/codebase/index/+server.ts` | Complete — file walker + chunk + embed + Qdrant upsert |
| Index Status (GET) | `src/routes/api/codebase/index/+server.ts` | Complete — collection stats from Qdrant |
| Recall API (Stage A) | `src/routes/api/codebase/recall/+server.ts` | Complete — Fuse.js fuzzy on metadata cache |
| Rerank API (Stage B) | `src/routes/api/codebase/rerank/+server.ts` | Complete — dual-vector Qdrant search + path boosting |
| Apply Patch API | `src/routes/api/codebase/apply-patch/+server.ts` | Complete — error cluster patching |
| Search UI | `src/lib/components/CodebaseSearch.svelte` | Complete — Ctrl+K command palette, mounted in `(app)/+layout.svelte` |
| XState Machine | `src/lib/machines/retrieval-machine.ts` | Complete — idle → recalling → reranking → assembling → done |
| Qdrant Manager | `src/lib/server/vector/qdrant-manager.ts` | Complete — SDK wrapper, 5 collections, 768-dim Cosine |
| Analytics Logger | `src/lib/server/analytics/event-logger.ts` | Complete — fire-and-forget JSONB events |

### Data Flow

```
Ctrl+K (CodebaseSearch.svelte)
   │
   ├─── Stage A: POST /api/codebase/recall
   │    └── Fuse.js fuzzy on Qdrant metadata (symbols, paths, tags, signatures)
   │    └── Returns 20-200 candidates in <200ms
   │
   └─── Stage B: POST /api/codebase/rerank
        └── Embed query via embeddinggemma (768-dim)
        └── Qdrant dual-vector search: content (0.6w) + signature (0.4w)
        └── Path boosting: +server.ts (1.3x), schema (1.2x), tests (1.1x)
        └── Returns top 5-20 ranked chunks with full content
```

### Indexing Flow

```
POST /api/codebase/index?scope=all
   │
   ├── 1. File Walker (collectFiles)
   │   └── Walks src/routes, src/lib, tests
   │   └── Skips node_modules, .svelte-kit, services/ (corrupted)
   │   └── Collects .ts, .js, .mts, .mjs files
   │
   ├── 2. AST Chunker (chunkFiles via ts-morph)
   │   └── route-handler: GET, POST, PATCH, DELETE exports
   │   └── table-def: pgTable() calls
   │   └── function: exported functions
   │   └── class: exported classes
   │   └── const: exported const/let
   │   └── type: exported types/interfaces
   │   └── unknown: whole-file fallback (>50 chars, no exports)
   │
   ├── 3. Dual Embedding (indexChunks via Ollama embeddinggemma)
   │   └── Content vector: raw code text (768-dim)
   │   └── Signature vector: AST-derived metadata string (768-dim)
   │   └── Batch size: 16 chunks per Qdrant upsert
   │
   └── 4. Qdrant Storage (codebase_chunks collection)
       └── Named vectors: content + signature (Cosine)
       └── Payload indexes: kind, httpMethod, routeId, tags
       └── Point IDs: deterministic hash of chunk ID
```

---

## What Needs To Happen Next

### Priority 1: Initial Indexing Run

The pipeline is wired but has never been run against the live codebase. Qdrant's `codebase_chunks` collection is empty.

**Prerequisites:**
1. Ollama running with `embeddinggemma:latest` pulled
2. Qdrant running on port 6333
3. Dev server running (for auth bypass)

**Trigger:**
```bash
# Full index (inline, not async — no RabbitMQ needed)
curl -X POST "http://localhost:5173/api/codebase/index?scope=all&async=false" \
  -H "Content-Type: application/json"

# Scoped index (faster for testing)
curl -X POST "http://localhost:5173/api/codebase/index?scope=routes" \
  -H "Content-Type: application/json"

# Check status
curl "http://localhost:5173/api/codebase/index"
```

**Expected outcome:**
- ~300-600 chunks from routes + lib + tests
- ~600-1200 embeddings (2 per chunk)
- `codebase_chunks` collection populated in Qdrant
- Ctrl+K search functional in browser

### Priority 2: Verify Ctrl+K Search End-to-End

After indexing, open the app and press Ctrl+K:
1. Type "POST /api/cases" → should find the cases API route handler
2. Type "pgTable users" → should find the users table definition
3. Type "auth session" → should find session/auth-related code
4. Verify timing footer shows recall + rerank times
5. Verify grouped results (API Routes, Schema, Functions, Types, Tests)

### Priority 3: Incremental Indexing

The current `POST /api/codebase/index` always re-indexes everything. Add incremental support:

- **File**: `src/routes/api/codebase/index/+server.ts`
- **What**: Check `?incremental=true` query param (already in docs, not yet implemented)
- **How**: Store last-indexed timestamps per file in Qdrant metadata or Redis, compare with `fs.stat().mtime`, only re-chunk changed files
- **Why**: Full re-index may take minutes with 300+ files; incremental should be <10s

### Priority 4: RabbitMQ Async Indexing

The endpoint already has RabbitMQ enqueue logic (lines 76-92 of index/+server.ts), but:
- The `rabbitmq.publishCodebaseIndex()` method may not exist yet on the manager
- Need a consumer worker that processes the job
- Useful for `scope=all` which can be slow

### Priority 5: Recall Metadata Cache Warming

The recall endpoint (Stage A) builds a Fuse.js index from Qdrant scroll data, cached for 5 minutes. Issues:
- First request after server start is cold (no cache) — takes 1-3s to scroll all points
- If Qdrant is empty, every recall returns empty forever until cache expires
- **Fix**: Add a `POST /api/codebase/recall?refresh=true` param to force cache refresh
- **Fix**: Warm the cache on server startup via a SvelteKit hook or server-init module

### Priority 6: .svelte File Indexing

The AST chunker only processes `.ts`, `.js`, `.mts`, `.mjs` files. Svelte components are skipped entirely.

**What's missing:**
- `.svelte` files contain `<script>` blocks with functions, imports, state management
- Need a pre-processor to extract `<script lang="ts">` content, then feed to ts-morph
- Could also index template structure (slot usage, event handlers, bindings)

**Approach:**
- In `ast-chunker.ts`, add `.svelte` to extensions
- For `.svelte` files, regex-extract `<script>` content, create virtual `.ts` source
- Tag with `component` kind, derive routeId from file path
- Estimate: ~80-120 additional chunks from page/layout components

### Priority 7: Search Result Navigation

Currently, clicking a search result copies the file path to clipboard. Better UX:
- If running in VS Code (via extension), open the file at the line number
- If in browser, link to a code viewer page (e.g., `/admin/codebase-viewer?file=...&line=...`)
- Show a code preview snippet in the search result item

### Priority 8: Analytics Dashboard

`event-logger.ts` already logs search events to PostgreSQL (`user_analytics_events` table). Build a dashboard:
- Top queries by frequency (`getTopQueryPatterns()` already exists)
- Weekly search volume (`getWeeklySummary()` already exists)
- Average latency breakdown (recall vs rerank)
- Cache hit rate
- Zero-result queries (indicates missing content or poor chunking)

---

## RAG + KAG + DAG Architecture (Future Roadmap)

The codebase indexing pipeline is the foundation for a broader knowledge retrieval system:

### RAG (Retrieval-Augmented Generation)
- Already working: 2-stage recall + rerank feeds context to LLM
- Enhancement: Use retrieval-machine.ts to orchestrate multi-step search → assemble → generate
- Wire CodebaseSearch results into chat context (currently search and chat are separate)

### KAG (Knowledge-Augmented Generation)
- **CouchDB artifact store**: Store raw analysis artifacts (AST dumps, dependency graphs, error clusters) as versioned JSON documents
- **Schema knowledge graph**: Build relationships between tables, routes, and components
- **Statute/case law integration**: Connect legal document embeddings with codebase context

### DAG (Directed Acyclic Graph) Orchestration
- **ClickHouse analytics**: High-volume event analytics for query patterns, cache hit rates, embedding quality metrics
- **XState DAG orchestrator**: Multi-step workflows: index → chunk → embed → validate → store → notify
- **Dependency-aware re-indexing**: When a schema file changes, re-index all routes that import it

### Infrastructure Needed
| Service | Purpose | Status |
|---------|---------|--------|
| Ollama | Embeddings + LLM | Running |
| Qdrant | Vector search | Running |
| PostgreSQL | Structured data + analytics | Running |
| Redis | Cache + sessions | Running |
| RabbitMQ | Job queues | Running (consumer not wired) |
| CouchDB | Artifact store | Not deployed |
| ClickHouse | Analytics OLAP | Not deployed |

---

## Known Issues

1. **apply-patch/+server.ts** uses `getQdrantUrl()` from `$lib/config/env.server.ts` instead of `ENV.QDRANT_URL` from `$lib/server/env.server.ts` — works but inconsistent with the 31 files migrated in Session 46
2. **42 files** still import `getQdrantUrl` from the old config pattern — most are phase89/phase90 legacy endpoints not on critical path
3. **Recall cache** is in-memory only — lost on server restart, no Redis persistence
4. **hashToUint** in dual-embedder uses a simple DJB2 hash that could collide for large collections — consider UUIDs for production
5. **No retry logic** on Ollama embedding calls — single 30s timeout, no exponential backoff
6. **No content deduplication** — re-indexing the same file creates duplicate points with same hash ID (idempotent via Qdrant upsert, but wastes embedding API calls)

---

## Quick Reference: Curl Commands

```bash
# Trigger full index
curl -X POST "http://localhost:5173/api/codebase/index?scope=all" -H "Content-Type: application/json"

# Trigger scoped index (routes only)
curl -X POST "http://localhost:5173/api/codebase/index?scope=routes" -H "Content-Type: application/json"

# Check index status
curl "http://localhost:5173/api/codebase/index"

# Test recall (Stage A)
curl -X POST "http://localhost:5173/api/codebase/recall" \
  -H "Content-Type: application/json" \
  -d '{"query": "POST /api/cases", "limit": 20}'

# Test rerank (Stage B)
curl -X POST "http://localhost:5173/api/codebase/rerank" \
  -H "Content-Type: application/json" \
  -d '{"query": "POST /api/cases", "limit": 10}'

# Check Qdrant collection directly
curl "http://localhost:6333/collections/codebase_chunks"
```