# Dead Code Rewrite Candidates
**Audit Date:** March 2026
**Status:** Confirmed 0-importer orphans with HIGH/MEDIUM rewrite value
**Rule applied:** Dead = 0 external importers at ALL chain levels, OR all importers are themselves dead

---

## Summary

Full orphan scan of `src/lib/` identified 14 confirmed dead files. After content review, 5 files have HIGH/MEDIUM rewrite value and stay in `src/lib/` as documented candidates. The remaining 9 were already absent (removed by prior sessions) and are documented below as low-priority future wiring candidates — useful when MCP tooling, RAG/KAG/DAG pipelines, OOD offline mode, or GPU dashboards get expanded.

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

## LOW Priority — Archived (Future Wiring Candidates)

All 9 files below were already absent from `src/lib/` (removed by prior sessions). They are archived in `deeds_labs/archived-dead-code/`. None need immediate work but are worth revisiting if their respective pipeline area gets expanded.

---

### 6. `mcp-context72-get-library-docs.ts` + `mcp-memory-read-graph.ts` — MCP Context & Knowledge Graph
- **What they do:** Tool wrappers for the FastMCP server. `context72` fetches library docs from Context7 API. `memory-read-graph` reads the in-memory knowledge graph (entities + relations) via MCP protocol.
- **Why archived:** MCP server runs as a separate stdio process — these are not imported at runtime, they're registered as tool handlers.
- **Future wiring:** If the MCP server expands to serve RAG queries or KAG (Knowledge-Augmented Generation) tasks, these would slot in as tool implementations:
  - `context72` → feed retrieved library docs into the RAG context window alongside case law
  - `memory-read-graph` → expose structured entity graph (persons, cases, statutes) as MCP tool for agentic DAG traversal
- **Integration point:** `src/mcp/server.ts` — add as tool handlers alongside existing 9 tools
- **Effort:** 1-2 hours per tool to register + test
- **Archived at:** `deeds_labs/archived-dead-code/mcp-context72-get-library-docs.ts` + `mcp-memory-read-graph.ts`

---

### 7. `ClientEmbeddingService.ts` + `ClientEmbeddingGemma.ts` — Client-Side Embedding (OOD / Offline)
- **What they do:** Browser-side embedding wrappers. `ClientEmbeddingService` is an abstract interface; `ClientEmbeddingGemma` implements it using the local Gemma ONNX model (768-dim, same vector space as server embeddings).
- **Why archived:** All production embedding routes through `$lib/server/grpc/embedding-client.ts`. Client-side path is inactive.
- **Future wiring:** OOD (offline/on-device) workflows — if a user opens the app without server connectivity, client-side embedding enables local semantic search over IndexedDB-cached evidence. Also useful for:
  - KAG: on-device knowledge augmentation before sending to server
  - Offline case review with local ONNX + LokiJS cache
- **Integration point:** `src/lib/ai/client-router.ts` — already has a local vs. server routing decision. Add embedding fallback branch: `if (!serverAvailable) useClientEmbedding()`
- **Effort:** 3-4 hours (wire into client-router, test local embed + search)
- **Archived at:** `deeds_labs/archived-dead-code/ClientEmbeddingService.ts` + `ClientEmbeddingGemma.ts`

---

### 8. `gemma3Client.ts` — Direct Gemma3 Client (OOD / Bypass Ollama)
- **What it does:** Thin client that calls Gemma3 HTTP API directly, bypassing Ollama's proxy layer. Useful when Ollama isn't available but the raw model endpoint is exposed.
- **Why archived:** `src/lib/server/ollama-service.ts` is the active client.
- **Future wiring:** OOD fallback — if Ollama is down, this client can hit Gemma3 directly (e.g., llm-studio endpoint or local raw inference). Also relevant for edge deployments where only the model HTTP port is exposed.
- **Integration point:** `src/lib/server/ollama-service.ts` — add as a secondary provider in the existing `generateText()` fallback chain
- **Effort:** 1-2 hours
- **Archived at:** `deeds_labs/archived-dead-code/gemma3Client.ts`

---

### 9. `evidence-processing.ts` — XState Evidence Workflow Machine (RAG/KAG Orchestration)
- **What it does:** XState v5 state machine skeleton: `upload → analysis → embedding → storage → complete`. Defines `WorkflowContext`, `EvidenceAnalysisResult`. All service calls (`analyzeWithAI`, `generateEmbeddings`, `storeResults`) are in-memory stubs.
- **Why archived:** The active 8-stage RabbitMQ pipeline replaces this entirely. In-memory stubs make it non-functional as-is.
- **Future wiring:** The machine skeleton has real value for a **DAG-style evidence orchestration** layer — replacing the linear RabbitMQ queue with a proper statechart that can:
  - Branch on document type (image → VLM path, PDF → OCR path, text → direct embed)
  - Retry individual stages independently (not restart the whole pipeline)
  - Expose state to the UI via SSE (`upload`, `analysis`, `embedding`, `complete`)
  - Integrate KAG: after embedding, run entity-graph augmentation before storage
