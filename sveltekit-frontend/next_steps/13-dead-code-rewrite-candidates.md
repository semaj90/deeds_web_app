# Dead Code Rewrite Candidates
**Audit Date:** March 2026
**Status:** Confirmed 0-importer orphans with HIGH/MEDIUM rewrite value
**Rule applied:** Dead = 0 external importers at ALL chain levels, OR all importers are themselves dead

---

## Summary

Full orphan scan of `src/lib/` identified 14 confirmed dead files. After content review, 6 files have enough real logic to be worth rewriting/wiring into active pipelines. The remaining 8 are low-value stubs and have been archived to `deeds_labs/archived-dead-code/`.

---

## HIGH Priority Rewrite Candidates

### 1. `src/lib/server/vlm-document-analyzer.ts` ← **ARCHIVED but rewrite in place**
- **What it does:** Analyzes document images using Gemma3-Vision (via `ollama-service.ts`). Extracts legal concepts, entities, and context from document images. Generates summaries + 768-dim embeddings for RAG. Includes per-document-type prompt templates (contract, evidence, statute, case_law).
- **Pipeline slot:** Evidence upload pipeline → stage 2 (text extraction) currently uses `pdf-parse` + OCR. Adding VLM analysis as an optional stage 2b would extract structured legal data from image-heavy documents.
- **Integration point:** `src/routes/api/evidence/upload/+server.ts` after text extraction (line ~250).
- **What needs changing:**
  - Uses `detectEnvironment` from `enhanced-svelte5-types` (placeholder fn) — remove, not needed
  - Doc ID generation: currently `doc-${Date.now()}` — use actual `evidence.id` passed in
  - Hook into `api/evidence/upload` as an async post-processing stage (non-fatal like summarizer)
- **Effort:** 2-3 hours (import + adapt function signature + wire to upload route)
- **Approximate value:** Adds structured legal entity extraction from image documents — PDFs with scanned pages, photos of exhibits currently miss this.

---

### 2. `src/lib/server/document-processor.ts` ← **ARCHIVED but rewrite in place**
- **What it does:** Multi-engine document processing orchestrator. Runs Docling (layout + tables), Hybrid OCR (Tesseract), YOLO (object detection), ONNX (BERT-style), IBM Vision in a configurable pipeline. Returns unified `DocumentProcessingResult` with: text, entities, layout regions, detected objects, tables, images, processing method used.
- **Pipeline slot:** Evidence upload pipeline sits between MinIO upload and embedding. The current upload route calls `extractTextHybrid(buffer, filename)` — a single-engine approach. `DocumentProcessor` would replace/wrap this with multi-engine fallback.
- **Integration point:** `api/evidence/upload/+server.ts` around line 300 (replace `extractTextHybrid` call).
- **What needs changing:**
  - Replace `await fs.readFile(filePath)` with buffer passed in (MinIO already has the buffer)
  - The Docling integration calls `isDoclingAvailable()` from `docling.js` — that file likely exists in the ML stack (check `src/lib/server/` for docling)
  - OCR hybrid stub at line ~105 (catch block is empty) — fill in `extractTextHybrid` call
  - Merge logic at bottom is incomplete (returns dummy result) — wire properly
- **Effort:** 4-6 hours (fill in stubs, adapt buffer API, add to upload pipeline as feature-flagged stage)
- **Approximate value:** Table extraction + layout detection for legal documents (PDFs with tables of statutes, contracts with clause numbering).

---

## MEDIUM Priority Rewrite Candidates

### 3. `src/lib/server/knowledge-cache.ts` ← **ARCHIVED but rewrite in place**
- **What it does:** Redis caching layer specifically for Qdrant search results and embeddings. Uses SHA-256 for embedding cache keys, MD5 for search result keys. TTLs: 1hr for embeddings, 30min for search, 5min for stats, 1min for health. Tracks cache hit/miss metrics in Redis counters.
- **Pipeline slot:** RAG search pipeline. Currently `src/lib/server/vector/qdrant-manager.ts` does raw Qdrant queries on every request. This file would add a cache layer between the request and Qdrant.
- **Integration point:** `src/lib/server/rag-pipeline.ts` — wrap the `qdrantManager.search()` call with `getSearchCacheKey()` + `cacheSearchResults()`.
- **Issue:** Creates its own Redis connection (`new Redis(...)`) instead of using the singleton from `$lib/server/redis`. Should be refactored to import the singleton before wiring.
- **Effort:** 2-3 hours (refactor Redis import, wire to rag-pipeline.ts)
- **Approximate value:** Eliminates redundant Qdrant calls for repeated legal queries (same brief cited multiple times in a session).

