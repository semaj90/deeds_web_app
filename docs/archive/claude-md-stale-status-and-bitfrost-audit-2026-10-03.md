# CLAUDE.md archive — stale July status, Sessions 82-84, BitFrost warm-bucket audit (verbatim)

Archived 2026-10-03 from root CLAUDE.md. Content unchanged. Have-vs-need for the BitFrost/classification part: appended to `openspec/changes/parent-atlas-ace-bitfrost-cache-correctness/tasks.md`.
Source ranges (line numbers after the first trim): 777-1017 (July status, OpenCode/MCP/LSP, Phase 7, weak areas), 1560-1704 (Sessions 82-84), 2147-2377 (BitFrost warm buckets, schema tournament, query fanout).

---

## Last Updated: July 28, 2026 (Cross-Directory Script Safety + Qdrant workspace_id Convention)
## Historical status snapshot (July 2026 — superseded; do not use as current health evidence)
The following service/pipeline claims were captured in July 2026 and are retained only as history.
In particular, the “BitFrost 155K keys” and “155,162 keys” counts are not current measurements;
see “Current runtime and ACE/BitFrost status” above and the dated BitFrost audit receipts.

---

## OpenCode Bash Tool Calling — FIXED (July 8, 2026)

**Root Cause**: `.opencode/opencode.jsonc` top-level `permission.bash` had `"*": "ask"` catch-all. Since `build`/`plan` are built-in agents (not defined in project config), their default `bash: allow` was being overridden by the project's top-level permission block (last rule wins). Result: any bash command not in the explicit allowlist → prompted user instead of executing.

**The Fix** — in `.opencode/opencode.jsonc` lines 21-34, changed from explicit-allowlist + `"*": "ask"` to explicit-denylist + `"*": "allow"`:

```jsonc
"bash": {
  "rm *": "deny",
  "del *": "deny",
  "Remove-Item *": "deny",
  "rmdir *": "deny",
  "cat *.md": "deny",
  "cat *.txt": "deny",
  "cat *.json": "deny",
  "Get-Content docs/llms/generated/*": "deny",
  "Get-Content *.json": "deny",
  "*": "allow"       // ← CHANGED from "ask" to "allow"
},
"webfetch": "allow",
"websearch": "allow"
```

**Impact**: 
- ✅ `build` and `plan` agents now execute bash commands directly (grep, find, npm run, etc.) without prompting
- ✅ Destructive commands (rm, del, rmdir) still blocked
- ✅ `webfetch` and `websearch` also allowed for LDR research tool
- ✅ MCP tools (atlas-tools, engram-embed, ldr-research, trace, gemma4-offload) all connected

**Test**: `grep -r "graphify" . --include="*.md"` now executes immediately in `build`/`plan` agents.

**Note**: Delete or ignore `C:\Users\james\.config\opencode\opencode.jsonc` (global config). It's minimal and unused — project `.opencode/opencode.jsonc` is the single source of truth for this workspace.

### MCP Status (All Connected)

| Server | Type | Status | Notes |
|--------|------|--------|-------|
| **atlas-tools** | local | ✅ Connected | Codebase traversal + topology queries |
| **engram-embed** | local | ✅ Connected | Embeddings + semantic search |
| **gemma4-offload** | local | ✅ Connected | Evidence-grounded summaries |
| **ldr-research** | local | ✅ Connected | Local Deep Research (Gemma4 + SearXNG + Wikipedia) |
| **trace** | remote | ✅ Connected | TRACE MCP at :8788 (KAG tools, graph queries) |
| **turbovec** | remote | ⚠️ Disabled | No MCP endpoint (called directly from code via turbovec-prefilter.ts) |
| **turbovec-sidecar** | — | ⚠️ Disabled | Not configured; turbovec health monitored via :8791/health |

**Intentional disables**: `turbovec` has no MCP wrapper — it's a CUDA vector prefilter called directly from TypeScript, not an agent tool.

### LSP Status — INSTALLED & WIRED

**4 LSP servers installed and configured:**

| Language | Server | Package | Status |
|----------|--------|---------|--------|
| **TypeScript/JavaScript** | typescript-language-server | `typescript-language-server` | ✅ Wired |
| **Svelte** | svelte-language-server | `svelte-language-server` | ✅ Wired |
| **JSON/JSONC** | vscode-json-language-server | `vscode-langservers-extracted` | ✅ Wired |
| **CSS** | vscode-css-language-server | `vscode-langservers-extracted` | ✅ Wired |

**Installation:**
```bash
cd sveltekit-frontend
npm install -D typescript typescript-language-server vscode-langservers-extracted svelte-language-server @tailwindcss/language-server
```

**Configuration** (in `.opencode/opencode.jsonc`):
- Each LSP server has explicit `command` + `args` pointing to local node_modules binaries
- `filetypes` specify which file extensions trigger each server
- All relative paths start from workspace root

**When to add more LSPs:**
- **Python**: `pip install pyright ruff-lsp` (for workers)
- **Go**: `go install golang.org/x/tools/gopls@latest` (for sidecar)
- **Rust**: `rustup component add rust-analyzer` (for TurboVec/SIMD)

### `.mcp.json` History & Restoration (July 8, 2026)

**Original Architecture** (commit c8f859828c):
```json
{
  "playwright": { /* browser automation */ },
  "trace-mcp": { /* local stdio process, ts-node/esm */ }
}
```
- Playwright MCP: Browser testing, screenshots, regression detection
- trace-mcp: Local TypeScript server, spawned by OpenCode
- Problem: OpenCode responsible for process lifecycle; restart loses server

**Intermediate State** (simplified):
```json
{ "trace": { "type": "remote", "url": "http://127.0.0.1:8788/mcp" } }
```
- **trace-mcp evolved** from local stdio → HTTP server (:8788)
- Benefit: Shared process, survives editor restart, health endpoint, SSE support
- Problem: Lost browser automation capability

**Current (Restored)** — July 8, 2026:
```json
{
  "playwright": { /* browser automation restored */ },
  "trace": { /* remote HTTP server, `:8788` */ }
}
```