- **Integration point:** New route `src/routes/api/evidence/process/+server.ts` — run the machine per-upload and stream state events back via SSE
- **Effort:** 6-8 hours (replace stubs with real gRPC/Qdrant/Redis calls, wire SSE, add KAG step)
- **Archived at:** `deeds_labs/archived-dead-code/evidence-processing.ts`

---

### 10. `rabbitmq-service.ts` (root stub) — Queue Abstraction Layer
- **What it does:** `RabbitMQServiceStub` — every method is a `console.log` with no real AMQP connection. Exported as `rabbitmqService`.
- **Why archived:** Real implementation is `src/lib/server/queue/rabbitmq-manager-fixed.ts` (7 queues, 5 exchanges, live).
- **Future wiring:** Could be used as a test double / mock in unit tests for queue-dependent code. Also useful as an interface contract if the real manager ever needs to be swapped (e.g., Redis Streams replacing AMQP for lighter deployments).
- **Effort:** Minimal — just register as a vitest mock if needed
- **Archived at:** `deeds_labs/archived-dead-code/rabbitmq-service.ts`

---

### 11. `lokiHybridStore.ts` — LokiJS Hybrid Store (KAG / Offline Cache)
- **What it does:** LokiJS adapter with a file-persistence adapter. Creates in-process collections that survive restart via filesystem serialization. Can serve as a local cache that syncs to Redis on reconnect.
- **Why archived:** Redis handles all server-side caching at scale.
- **Future wiring:** KAG offline mode — if building a desktop/Electron version or air-gapped deployment, LokiJS could replace Redis for local-only legal AI. Also useful as the backing store for the client-side knowledge graph if shipped as a local app.
- **Effort:** 2-3 hours to adapt to new schema
- **Archived at:** `deeds_labs/archived-dead-code/lokiHybridStore.ts`

---

### 12. `gpu-summary-store.svelte.ts` — GPU Metrics Store
- **What it does:** Svelte store for aggregated GPU utilization, VRAM usage, inference latency from the active CUDA device.
- **Why archived:** No route currently renders a GPU dashboard.
- **Future wiring:** `src/routes/(app)/system-configuration/` or a new `/gpu-monitor` route. The `/api/health` endpoint already surfaces GPU data — this store would subscribe to it and drive a live metrics panel. Relevant if TRT-LLM / Triton deployment (see `next_steps/10-trtllm-triton-deployment.md`) is activated.
- **Effort:** 1-2 hours (wire store to poll `/api/health`, render in system-configuration)
- **Archived at:** `deeds_labs/archived-dead-code/gpu-summary-store.svelte.ts`

---

## Execution Order (when ready to implement)

**HIGH/MEDIUM — active pipeline improvements:**
1. **command-center-manifest** — lowest effort, highest visibility, 1-2 hrs
2. **knowledge-cache** — performance win, no new features needed, 2-3 hrs
3. **vlm-document-analyzer** — adds new evidence capability, 2-3 hrs
4. **redis-streams** — SSE resume, 3-4 hrs
5. **document-processor** — largest scope, needs docling integration verified, 4-6 hrs

**LOW — deferred, wire when pipeline area expands:**
6. **mcp-context72 + mcp-memory-read-graph** — MCP tool registration, 1-2 hrs each; prerequisite: MCP server expansion for RAG/KAG/DAG agent tools
7. **gpu-summary-store** — GPU dashboard panel, 1-2 hrs; prerequisite: TRT-LLM deployment activated
8. **ClientEmbeddingService + ClientEmbeddingGemma** — OOD offline embed, 3-4 hrs; prerequisite: offline/air-gapped use case confirmed
9. **gemma3Client** — OOD direct-model fallback, 1-2 hrs; prerequisite: Ollama-bypass scenario needed
10. **evidence-processing (XState)** — DAG evidence orchestration with KAG step, 6-8 hrs; prerequisite: need stage-level retries or branching on doc type
11. **lokiHybridStore** — offline/Electron KAG cache, 2-3 hrs; prerequisite: desktop/air-gapped deployment
12. **rabbitmq-service stub** — test double only; wire as vitest mock when queue unit tests are written

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