---

### 4. `src/lib/server/redis-streams.ts` ← **ARCHIVED but rewrite in place**
- **What it does:** Typed Redis Streams helpers (`XADD`, `XRANGE`, `XTRIM`). Produces/consumes token chunks keyed as `stream:tokens:{requestId}`. Each entry has `seq`, `chunk`, `meta`. Supports stream trimming (MAXLEN ~1000).
- **Pipeline slot:** SSE chat streaming. Currently SSE streams are ephemeral — if the client disconnects and reconnects, the stream restarts. Redis Streams would enable resume semantics.
- **Integration point:** `src/routes/api/sse/[id]/+server.ts` — on reconnect, read from `stream:tokens:{id}` to replay missed tokens.
- **Note:** Uses `redis.xadd()` and `redis.xrange()` — the `ioredis` singleton in `$lib/server/redis` supports these methods. The `(redis as any)` casts can be replaced with typed calls.
- **Effort:** 3-4 hours (wire to SSE route, add reconnect handling in SSE client)
- **Approximate value:** Chat session resume after network drop — useful for long LLM responses.

---

### 5. `src/lib/command-center-manifest.ts` ← **ARCHIVED but rewrite in place**
- **What it does:** Canonical route registry for the app. Defines `CommandCenterRoute` type (with `href`, `label`, `description`, `kind`, `group`, `badges`, `errorState`, `errorCount`). Contains `COMMAND_CENTER_MANIFEST` — a full map of all app routes organized by tab (cases, evidence, persons, system, routes). Also includes `Phase72Task` type definitions.
- **Pipeline slot:** The `/command-center` route (`src/routes/(app)/command-center/`) already exists. This manifest would give it its data. Also useful for a global command palette (Ctrl+K) to search routes.
- **Integration point:** `src/routes/(app)/command-center/+page.server.ts` — load the manifest, expose as `data.routes`. Or import directly in the page component.
- **Effort:** 1-2 hours (import in /command-center route, render route list)
- **Approximate value:** Gives the command center a live data source instead of hard-coded route lists. Could drive a Ctrl+K palette.

---

## LOW Priority — NOT Worth Rewriting (Archived)

| File | Why archived | Superseded by |
|------|-------------|---------------|
| `src/lib/stores/gpu-summary-store.svelte.ts` | GPU metrics — no active GPU dashboard page consuming it | `/api/health` + infrastructure route |
| `src/lib/mcp-context72-get-library-docs.ts` | MCP tool wrapper — MCP server is separate process (not imported at runtime) | `src/mcp/server.ts` tools |
| `src/lib/mcp-memory-read-graph.ts` | Same as above | `src/mcp/server.ts` |
| `src/lib/ClientEmbeddingService.ts` | Client-side embedding wrapper — all embedding goes through gRPC server-side | `src/lib/server/grpc/embedding-client.ts` |
| `src/lib/ClientEmbeddingGemma.ts` | Same pattern | gRPC embedding client |
| `src/lib/gemma3Client.ts` | Gemma3 wrapper — Ollama is the active server-side client | `src/lib/server/ollama-service.ts` |
| `src/lib/server/lokiHybridStore.ts` | In-process Loki.js file persistence — Redis handles caching at scale | `src/lib/server/redis.ts` |
| `src/lib/server/rabbitmq-service.ts` | **Stub only** — all methods are `console.log` and return nothing | Real queue: `src/lib/server/queue/rabbitmq-manager-fixed.ts` |
| `src/lib/server/evidence-processing.ts` | XState machine but ALL VectorStore/CacheStore/AI methods are stubs (in-memory only) | Active 8-stage evidence pipeline |

---

## Execution Order (when ready to implement)

1. **command-center-manifest** — lowest effort, highest visibility, 1-2 hrs
2. **knowledge-cache** — performance win, no new features needed, 2-3 hrs
3. **vlm-document-analyzer** — adds new evidence capability, 2-3 hrs
4. **redis-streams** — SSE resume, 3-4 hrs
5. **document-processor** — largest scope, needs docling integration verified, 4-6 hrs

---

## Verification Commands (before starting each rewrite)

```bash
# Check which evidence upload pipeline stages are active
grep -n "import\|await\|call" src/routes/api/evidence/upload/+server.ts | head -40

# Check rag-pipeline search entry point
grep -n "search\|embed\|qdrant" src/lib/server/rag-pipeline.ts | head -30

# Check command-center route exists + its current data source
ls src/routes/\(app\)/command-center/

# Verify Redis singleton supports xadd/xrange
grep -n "xadd\|xrange\|xtrim\|xread" src/lib/server/redis.ts
```