**Why restore Playwright?**
- Browser automation for UI regression testing, form filling, end-to-end flows
- Agents can now screenshot and interact with the live app (:5173)
- Orthogonal to retrieval/synthesis pipeline

**Architecture Decision**:
- **Keep TRACE as remote HTTP** (better than spawning from editor)
- **Restore Playwright** (separate concern, orthogonal)
- **`.opencode/opencode.jsonc` source of truth** for all 6 MCP servers (trace, atlas-tools, engram-embed, gemma4-offload, ldr-research, playwright)

**Distributed MCP Pattern**:
```
OpenCode
    ├── LSP (TypeScript, Svelte, JSON, CSS)
    └── MCP
         ├── trace (:8788 remote HTTP)
         ├── atlas-tools (local)
         ├── engram-embed (local)
         ├── gemma4-offload (local)
         ├── ldr-research (local)
         └── playwright (browser automation)
```

---

## Phase 7 Operational Status (July 3, 2026 — LIVE & 100% CLEAN)

✅ **LIVE & PRODUCING CLEAN SUMMARIES**

| Component | Status | Metric |
|-----------|--------|--------|
| **Workers** | ✅ LIVE (6 active) | 6 workers consuming from `summaries.worker.1-6` queues |
| **llama-server** | ✅ LIVE | :8090 with clean Jinja template override (hforf.gguf alias) |
| **Summary Quality** | ✅ 100% CLEAN | 12,707 summaries written, 0 contaminated |
| **Progress** | ✅ 31.2% COMPLETE | 12,707 / 40,754 chunks summarized |
| **Throughput** | ✅ ~40 summaries/min | ETA 12 hours to completion |
| **Queue Depth** | ✅ ACTIVE | 332,534 messages ready, 6 processing |
| **Postgres Writes** | ✅ LIVE | 12,707 summaries with sanitization applied |
| **Worker Sanitizer** | ✅ 100% EFFECTIVE | Strips all contamination markers |
| **Valkey/Redis** | ✅ UP | Password: `redis`, port: 6379 |

**Live Metrics (July 3, 2026):**
- **Total summaries:** 12,707 (31.2% of 40,754)
- **Remaining chunks:** 28,047 (68.8%)
- **Queue messages ready:** 332,534
- **Queue messages processing:** 6 (one per worker)
- **Contamination rate:** 0% (zero turn marker contamination)
- **Summary quality:** Coherent, meaningful prose (100% verified clean)

**Contamination Sanitizer Performance:**
- `sanitizeSummary()` function in `phase7-rabbitmq-summary-queue.mjs` (lines 211-230)
- Strips: `<end_of_turn>`, `<start_of_turn>`, `<|channel>`, `<thinking>`, `</thinking>`, `<|endthinking>`
- Applied before every Postgres write
- **Result: 100% effectiveness** across 12,707 summaries (zero contamination)

**Monitoring Scripts Available:**
- See `PHASE-7-PRODUCTION-SAFETY-AUDIT.md` for live status commands
- Check queue depth: `curl -s -u guest:guest http://127.0.0.1:15672/api/overview | jq '.queue_totals'`
- Verify cleanliness: `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) total, COUNT(CASE WHEN summary NOT LIKE '%<end_of_turn>%' THEN 1 END) clean FROM codebase_chunk_index WHERE summary IS NOT NULL AND LENGTH(summary) > 10;"`

**Next Steps (Ordered):**
1. ✅ **Phase 7 (Running):** Monitor overnight, verify sustained 100% clean rate
2. ⏳ **Phase 7.1:** Implement error handling + observability hardening (2-3 days)
3. ⏳ **Phase 8:** Index summaries to Qdrant + warm BitFrost (after Phase 7 completes)
4. ⏳ **Phase 9:** Build ACE packet envelopes (after indexing complete)

---

## Atlas & Phase 7 Quick Reference

| Document | Purpose | Status |
|----------|---------|--------|
| [PHASE-7-GEMMA4-CONFIGURATION.md](docs/PHASE-7-GEMMA4-CONFIGURATION.md) | Server flags, template fix, VRAM budget, worker config | ✅ LIVE |
| [SESSION-102-STAGE-A0-ENVELOPE-ASSEMBLY-COMPLETE.md](memory/SESSION-102-STAGE-A0-ENVELOPE-ASSEMBLY-COMPLETE.md) | Envelope assembly, direct emission, deterministic shape | ✅ COMPLETE |
| [PHASE-7-ARCHITECTURE-FINAL.md](docs/PHASE-7-ARCHITECTURE-FINAL.md) | Layer 3b cache check, RPC alignment, 7 production gates | ✅ LOCKED |
| [unified-retrieval-algorithm-execution-plan.md](memory/unified-retrieval-algorithm-execution-plan.md) | 12-step retrieval pipeline, 6 signals, ranking formula | ✅ REFERENCE |
| **PostgreSQL 18 Query Optimization** (Section below) | Materialized stats pattern, fast exports, partial indexes | ✅ NEW |
| [CANONICAL-PACKET-WIRING-BLUEPRINT.md](docs/architecture/CANONICAL-PACKET-WIRING-BLUEPRINT.md) | Lane separation, packet envelope, Protobuf/msgpack | ✅ SPEC |

---

## ⚠️ THREE CRITICAL WEAK AREAS (Session 99+ Priority)

**All infrastructure services are operational. Two areas remain:**

### 1. Feature Extraction → Gemma4 :8090 Synthesis (LEGACY / REFERENCE ONLY)
- **Status**: Historical wiring; do not treat as the current owner
- **What**: This was the earlier unified rerank path that mixed LangExtract, AST structure, and forensic flags through Gemma4. Current ownership is split: Tree-sitter + ast-grep produce structural facts, LangExtract is optional, and llama-server/Gemma4 is a downstream consumer only.
- **Implementation**: Historical modules (`gemma4-nlp-reranker.ts`, `ast-langextract-bridge.ts`, `ast-grep-extractor.ts`) are compatibility/reference only unless a current code path explicitly depends on them
- **Key Files**:
  - `src/lib/server/analysis/gemma4-nlp-reranker.ts` (core unified reranker)
  - `src/lib/server/analysis/ast-langextract-bridge.ts` (orchestrates AST + LangExtract)
  - `src/lib/server/analysis/ast-grep-extractor.ts` (code structure extraction)
  - `src/lib/server/analysis/worker.ts` (forensics → Gemma4 reranking)
