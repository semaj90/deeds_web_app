# Dead Code Rewrite Candidates
**Audit Date:** March 2026
**Status:** Refreshed against live wiring in March 2026 consolidation audit
**Rule applied:** A rewrite candidate must still be dead. If a module is already imported by active routes, it is not a rewrite candidate.

---

## Summary

This file was partially stale. A live wiring check shows that several previously listed "rewrite candidates" are already in production use:

- `src/lib/server/knowledge-cache.ts` is imported by the active SSE chat route
- `src/lib/server/redis-streams.ts` is imported by active SSE routes and chat replay
- `src/lib/command-center-manifest.ts` is imported by the active `/command-center` route

That means they are no longer dead code and should be removed from the rewrite queue.

Current classification after refresh:

- **Defer:** `src/lib/server/vlm-document-analyzer.ts`
- **Archive / harvest only:** `src/lib/server/document-processor.ts`
- **Already wired, no rewrite needed:** `src/lib/server/knowledge-cache.ts`, `src/lib/server/redis-streams.ts`, `src/lib/command-center-manifest.ts`

Production-readiness direction is therefore unchanged: consolidate the active evidence, RAG, and admin flows first; keep VLM-specific rewrite work last.

---

## Current Classification

### 1. `src/lib/server/vlm-document-analyzer.ts` → **DEFER**
- **Current status:** Deferred until consolidation and production-hardening are complete. See `next_steps/14-vlm-deferred-reference.md`.
- **Why deferred:** The active evidence pipeline already includes image-aware analysis paths: YOLO object detection, `/api/vision/analyze`, and non-fatal VLM work in `api/evidence/upload`. The remaining gap is refinement, not a missing production path.
- **When to resume:** After active evidence ingestion, RAG retrieval quality, and admin/operator surfaces are stabilized.
- **Correct position in roadmap:** Last major ML rewrite, not a current production blocker.

---

### 2. `src/lib/server/document-processor.ts` → **ARCHIVE / HARVEST ONLY**
- **Why not rewrite-now:** The live upload route already performs hybrid extraction, LangExtract sectioning, embeddings, Qdrant indexing, summarization, entity extraction, forensics, and parallel YOLO/VLM analysis. Reintroducing an older orchestrator would duplicate an already-active pipeline.
- **What to keep:** Harvest ideas around table/layout orchestration only if a concrete gap appears in evidence ingestion quality.
- **What not to do:** Do not spend consolidation time reviving this file as a parallel processor.

---

## Remove From Rewrite Queue

### 3. `src/lib/server/knowledge-cache.ts` → **ALREADY WIRED**
- **Live evidence:** Imported by `src/routes/api/sse/chat/+server.ts` for cached embeddings.
- **Implication:** This is active production code, not dead code.
- **Action:** Remove from rewrite candidate tracking.

---

### 4. `src/lib/server/redis-streams.ts` → **ALREADY WIRED**
- **Live evidence:** Imported by `src/routes/api/sse/[id]/+server.ts`, `src/routes/api/sse/chat/+server.ts`, and `src/routes/api/chat/replay/+server.ts`.
- **Implication:** Resume/replay semantics are already part of the active SSE path.
- **Action:** Remove from rewrite candidate tracking.

---

### 5. `src/lib/command-center-manifest.ts` → **ALREADY WIRED**
- **Live evidence:** Imported by `src/routes/(app)/command-center/+page.server.ts` and used by the active command-center UI.
- **Implication:** The manifest is already the live data source.
- **Action:** Remove from rewrite candidate tracking.

---

## Production-Readiness Notes

### Evidence flow
- `src/routes/api/evidence/upload/+server.ts` is the active production ingestion path.
- It already combines object storage upload, PostgreSQL persistence, OCR/Docling-aware extraction, LangExtract sectioning, embeddings, Qdrant indexing, summarization, entity extraction, forensics, and parallel YOLO/VLM analysis.
- Recommendation: harden and validate this path rather than replacing it with legacy processors.

### RAG flow
- RAG is route-driven now, not centered on a single `rag-pipeline.ts` file.
- Active retrieval and caching are present in route/server modules such as `src/routes/api/rag/search/+server.ts`, `src/lib/server/rag/evidenceRag.ts`, and the SSE chat route.
- Recommendation: optimize retrieval quality and observability in-place; do not spend time reviving older "missing pipeline" abstractions.

### Admin flow
- `src/routes/(app)/admin/ai-dashboard/+page.svelte` remains an active browser-only operator surface, with SSR intentionally disabled in `+page.ts` because of ONNX/WebGPU/browser-only dependencies.
- Recommendation: treat admin AI dashboard work as production hardening and operator UX cleanup, not dead-code revival.

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

**Current rewrite queue:**
1. **vlm-document-analyzer** — defer until after consolidation and production hardening

**Do not schedule as rewrites:**
2. **document-processor** — archive / harvest only
3. **knowledge-cache** — already active
4. **redis-streams** — already active
5. **command-center-manifest** — already active

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