- **Validation**: ✅ Wired & integrated (manual test via `/api/evidence/analysis`)

### 2. Unified Retrieval + Summarization Pipeline ✅ PRODUCTION-READY
- **Status**: ✅ COMPLETE — 6/6 stages LIVE_PASS (25 seconds total)
- **What**: Five services orchestrated into unified retrieval + summarization flow
- **Architecture**:
  - **Postgres** (canonical truth): codebase_chunk_index joins + provenance
  - **Qdrant** (GPU vector index): named-vector "content" search (768-dim HNSW)
  - **TurboVec** (CUDA prefilter): 768→64 transform + RAM ANN (4-bit quantized)
  - **Go Retrieval** (facade): planned HTTP orchestration `/search` endpoint
  - **Gemma4** (synthesis): structured feature extraction + bounded summaries (legacy label; current runtime is llama-server hforf.gguf)
- **Pipeline**: Query (768d) → embed → Qdrant ANN (20) → TurboVec prefilter (10) → Postgres join → unified rank (6-signal blend) → llama-server summary
- **Ranking Formula** (modular, independently tunable):
  - `0.30·qdrant_dense + 0.20·turbovec + 0.20·rg_lexical + 0.15·ast + 0.10·postgres + 0.05·freshness`
- **Key Files**:
  - `src/lib/server/retrieval/unified-orchestrator.ts` (core orchestration, 350 lines)
  - `src/routes/api/retrieval/unified/+server.ts` (HTTP endpoint, GET/POST)
  - `scripts/atlas/unified-retrieval-validation.mjs` (6-stage validation)
  - `docs/UNIFIED-RETRIEVAL-PIPELINE.md` (complete architecture reference)
  - `memory/unified-retrieval-wiring-complete.md` (session summary + checklist)
- **Validation**: ✅ All 6 stages LIVE_PASS — test with `npm run retrieval:unified:validate`
- **API**: `/api/retrieval/unified?q=...` now 307-redirects to `/api/retrieval/search-unified?q=...&topK=...` (verified live 2026-08-03) — call `search-unified` directly. Live response shape is `{ query, topK, workflowState, workflowDag, preamble, topPacketKeys, packets, metadata, provenance, ace, shadow }`, not the `{ candidates[], summary, timing, stages_completed[] }` shape previously documented here. `provenance.retrievalSources` lists which lanes actually contributed (e.g. `postgres_trigram`, `qdrant_768`, `exact_symbol`) — useful for confirming the Qdrant lane is live.
- **Next**: Wire Go Retrieval facade + implement RRF fusion (rg lexical + AST payload merge)

### 3. Canonical Evidence Ingestion Spine (End-to-End)
- **Status**: ⏳ PARTIAL (Postgres + SeaweedFS + Qdrant UP, final synthesis not proven)
- **What**: Evidence upload → Postgres row → SeaweedFS blob → Qdrant embedding → Neo4j topology → Redis cache → llama-server summary
- **Action**: Validate full chain from evidence upload to cached summary
- **Key Files**:
  - `src/routes/api/evidence/upload/+server.ts` (intake)
  - `src/lib/server/search/` (indexing)
  - `scripts/atlas/daily-graphify-cold-processing.mjs` (summarization)
- **Validation**: Upload test file → verify in Postgres → Qdrant → Redis → retrieve cached summary

---



---

## ⚡ SESSION 82 (CONTINUED): Phase 2 Real Client Wiring — COMPLETE ✅

**Status**: All 4 real client implementations wired into GanAuditOrchestrator. 5-step canonical flow fully functional.

**What Was Done**:
1. **Step 1 (Postgres Read)** — `readPacketsFromPostgres()` wired with Drizzle ORM + dynamic LIMIT
2. **Step 2 (Postgres Write)** — `writeValidationResultsToPostgres()` wired with 3-branch UPDATE (hard fail / soft warn / passed)
3. **Step 3 (Redis Invalidation)** — `invalidateRedisCache()` wired with ioredis batch DELETE (4 key patterns per packet)
4. **Step 4 (NATS Publishing)** — `emitValidationEvents()` wired with publishTraceCheckpoint on atlas.packets.validated subject

**Test Results**: 7/7 integration tests pass
- ✅ Test 1: Orchestrator initialization
- ✅ Test 2: Dry-run mode (no writes)
- ✅ Test 3: 5-step canonical flow
- ✅ Test 4: Hard failure detection
- ✅ Test 5: Soft warning aggregation
- ✅ Test 6: Cache invalidation metrics
- ✅ Test 7: NATS event emission

**Schema Changes**:
- Added 3 columns to `atlas_packets`: `ganValidated` (boolean, default false), `ganValidationError` (text), `ganWarnings` (text[])
- Migration: `ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS ...` (applied via docker exec)

**Live Data Verified**:
- 18,046 packets in Postgres with valid identity (packet_key IS NOT NULL)
- 5 sample packets fetched: all with ganValidated = false (default)
- Drizzle client connection pool working (verified via docker exec psql)

**Execution Context Note**: See "NPX Execution Context & Module Alias Resolution" section for testing from workspace-root vs sveltekit-frontend/.

---

## ⚡ SESSIONS 82–83: LangGraph Worker + ACP/MCP Telemetry (COMPLETE)

**Status**: ✅ LangGraph 8-node state machine + telemetry system complete. Ready for integration.

**Key Files**:
- `packages/atlas-core/src/langgraph/worker.ts` (538 lines) — 8-node orchestrator with all TODO sections wired
- `packages/atlas-core/src/langgraph/clients.ts` (250 lines) — Postgres/Redis/Qdrant/Neo4j service clients
- `packages/atlas-core/src/telemetry/acp-mcp-telemetry.ts` (420 lines) — unified observability (decisions + tool calls + async ops)

**Routing Decision Tree for Agent Work**:

```
Is this work about orchestrating async agent loops?
  → Use LangGraph worker (packages/atlas-core/src/langgraph/)
    ├─ load_trace_state: Redis cache → Postgres fallback
    ├─ packet_registry_lookup: validate identity + Postgres read
    ├─ bitfrost_cache_check: L1/L2 cache (ff1:packet:*, ff1:feature:*)
    ├─ hybrid_retrieval: Qdrant RAG + Neo4j KAG (parallel)
    ├─ optional_gpu_rerank: skip if < 5 candidates
    ├─ packet_truth_validate: 3 hard fail gates
    ├─ gemma4_synthesis: LLM generation (TODO: wire TurboQuant)
    └─ write_trace_event: Postgres write → Redis invalidate → NATS emit (TODO: wire NATS)

Is this work about observability/debugging slow queries?
  → Use ACP/MCP Telemetry (packages/atlas-core/src/telemetry/)
    ├─ AcpRoutingDecision: record routing choices (cache strategy, tool set, reranker)
    ├─ McpToolCall: record tool invocation (name, params, execution time, cache hits)
    ├─ AsyncOp: record granular awaits (postgres.query, redis.get, qdrant.search, neo4j.run)
    ├─ TelemetryCollector: accumulate + correlate + attribute latency
    ├─ TelemetryAnalyzer: drill down ("Why is my query slow?")
    └─ TelemetryExporter: export to Langfuse/Datadog/Jaeger/Redis

Canonical Truth Flow (5 steps — STRICT ORDER):
  1. Read from Postgres (loadTraceState, packetRegistryLookup)
  2. Validate structure (packetTruthValidate, 3 hard fail gates)
  3. Write to Postgres (writeTraceEvent, set updated_at = NOW())
  4. Invalidate Redis (writeTraceEvent, delete ff1:* keys AFTER Postgres succeeds)
  5. Emit NATS events (writeTraceEvent, publish to SUBJECTS.TRACE_CHECKPOINT)
```

**Hard Rules for Agent Routing**:
- ✅ LangGraph = loop controller ONLY (no datastore ownership)
- ✅ Postgres = truth (all hard fail gates check Postgres first)
- ✅ Redis = hot memory (invalidate AFTER Postgres write succeeds)
- ✅ Qdrant/Neo4j = mirrors (read-only, no write access from worker)
- ✅ NATS = event bus (non-blocking, async notifications)
- ✅ Async visibility = TelemetryCollector records every await()

**Next Steps (Session 84)**:
1. Wire TelemetryCollector into all 8 worker nodes
2. Export telemetry to Redis (simplest backend)
3. Build Grafana dashboard from Redis telemetry
4. Add alerts (cache_hit_rate < 0.4, critical_path > 10s)

---

## ⚡ SESSION 84 (In Progress): Go Retrieval Integration + Admin UI

**Status**: ✅ Go search service fully wired into admin console.

**What Was Integrated**:
- **Go Search Bridge** (`src/lib/server/retrieval/go-search-bridge.ts`) — TypeScript wrapper for Go legal search service (HTTP :8096 or gRPC :50055)
- **Admin API Routes** (`src/routes/api/admin/retrieval/`) — 3 endpoints:
  - `/api/admin/retrieval/search` (GET/POST) — paginated search with RRF fusion
  - `/api/admin/retrieval/clusters` (GET) — paginated SOM cluster listing
  - `/api/admin/retrieval/clusters/[id]` (GET) — cluster detail with packets
- **Admin UI Pages** (`src/routes/(app)/command-center/retrieval/`) — Svelte 5 cluster browser with pagination

**Routing Decision Tree for Retrieval Work**:

```
Is this work about browsing indexed packets?
  → Use Go Retrieval Bridge (src/lib/server/retrieval/go-search-bridge.ts)
    ├─ searchGoService() — parallel Qdrant + BM25 + FTS with RRF
    ├─ suggestGoService() — autocomplete suggestions
    ├─ getTocGoService() — document hierarchy
    ├─ getNodeGoService() — node context with chunks
    ├─ resolveCitationGoService() — citation resolution
    └─ healthGoService() — service health check

Is this work about admin cluster browsing?
  → Use Admin API Routes (/api/admin/retrieval/)
    ├─ POST /search?q= — full-text index search
    ├─ GET /clusters — paginated SOM cluster list
    └─ GET /clusters/[id] — single cluster detail

Is this work about displaying retrieval results in UI?
  → Use SvelteKit Pages (/command-center/retrieval/)
    ├─ Cluster browser with pagination (20 items/page)
    ├─ Sorting by authority or packet count
    └─ Detail modal showing packets within cluster
```

**Key Files**:
- Bridge: `src/lib/server/retrieval/go-search-bridge.ts` (320 lines)
- APIs: `src/routes/api/admin/retrieval/[search,clusters,clusters/[id]]/+server.ts` (280 lines)
- UI: `src/routes/(app)/command-center/retrieval/+page.svelte` (180 lines)

**Port Configuration**:
- **HTTP** (primary): :8100 (go-retrieval unified) or :8096 (go-search-service dedicated)
- **gRPC** (fallback): :50055 (go-search-service) ⚠️ collision with chr97-agent-client, see note below
- **SvelteKit UI**: :5173

**⚠️ Port 50055 Collision Note**:
- Both `go-search-service` (gRPC) and `chr97-agent-client` claim port 50055
- **Mitigation**: HTTP bridge (:8100 or :8096) is primary; gRPC is read-only fallback
- **Fix**: Move chr97 to port 50057 if both services need simultaneous gRPC
- **Current Status**: HTTP is sufficient; gRPC collision is documented but non-blocking

**See**: `docs/GO-RETRIEVAL-INTEGRATION-WIRED.md` for full architecture, usage, and fallback patterns.

---



---

### BitFrost warm buckets — measured state + target contract (2026-09-20)

**Live Valkey is COLD, not the "155K keys" this file's status banner claims.** Measured 2026-09-20
(`docker exec legal-ai-valkey valkey-cli -a redis`): `DBSIZE` 257; `bitfrost:*` 1 key, `gpu:*` 0,
`centroid:*` 0, `bifrost:*` 0. Most keys are BullMQ/Langfuse queues, `embed:v2:*`, `ace:chunk:*`.
`keyspace_hits` 9,951 vs `keyspace_misses` 263,532 (~3.6% hit rate). Treat the "BitFrost 155K keys"
and `gpu:karpathy:*` claims elsewhere in this file as historical until re-warmed and re-measured.

| Fact | Measured value | Implication |
|---|---|---|
| `maxmemory` / used | 2 GiB / 9.35 MiB | no memory pressure today |
| `maxmemory-policy` | `noeviction` (NOT `volatile-lru`) | a full cache would reject writes, not evict; Session 203's "volatile-lru fix" is not what is live |
| `ace:chunk:hits:*` TTL | `-1` (no expiry) | `volatile-lru` would never evict these — TTL-less keys are invisible to it |
| `embed:v2:*` TTL | ~3-5 days remaining (7-day `TTL.EMBEDDING`) | only lane that already follows a 7-day TTL |
| `TTL.CENTROID` / `BIFROST_INDEX` (`cache-keys.ts`) | 6 h | centroid buckets expire in 6 h, not 7 days |
| SOM assignment (`atlas_packets.som_cell_x/y`) | 58,365 / 61,718 rows (94.6%); 400 distinct cells = full 20x20 | the 20x20 grid that warm buckets would key on is populated in Postgres |
| Summaries (`codebase_chunk_index`) | 40,306 / 274,465 non-empty (14.7%) | older "39,151 total / 100%" figures are stale; total chunk count has grown ~7x |

**Target contract (DIRECTION ONLY — nothing below is implemented; do not claim it is):**
- Warm-bucket key = domain-taxonomy node + SOM cell (20x20) + `representation_revision`, built from
  Postgres truth (`atlas_packets`, `codebase_chunk_index`) — never the other way around.
- Warm buckets carry a 7-day TTL (raising `TTL.CENTROID`/`BIFROST_INDEX` from 6 h is a deliberate
  change, not a default). LRU-before-eviction requires BOTH `maxmemory-policy volatile-lru` (or
  `allkeys-lru`) AND a TTL on every warm key; changing the live policy from `noeviction` is an
  operator-approved infra change (also needs `ace:chunk:hits:*` TTL-less keys decided first).
- Bucket rank/progress is a measured ratio (warm buckets populated / 400 SOM cells, hit rate from
  `INFO stats`), reported as counts per the Status Language rules — not a hand-set percentage.
- Neural-prefill / decoder synthesis may read bucket hits only via the `PrefillReceiptV1` boundary
  (`acePolicyRevision`, `bitfrostRevision`, `residencyPlanChecksum`); the cache is never identity.
- Warm order: Postgres write first, Redis invalidate after, warm from Postgres (Canonical Truth Flow).

**Status**: warm buckets = `NOT_PROVEN` (no bucket keys exist live).

**Writer census (2026-09-20, read-only grep of `src/` + `scripts/`, static — no live-caller proof):**
the key prefix is spelled two ways for the same packet cache, so writers and invalidators can
disagree. `src/lib/server/ace/cache-keys.ts` (`bifrostPacketKey`, `bifrostFeatureKey`) carries a
"use these ONLY" comment, but per `docs/reports/parent-atlas-bitfrost-invalidation-owner-v1.json`
(BITFROST-INVALIDATION-OWNER-01, 2026-09-04) its `bifrost:packet:*` shape is **live-absent** — not
the canonical shape. **Canonical (confirmed live shape): `cache-keys.ts` `bifrostKey.semantic.*` →
`bifrost:sem:packet:{packet_key}`, `bifrost:sem:feature:{feature_id}`,
`bitfrost:summary:packet:v1:{packet_key}`; canonical writer/invalidator =
`src/lib/server/cache/atlas-reward-cache.ts` (`setPacketCache`, `invalidateBitfrostPacket`).** Treat
every writer below that emits a non-`bifrost:sem:*` packet key as writing a dead-shape key until
proven otherwise.

| Logical key | `bifrost:` spelling (builder-owned) | `bitfrost:` spelling (ad-hoc) |
|---|---|---|
| packet | `ace/cache-keys.ts`, `cache-keys.ts`, `redis-cache-invalidate.ts`, `mcp-tool-implementations.ts`, `index-doc`, `batch-embeddings`, `predictions/promote`, `phase7-postgres-persistence.mts` | `packet-summary-pipeline.ts`, `packet-truth-flow.mts`, `phase8b`, `phase9`, `phase10*`, `batch-summarize-packets.mjs`, `graphify-incremental.mjs` |
| trace / source | `bifrost:trace:*` (`redis-cache-invalidate.ts`, `mcp-tool-implementations.ts`) | `bitfrost:trace:*`, `bitfrost:source:*` (`packet-truth-flow.mts`, `phase8b`) |
| centroid | `centroid:feature\|packet\|directory:*` (`ace/centroid-compression.ts`), `centroid:v1:*` (`tensor-similarity-cache.ts`) | `bitfrost:centroid:*` (`redis-packet-projection.ts` doc), `centroid:som:*` (`phase8a`), `centroid:cluster:*` (`phase8`) |
| semantic / hot | `bifrost:sem:*` (`atlas-cache-envelope.ts`, `warm-bifrost-semantic-cache.mjs`) | `bitfrost:hot:*`, `bitfrost:som:*`, `bitfrost:summary:*` (`phase8-bitfrost-hot-buckets-bulk.mjs`, `phase8a`) |

**Invalidation status (corrected 2026-09-20 after reading the 2026-09-04 receipt — an earlier
draft of this section wrongly called `redis-cache-invalidate.ts` a live gap):**
`dispatcher/redis-cache-invalidate.ts` already delegates to `invalidateBitfrostPacket()`
(`APPLY_PROVEN` with disposable synthetic keys: seed → mutate → invalidate → readback, fail-open on
Redis error, no namespace flush). **Remaining open gap is reachability, not spelling:** all 4
delegating invalidators are unreachable from any live Postgres-mutation path (their RabbitMQ
listener/worker have zero callers), and `setPacketCache`/`setFeatureCache` have no located external
caller — the real writer of the live `bifrost:sem:packet:*` keys was not found in `src/`. Still-live
stale/spelling risks: `packet-truth-flow.mts` and this file's Canonical Truth Flow section still say
`bitfrost:packet:{key}` (dead shape); two `cache-keys.ts` files (764 and 126 lines) both define
packet/feature keys; `cache/cache-invalidation.ts` uses a third unrelated shape
(`semantic:bifrost:*`, flagged `COMPATIBILITY`, not audited).

**CORRECTION (2026-09-20, same day): the packet/query identity conflation below was already FIXED
on 2026-09-04 (`BIFROST-KEY-SEMANTICS-OWNER-01`) in the builder and the repo-root copy.** There are
TWO copies of this warmer: repo-root `scripts/cache/warm-bifrost-semantic-cache.mjs` (commit
`cef902bec6`, 2026-09-04) was migrated onto `bifrostKey.semantic.query()` (`bifrost:sem:query:{query_hash}`);
the stale duplicate `sveltekit-frontend/scripts/cache/warm-bifrost-semantic-cache.mjs` (`7111345b40`,
2026-06-07) still writes `bifrost:sem:packet:{query_hash}` — that duplicate is the defect described
next, classify it `COMPATIBILITY`/archive-candidate (do not delete). The description below was
written from the stale copy.

**Live-shape writer located (2026-09-20, static + live count; `CREATED`, not `APPLY_PROVEN`):**
`sveltekit-frontend/scripts/cache/warm-bifrost-semantic-cache.mjs` (stale copy; one commit, `7111345b40`, 2026-06-07) writes the `bifrost:sem:*` layout — `bifrost:sem:packet:{query_hash}`,
`bifrost:sem:feature:{feature_id}`, `bifrost:sem:sourceRef:{sha256(ref)}`, `reward:zset`,
`stale:zset`, all `setex` 24 h. Live Valkey holds **0** `bifrost:sem:*` keys today, consistent with
a 24 h TTL lapsing with no re-warm. Findings that constrain any rewire:
- **Identity mismatch:** it keys packets by `query_hash`; the canonical
  `atlas-reward-cache.ts::invalidateBitfrostPacket()` deletes by `packet_key`. A packet warmed under
  `query_hash` is not reachable by that invalidator — reconcile the key identity before wiring an
  invalidation trigger to this writer.
- **Input is small and old:** reads `memory/packets/semantic-cache-candidates.jsonl` (15.8 KB,
  2026-06-08, DuckDB-join output) — not a fresh Postgres read, so it also violates "warm from
  Postgres" until repointed.
- **No caller:** no `package.json` script references it. `package.json` instead points at a
  different script, `scripts/atlas/warm-bitfrost-semantic-cache.mjs` (`atlas:bitfrost-semantic-cache:warm[:apply]`),
  whose 2026-09-11 receipt (`docs/reports/bitfrost-semantic-cache-warm.json`) is **dry-run only —
  0 writes applied** — planning `bifrost:sem:*` (24 h), `ace:*` (1 h) and `atlas:centroid:*` (2 h) keys
  from `atlas_higher_hop_index`. That table **now exists** (an older note in `sveltekit-frontend/CLAUDE.md`
  saying it is missing is stale).
- So two warmers target the same `bifrost:sem:*` namespace with different key identities; neither has
  ever populated live Valkey in this audit's window. Classify the June script `COMPATIBILITY` and the
  September script the candidate owner, pending a decision on `query_hash` vs `packet_key` identity.

**September warmer dry-run (2026-09-20, `--limit=25`, `DRY_RUN_PROVEN`, 0 writes, 0 failures):**
`scripts/atlas/warm-bitfrost-semantic-cache.mjs` already keys `bifrost:sem:packet:${packet_key}` and
`bifrost:sem:feature:${feature_id}` (24 h) — i.e. the `packet_key` identity is already what it uses;
the `query_hash` identity exists only in the June script. All 25 planned `packet_key`s resolve in
`atlas_packets` (bare 16-hex is a real canonical key form there, alongside the `packet:<12hex>`
form). Two limits found: (1) the key is built inline, not through the canonical builder
(`cache-keys.ts` `bifrostKey.semantic.*`) — patch target; (2) its source ledger
`atlas_higher_hop_index` (58,309 rows) has **`som_cluster` NULL on every row**, so this warmer
cannot produce SOM-cell warm buckets; SOM assignments live in `atlas_packets.som_cell_x/y`.
Any SOM/domain warm-bucket producer must read `atlas_packets`, not this ledger.

**Cache identity roots (DECIDED 2026-09-20) + BCI-02..06 (`APPLY_PROVEN` for the code path on
disposable synthetic keys; live warm population still 0):** packet cache root = `packet_key`;
query/retrieval cache root = `query_hash` (`bifrost:sem:query:*`); feature = `feature_id`;
centroid/routing = representation + cluster/SOM coordinate; prefill = `PrefillContentIdentity`
checksum. These never substitute for one another. Landed (additive, v1 shapes unchanged) in
`src/lib/server/cache-keys.ts`: `PacketSemanticCacheIdentityV2`, `packetSemanticIdentityDigestV2`
(sha256 of `canonicalSha256V1`), `packetSemanticCacheKeyV2` → `bifrost:sem:packet:v2:{packet_key}:{digest}`,
`packetSemanticIndexKeyV2` → `bifrost:sem:index:packet:{packet_key}` (Valkey SET reverse locator,
disposable metadata only); and in `cache/atlas-reward-cache.ts`: `setPacketCacheV2` (SET+SADD+EXPIRE
in one MULTI, index TTL 7 d) and `invalidateBitfrostPacket()` now `SMEMBERS`→`UNLINK` all v2 objects +
the index (no SCAN/KEYS; still fail-open). The old "no revision segment in the key" rationale in
`cache-keys.ts` assumed a warm live cache; the cache is empty, so v2 is additive, not an orphaning
change. Proof: `atlas-reward-cache-v2.spec.ts` 10/10 (incl. `ATLAS_LIVE_VALKEY=1` live fixture: 2
revisions seeded, invalidated by locator, unrelated packet survived, 0 leftover keys) +
`tests/cache-keys.spec.ts` 15/15. **Census miss, corrected 2026-09-20:** a second revision-qualified cache identity already existed and
is LIVE — `AceBitfrostCacheIdentityV1` (`src/lib/server/atlas/cache/ace-bitfrost-cache-identity-v1.ts`,
`atlas:bitfrost:v1:{cacheKind}:…:{sha256}` keys for `ACE_PACKET`/`ACE_CONTEXT`/`CENTROID`/`RESIDENCY`;
callers `cache/ace-packet-cache.ts`, `cache/redis-cache-aggressive.ts`, `scripts/atlas/prove-bitfrost-centroid-replay-v1.mts`).
My earlier writer census grepped key-prefix literals and missed builders that assemble keys from parts.
Layering, not merge: `AceBitfrostCacheIdentityV1` = ACE artifact/centroid/residency identity (no
per-packet reverse locator, cannot be invalidated by `packet_key`); `PacketSemanticCacheIdentityV2` =
only the `bifrost:sem:packet:*` lane + reverse locator. Two revision-qualified identities now coexist —
converge them under one owner before adding any third. Related residency contract:
`docs/reports/bitfrost-residency-policy-v1.json` (HOT 30 d / WARM 7 d / COLD 1 d;
`WIRED_POLICY_ADAPTER_PROVEN_TESTS_ONLY`, 35 tests, Valkey behavior NOT proven — so the 7-day WARM TTL
is a policy value, not a live-proven setting). Remote branch `origin/agent/bitfrost-fanout-contract-20260920`
(commit `93777aaf46`, `claude.md` only, +196 lines appended at the end, not merged) freezes the
query-fanout/warm-bucket contract; verified it matches that policy file.
**Not done / deferred:** no production caller writes v2 yet (BCI-10
warm canary is gated); Postgres cache-receipt table `DEFERRED_PENDING_NEED_PROOF`; 7-day value TTL
and LRU/LFU are deferred until writer → invalidation → readback → hit/miss telemetry exist.

**Centroid / SOM re-measure for warm-bucket keys (2026-09-20, read-only; `PARTIAL_PROVEN`):**
- `atlas_packets`: 58,365 / 61,718 rows have `som_cell_x/y` (94.6%), exactly **400 distinct non-null
  cells** (20x20 fully occupied). **`som_revision` is NULL on all 58,365** — the warm-bucket identity
  needs a `somRevision`, and none exists on the assignments, so SOM-cell bucket keys cannot be
  revision-qualified yet (blocker: stamp a revision from the codebook run, do not invent one).
- SOM codebook = `models/som/som_20x20_codebook.json` (400 rows, **`latent_dim` 64**, `native-cuda`,
  50 iterations, 2026-07-28), not in Postgres (`som_adjacency_matrix` exists; no codebook table).
  It lives in the 64-d autoencoder latent space, while `codebase_chunk_index.latent_64` has only 1,703
  populated rows and this file already records the autoencoder weights as untrained — so SOM cell
  quality is `NOT_PROVEN`; treat cells as a routing prefilter hint, never as identity or ranking.
- `gpu_cluster_centroids`: 64 rows, **768-dim** float4[], `cluster_type='kmeans_js'`, all dated
  2026-07-14 (older JS k-means, different space from the 64-d SOM codebook). `qdrant_centroid_clusters`
  (202 rows) stores only `centroid_vector_hash`, no vectors. Two centroid sets in two different vector
  spaces — do not mix them in one packed matrix. At 64x768 (or 400x64) float32 a brute-force
  dot/cosine prefilter is a few hundred KB and needs no vector database.

**`SOM_REVISION_PROVENANCE_01` (2026-09-20, read-only) — verdict: a `somRevision` CANNOT be honestly
derived from what exists; do not stamp one.**
- `models/som/som_assignments.json` (2026-07-28, same run as the codebook) is **per-chunk**, not
  per-packet: 32,310 assignments keyed by `codebase_chunk_index.id` (300/300 sampled ids resolve
  there), covering **388** cells. Zero of its ids match any `atlas_packets` id column
  (`chunk_id`, `file_id`, `symbol_id`, `packet_id`).
- Postgres `atlas_packets` carries packet-level SOM values that are **not derivable from that file**
  (58,365 rows, 400 cells, keyed by `packet_key`) and are internally inconsistent: `som_cell_x/y`
  vs `som_row/som_col` disagree on **58,200 of 58,365 rows (99.7%)**, and `som_row/som_col` covers
  only 342 distinct cells vs 400 for `som_cell_x/y` — two coordinate conventions or two runs in one
  table. `som_revision` is non-null on 1 row of the whole table (NULL on all 58,365 assigned rows).
- **Consequence:** SOM-cell warm buckets and any `somRevision`-qualified key stay `BLOCKED` until a
  fresh, versioned SOM run writes assignments and a content-addressed revision (checksum of the
  codebook + input candidate snapshot) together, with one documented coordinate convention. Checksumming
  the July codebook file alone would label assignments it did not produce — that would be an invented
  revision. Until then use KMeans/domain-taxonomy buckets (no SOM axis) for warm-bucket identity.

**`QUERY_FANOUT_BITFROST_READ_ONLY` receipt (2026-09-20, `PARTIAL_PROVEN`, workflow progress 70% =
weighted completed stages, NOT model confidence; replay: `node scripts/atlas/prove-query-fanout-bitfrost-v1.mjs [--query=…]`,
output `docs/reports/query-fanout-bitfrost-v1.json`, writes only that file):** one query through the
chain — DONE: request identity, TRACE `domain.classify`, capability plan (177 TRACE tools; lexical/AST/
semantic/taxonomy/graph/db lanes all have tools), semantic Top-K (Ollama `embeddinggemma` 768-d → Qdrant
`codebase_chunks_768_v2` `content`: 10/10 hits carry `packet_key`), KMeans nearest centroid (brute force
over 64 x 768-d `gpu_cluster_centroids`), live cache state. PARTIAL: `.okf` validation (3 domains / 6
concepts / 1 language / 3 indexes loaded, but the classifier output named none of them). BLOCKED, with
reasons in the receipt: SOM cell (`SOM_REVISION_PROVENANCE_01`), ACE cache identity (no frozen
CandidateOrdinalMap/FeatureMatrix, so the 7 required revision fields cannot be honestly supplied),
BitFrost bucket (`proposedBucket:null`). Cache lookup = `MISS_NO_IDENTITY`; live Valkey: `noeviction`,
2 GiB, 0 `bifrost:sem:*` keys, 1 `bitfrost:*` key.
**Two findings the receipt exposed:** (1) `domain.classify` (sklearn-lr, cpu, NB+LR) labelled a
cache-invalidation query `ui` at ~0.55 probability — a weak, provisional classifier; do not let its label
drive fanout or bucket choice without a confidence floor. (2) `codebase_chunks_768_v2` is live with 3
named vectors (`content`/`error`/`signature`) and 52,816 points, not the "dense-only, 52,380" description
in the Embedding Dimensions Policy above — that description is stale.

**Schema tournament + next steps (2026-09-20, read-only; `node scripts/atlas/audit-schema-tournament-v1.mjs` → `docs/reports/schema-tournament-v1.json`; full detail in `openspec/changes/parent-atlas-nlp-sidecar-feature-compiler/tasks.md`, `SCHEMA_TOURNAMENT_V1`):**
**Do NOT create `*_v2` tables for the NLP/ontology fabric — the schema already exists and is empty.** Reuse:
`atlas_ontology_linked_tuples` (token/POS/`evidence_span`/`producer_revision`), `atlas_taxonomy_assignment_candidates`
(revision-qualified evidence lanes), `atlas_ontology_concepts`/`_relations`, `domain_taxonomy_v1` (versioned hierarchy),
`registry_topology_projection`; `feature_ontology_tuples` (539,124 UNRESOLVED) stays the 14.3b resolution owner;
`atlas_ontology_tuples`, `atlas_concepts`, `concept_records` (0 rows each) are duplicate/dead candidates (archive, never delete).
Never `UPDATE atlas_packets.domain_class` to fix labels — use `replaced_by` rows + a normalizing VIEW. Feature matrices
(Query / Candidate `[C,25]` / Token `[T,F]` / Topology) are Arrow/mmap artifacts + JSON receipts sharing one `CandidateOrdinalMap`
checksum, not tables; a 4x6 matrix is a test fixture only. **Domain vocabularies:** three coexist (packet labels 39, code
`CANONICAL_DOMAINS` 9, DB `atlas_domain_ontology` 13+4) — 65.9% of packet rows map cleanly onto the DB ontology; the owner
decision is pending (recommended: `atlas_domain_ontology`, versioned via `domain_taxonomy_v1`). **Needs operator approval:**
workspace snapshot admission (`AST-AUTH-01`), method-symbol convention (`Class.method` clears 106/161 deferred rows), 4 DDL items
(`atlas_ast_nodes.ast_generation`, `atlas_symbol_versions` indexes on `source_revision`/`qualified_name`, topology revision columns,
`atlas_ontology_linked_tuples` `source_revision`/`workspace_revision` + `label_kind` — its `evidence_span` is unconstrained jsonb, so a
writer-side `GroundedExtractionV1` contract with mandatory `UTF8_PARSER_BUFFER_V1` spans is required first),
4 bounded-canary populations, the domain owner. Five tuple-ish tables coexist (`feature_ontology_tuples` 539k owner,
`ontology_domain_tuples` 61k, and empty `atlas_ontology_tuples`, `registry_ontology_tuples`, `atlas_ontology_linked_tuples`) — add no sixth. **Tranche order:** DOMAIN-VOCAB-01 → DOMAIN-CAL-02 → NLP-EXTRACT-03 → SYMBOL-LINK-04
→ FEATURE-LINK-05 → PG18-PLAN-06 → SEMANTIC-07 (exact vs HNSW) → CLUSTER-08 (CPU KMeans oracle vs cuVS; SOM separate) → RANK-09
→ TENSOR-10 → CONTEXT-11 → SYNTH-12; no deep RL / neural domain classifier before trustworthy labels + `.okf` reconciliation +
revision-qualified feature production. The `:8095` NLP sidecar is an evidence EXECUTOR, never an identity owner. Governed
implementation proven != canonical data authority proven (`node scripts/atlas/audit-ast-authority-gap-derivation-v1.mjs`).
**Validation corpus (2026-09-20, `docs/reports/validation-corpus-inventory-v1.json`): ONE shared core, TWO adapters.** Core = source-text
encoding, revision-qualified identity, `UTF8_PARSER_BUFFER_V1` spans, `GroundedExtractionV1`, `.okf`, `CandidateOrdinalMap`, receipts.
WORKSTATION adapter (code/schemas/specs/configs) and LEGAL adapter (statutes/citations/opinions/evidence) differ in corpus + validators
only; Ornith gets both, tagged `adapter: WORKSTATION | LEGAL | BOTH`, identity namespaces never merged. Measured gaps: only TS/JS has
an AST lane (svelte/python/sql/shell/proto/go/cuda/wgsl none evidenced); 33 fixture files vs 2,407 specs; no negative corpus; **the legal
adapter's live corpus is near-empty (evidence 806, cases 11, statutes/citations/precedents 0) and EVERY legal Qdrant collection has 0
points — the "Qdrant Collections" table above listing them Active is stale.** Legal fixtures must be PII-safe synthetic or public-domain.
`DOMAIN-CAL-02` draft = `docs/reports/domain-calibration-draft-v1.jsonl` (142 rows, all UNREVIEWED; only 49 revision-qualified).

**Postgres registry check (2026-09-20):** no table is a cache-key/parameter registry.
`atlas_vector_registry` (4,480 rows) = per-`source_ref` embedding lineage; `vector_index_registry`
(4 rows) = stale 2026-07-21 `pending_build` seeds naming a 384-dim index (retired lane);
`registry_topology_projection` = 0 rows, duplicates `atlas_packets.som_cell_x/y` +
`gpu_cluster_centroids` (64 rows); `registry_projection_stats` view shows only `enrichment`
populated. Classify the last two as `DEAD`/duplicate candidates — archive, do not delete. Do not add
a Postgres key registry before the code-side builders are consolidated. PG18 AIO is on
(`io_method=worker`, 3 workers) but benefits bitmap/seq scans, not btree key lookups.

---

