# Sub-Master Feature TODO — 2026-05-27

**Purpose**: Actionable completion checklist derived from MASTER-FEATURE-TODO-2026-05-20.md.  
**Scope**: Open gates only — items with evidence that they are wired or can be closed in 1-3 sessions.  
**Parent**: `C:\Users\james\Documents\Codex\2026-05-12\ve-updated-the-local-quantization-notebook\MASTER-FEATURE-TODO-2026-05-20.md`

---

## Already Wired (do not re-implement)

| Item | Location |
|---|---|
| ACE preflight tool boundary | `sveltekit-frontend/src/lib/server/ai/ace-prompt-preflight-tool.ts` |
| OpenAI facade calls buildAcePromptPreflight | `sveltekit-frontend/src/lib/server/ai/openai-facade.ts` |
| Detached claude-mem launcher (Postgres-first) | `scripts/opencode/ensure-claude-mem-detached.mjs` |
| engram-embed MCP (stdio, tools/list working) | `sveltekit-frontend/scripts/mcp/engram-embed-mcp.mjs` |
| OpenCode local MCP command-array schema | `opencode.jsonc` + `opencode.json` (fixed 2026-05-27) |
| TRACE MCP Accept headers | `opencode.jsonc` headers field |
| claude-mem-opencode SSR build fix | `sveltekit-frontend/src/lib/server/memory/claude-mem.ts` |
| Atlas audit API 501 stub | `sveltekit-frontend/src/routes/api/atlas/audit/+server.ts` |
| Summary card storage / Neo4j lanes | green per MASTER-FEATURE-TODO |
| Hybrid Postgres retrieval lane | `search:sync:pg`, `search:hybrid:smoke` |
| Redis 8 eval isolated lane | ports 6380/8010/9010 |
| DuckDB native CLI + smoke | `duckdb/smoke-duckdb.ps1` |
| Graph semantic path synthesis (4 stages) | `graph.semantic_path_synthesis` TRACE tool |
| Feature registry overlay | `sveltekit-frontend/docs/atlas/feature-registry.json` |

---

## Open Gates — Priority Order

### P1: MCP Transport Verification (blocks everything else)

- [x] **Verify TRACE MCP at :8788 is running** ✅ verified 2026-05-27
  - Response: `{"serverInfo":{"name":"trace-mcp-server","version":"1.0.0"}}`
  - POST+Accept-header path confirmed working
- [x] **TurboVec health at :8791/:8792** ✅ verified 2026-05-27
  - `:8791` → `{"status":"ok","server":"turbovec-sidecar-mcp"}`
  - `:8792` → `{"ok":true,"backend":"js-centroid-fallback"}`
- [x] **Confirm engram-embed tools list from opencode** ✅ done 2026-05-27
  - Smoke: `opencode mcp list` — engram-embed `✓ connected`
  - Next: call `engram.kv_cache_status` to verify llama-server slots probe works
- [x] **Claude-Mem export path + importer run** ✅ completed 2026-05-27
  - Real SQLite file: `C:\Users\james\.claude-mem\claude-mem.db`
  - 200 observations embedded + upserted to Qdrant `agent_memory_observations` ✅
  - **PYTHONIOENCODING=utf-8 required** — cp1252 chokes on `→` in observation text
  - Canonical run command:
    ```
    PYTHONIOENCODING=utf-8 node scripts/memory/import-claude-mem-observations.mjs \
      --input /c/Users/james/.claude-mem/claude-mem.db --limit 200
    ```
  - Phase 3 (Engram ingestion) is now unblocked

### P2: Atlas Overlay Contract

- [x] **`docs/atlas/feature-registry.json` is populated** — verified 2026-05-27
  - 4209 keys, `missingLiveAtlasContract=false`, all input paths present
  - docsAtlasIndex generated `2026-05-26`, authority latest `2026-05-26`, 1289 Qdrant cluster tags
- [ ] **Wire schema-indexer contract into MCP search routing**
  - Contract cards at: `memory/knowledge/schema-indexer-contract-cards.jsonl`
  - Missing: a route or MCP tool that reads these cards for query routing
  - Add to TRACE MCP or create a standalone `/api/atlas/schema-search` GET handler

### P3: Vector Dimension Drift

- [ ] **Resolve 384d vs 768d drift** (blocks production pgvector DDL)
  - Tables `chat_embeddings`, `document_embeddings`, `evidence_vectors` are still `vector(384)` in live DB
  - Retrieval lanes assume 768d
  - Decision needed: migrate columns OR add dual-dim query path
  - Safe path: add `vector(768)` shadow columns, backfill, swap queries, then drop 384d columns
  - Gate: do NOT run `drizzle-kit push` until this decision is made

### P4: Open Cluster/Synthesis Gates

- [ ] **Cluster card flow — gate on reviewed sourceRefs**
  - Currently `missing` in feature registry
  - Gate: `docs/graph/codebase-map.md` must have stable cluster IDs before cards are generated
  - Command when ready: `npm run graphify:cluster-summaries`
- [ ] **Graph refresh manifest — cache invalidation coordination**
  - Manifest state machine exists (`draft/validated/promoted/archived`)
  - Missing: invalidation signal when graph is re-exported (no pub/sub wired yet)
  - Simple fix: write a manifest version hash to Redis `graph:refresh:version` on each export run
- [ ] **DuckDB Docker/Node loader** (defer until export manifest stabilizes)
  - Do not add yet — depends on `cluster-cards.jsonl` and `pathway-cards.jsonl` being stable

### P5: TS-106 — agent-executor (currently 501 stub)

- [ ] **Implement `runAgentSkill` via TRACE MCP** (Option B from TODO.md)
  - File: `sveltekit-frontend/src/lib/server/agent-executor.ts`
  - Pattern: reuse the existing TRACE MCP HTTP client from `src/lib/server/ai/ace-prompt-preflight-tool.ts`
  - Route: `sveltekit-frontend/src/routes/api/atlas/audit/+server.ts` (currently returns 501)
  - Min viable: call `trace.kag_search` with the audit query, return top-5 results as JSON

### P6: Phase-Lane Status Catch-up

- [ ] **Phase 11 — Engram/Gemma4 memory wiring** (partial → complete)
  - Remaining: `engram.session_context_inject` needs to be called from workspace-bootstrap flow
  - Wire it into `antigravity` agent `prompt` as the first tool call on session start
- [ ] **Phase 12 — Parent Atlas codebase index** (partial → verify)
  - Check: `npm run graphify:daily` outputs `docs/graph/codebase-graph.json` with >1000 nodes
  - If green, mark as implemented
- [ ] **Phase 13 — Feature-gap registry completion** (partial → complete)
  - Missing: cluster card flow and synthesis consumer rows
  - These depend on P4 cluster gate above

---

---

## Phase 10I: Speed + Memory Promotion Gate

**Goal**: Reduce model calls and keep only validated synthesized memory.

### Benchmarking
- [ ] Benchmark Ollama vs llama-server vs vLLM/TurboQuant for Gemma4
  - Measure: tokens/sec, TTFT, VRAM usage at 16K / 64K context
  - Track: `TURBO_PROFILE=stock` baseline vs `turboquant` vs Ollama fallback
  - Output: `docs/reports/gemma4-inference-benchmark-$(date).md`

### ACE Packet Caching
- [ ] Cache ACE packets by query hash
  - Key: `ace:ctx:<sha256(query+pipeline)>` in Redis (TTL 1h)
  - On hit: skip preflight entirely, return cached packet
  - Already partially wired in `ace-prompt-preflight-tool.ts` — verify hot-path is checked first
- [ ] Store hot cards as MessagePack
  - Replace JSON serialization for `ace:card:*` and `gpu:karpathy:scores` Redis values
  - Use `msgpackr` (already in tree) for ~40% size reduction
  - Keep JSON fallback for debugging / `mcp list` inspection

### Memory Promotion States
- [ ] Add promotion state field to `summary_cards` and `ace_chunks` tables
  - States: `active` | `superseded` | `archived` | `rejected`
  - Migration: `ALTER TABLE summary_cards ADD COLUMN IF NOT EXISTS promotion_state text NOT NULL DEFAULT 'active'`
  - Index: `CREATE INDEX IF NOT EXISTS idx_summary_cards_promotion ON summary_cards(promotion_state)`
- [ ] Add `does_it_supersede` validation before saving new memory
  - Before INSERT: cosine-search existing cards at threshold 0.92
  - If match found AND new card has higher `grpoRewardScore`: mark old as `superseded`, insert new
  - If match found AND scores are equal: skip insert (dedup)
  - If no match: insert as `active`
- [ ] Archive raw logs after summary extraction
  - Trigger: after `context_timeline` row is summarized into a `summary_card`
  - Action: set `context_timeline.archived_at = NOW()` — keep row but exclude from ACE queries
  - Gate: raw `context_timeline` rows must never enter the ACE packet prefix directly
- [ ] Keep only sourceRef-linked summaries in ACE
  - ACE packet builder must filter: only cards with `source_refs IS NOT NULL AND array_length(source_refs,1) > 0`
  - Unsourced summaries → `rejected` promotion state, excluded from retrieval

### Production Gemma4 + AnythingLLM / LangGraph Agents
- [ ] Wire production Gemma4 endpoint through AnythingLLM
  - AnythingLLM custom provider → `http://127.0.0.1:8090/v1` (TurboQuant llama-server)
  - Model ID: `gemma4-legal.gguf`
  - System prompt injection: ACE startup packet → AnythingLLM workspace system prompt
- [ ] LangGraph agent integration
  - LangGraph node: `ace_retrieval` → calls TRACE MCP `kag_search` + `context.build_kv_packet`
  - LangGraph node: `gemma4_generate` → POST to llama-server `/v1/chat/completions` with `cache_prompt: true`
  - LangGraph node: `memory_promote` → runs `does_it_supersede` check then upserts `summary_cards`
  - Edge: `ace_retrieval → gemma4_generate → memory_promote → END`
  - Keep LangGraph as orchestration layer only — no direct DB/Qdrant access from graph nodes
- [ ] Engram KV cache prime on session start
  - Call `engram.session_context_inject` as first step in `antigravity` and `hermes-ace` agent flows
  - This warms the llama-server KV slot with the ACE system prefix before any user query

### Acceptance Criteria
- [ ] Repeated query hits Redis `ace:ctx:*` (no preflight rerun)
- [ ] Raw `context_timeline` rows do not appear in ACE packet content
- [ ] Old memories can be marked `superseded` and are excluded from new retrievals
- [ ] ACE packet token size decreases by ≥15% vs current baseline
- [ ] Answer quality does not drop (spot-check 10 legal queries, compare output)

---

## Scope Corrections (record, no action needed)

**claude-mem-opencode is agent session memory only** — not retrieval infrastructure.
See `docs/opencode/TODO.md` → "Claude-Mem Scope Correction" for the full boundary spec.

**pgvector 384d/768d drift** — no new DDL until dimension decision is made. See P3 above.

**TRACE MCP is the canonical retrieval boundary** — Gemma4 calls TRACE tools, not gRPC/Qdrant/Neo4j directly.

---

## Execution Order

```
P1 TRACE health → P1 engram smoke → P1 claude-mem export
  → P2 atlas overlay verify
    → P4 cluster card flow (after P2 green)
      → P4 manifest invalidation
        → P5 agent-executor (after TRACE health)
  → P3 vector drift decision (operator gate, separate timeline)
```

---

---

## Phase 10K: Daily Chat Analysis + User Recommendations

**Goal**: Wire the existing `chunk_hit_log` / `context_timeline` / `search_analytics` signal tables into the already-present recommendations routes so users get personalized case/evidence/query suggestions from their real chat history — without reading giant markdown files or re-running ACE on every load.

**Existing infrastructure (do not rebuild):**
- `src/routes/api/recommendations/+server.ts` — GET (list) + POST (create) ✅ exists
- `src/routes/api/recommendations/track/+server.ts` — POST (track interaction) ✅ exists
- `src/routes/api/recommendations/[userId]/+server.ts` — GET (per-user) ✅ exists
- `src/lib/server/analytics/search-analytics.ts` — `getHotQueries`, `getChunkQualitySignals`, `getClusterHeatMap` ✅ exists
- `src/lib/server/analytics/reward-events.ts` — RL signal adapter ✅ exists
- `chunk_hit_log`, `context_timeline`, `search_analytics` Postgres tables ✅ exist
- `gpu:karpathy:scores` Redis hash (24h TTL) ✅ exists

**What's missing — the wiring:**

### Background Processing (daily / on-demand)
- [ ] Create `scripts/daily/generate-user-recommendations.mjs`
  - Reads `chunk_hit_log` (last 7 days, grouped by `user_id`)
  - Reads `context_timeline` (event_type IN `citation_saved`, `dwell_long`, `rl_adapt`)
  - Reads `search_analytics.hot_queries` (top-20 per user)
  - Joins with `gpu:karpathy:scores` for authority boost
  - Outputs: ranked list of `{case_id, evidence_id, query_suggestion, score, reason}` per user
  - Upserts to `recommendations` table (or Redis `user:rec:<user_id>` hash, TTL 24h)
  - npm alias: `npm run recs:daily`
  - Schedule: wire into heavy startup lane in `ace-incremental-startup.mjs` (after karpathy:gpu)

### API wiring (connect signals → recommendations)
- [ ] Update `GET /api/recommendations` to read from Redis `user:rec:<user_id>` first (L1), fall back to Postgres
- [ ] Update `GET /api/recommendations/[userId]` to join with `chunk_hit_log` for freshness scoring
- [ ] Add `GET /api/analytics/user-activity-summary` — aggregates per-user signals for dashboard display
  - Returns: `{ topCases, frequentQueries, recentCitations, activityHeatmap }`
  - Source: `context_timeline` + `chunk_hit_log` + `search_analytics`
  - Redis cache: `user:activity:<user_id>` (TTL 1h)

### Chat history indexing (background, not request-critical)
- [ ] Add RabbitMQ consumer for `chat.context` queue → on new chat message, fire-and-forget:
  - Extract query intent via `search_analytics.recordSearchQuery`
  - Update `chunk_hit_log` for any ACE chunks referenced in the response
  - Skip if `context_timeline` already has this session's `tool_call` event (dedup)
- [ ] Add `POST /api/analytics/chat-index` — manual trigger for re-indexing past chat sessions
  - Auth-guarded, rate-limited (1 req/user/5min)
  - Reads `chat_messages` table for the calling user, batches through analytics pipeline

### OpenCode binary reference (do not re-probe)
- Binary: `C:\ProgramData\chocolatey\lib\opencode\tools\opencode.exe` (v1.14.39, 151MB)
- Shim: `C:\ProgramData\chocolatey\bin\opencode` → above
- npm: also available as `npx opencode@1.14.39`

### CUDA build status (sm_86 confirmed working 2026-05-27)
- `simd-bridge/cpp/build/Release/tensorrt_bridge.node` — 349KB, all 6 GPU functions exported ✅
  - `kmeansWithCentroids`, `trainSOM`, `pageRankGPU`, `attentionScoreGPU`, `rewardScoreGPU`, `batchCosineSimilarity`
- cmake flags: `-gencode arch=compute_86,code=sm_86` (RTX 3060 Ti Ampere)
- LibTorch: found ✅ | simdjson vendor: found ✅
- `isCudaAvailable()` returns `n/a` from bash (DLL path issue outside dev server) — addon works inside SvelteKit via PATH

### Acceptance Criteria
- [ ] `npm run recs:daily` runs without Gemma4 (CPU-only signal aggregation)
- [ ] `GET /api/recommendations` returns personalized results backed by real chat history
- [ ] Redis `user:rec:<user_id>` populated after daily run, served in <10ms on repeat load
- [ ] `GET /api/analytics/user-activity-summary` returns correct shape (no 501)
- [ ] Background chat indexing does not block SSE chat response path

---

## Quick Reference: What Each Phase Needs

| Phase | Blocker | Command/File |
|---|---|---|
| TRACE MCP | Server must be running | `curl POST :8788/mcp` |
| engram-embed | ✅ stdio connected | `opencode mcp list` |
| claude-mem export | Find SQLite file | `scripts/memory/import-claude-mem-observations.mjs` |
| feature registry | `npm run knowledge:index-gap:refresh` | `sveltekit-frontend/docs/atlas/feature-registry.json` |
| cluster cards | Stable `codebase-map.md` | `npm run graphify:cluster-summaries` |
| agent-executor | TRACE health | `sveltekit-frontend/src/lib/server/agent-executor.ts` |
| vector drift | Operator decision | ALTER TABLE chat_embeddings ALTER COLUMN ... |

---

## Phase 10J: Scenario Cache / Robot Greeting Mode

**Goal**: Eliminate Gemma4 calls for high-confidence repeated or semantically similar queries by returning cached scenario responses. Works on CPU-only nodes (Raspberry Pi, embedded chatbots) — full RAG only when truly needed.

**Caveman rule**: Robot does not think about the bathroom every time. Robot remembers. Robot only thinks when the question is new.

### Pipeline (retrieval-first, cache-first)

```
User prompt
  ↓ normalize + lowercase
  ↓ SHA-256 hash → Redis exact match (ace:scenario:exact:<hash>)  ← Tier 1
  ↓ miss → embed prompt (CPU: small model / GPU: embeddinggemma)
  ↓ Qdrant scenario_cache collection ANN search (top-3)
  ↓ TurboVec rerank (CPU: cosine / GPU: batchCosineSimilarity)    ← Tier 2
  ↓ confidence check
    ≥ 0.90 → return cached response (no LLM)
    0.75–0.89 → Gemma4 micro-rewrite: "Rewrite for this user: {cached_response}"
    < 0.75 → full ACE/RAG packet → Gemma4                        ← Tier 3
  ↓ if new useful answer: validate sourceRef → store new scenario
```

### Scenario Storage Schema

Drizzle table `scenario_cache` (add to `schema-postgres.ts`):
```sql
CREATE TABLE IF NOT EXISTS scenario_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  scenario_id text UNIQUE NOT NULL,          -- e.g. "mall_restroom_directions"
  triggers text[] NOT NULL DEFAULT '{}',     -- canonical trigger phrases
  response text NOT NULL,                    -- cached answer text
  embedding_id text,                         -- Qdrant point ID in scenario_cache collection
  confidence_threshold real NOT NULL DEFAULT 0.88,
  requires_llm boolean NOT NULL DEFAULT false,
  source_refs text[] NOT NULL DEFAULT '{}',  -- must be non-empty to enter ACE
  promotion_state text NOT NULL DEFAULT 'active',  -- active | superseded | archived
  hit_count integer NOT NULL DEFAULT 0,
  last_hit_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scenario_cache_promotion ON scenario_cache(promotion_state);
CREATE INDEX IF NOT EXISTS idx_scenario_cache_triggers ON scenario_cache USING gin(triggers);
```

Redis keys:
- `ace:scenario:exact:<sha256(normalized_prompt)>` → scenario JSON (TTL 6h)
- `ace:scenario:session:<chat_session_id>` → last injected system prompt (TTL 24h, aligned to `chat_sessions` table)

### Startup System Prompt Cache (per chat session)

- Key: `ace:scenario:session:<chat_session_id>` in Redis (TTL 24h)
- On session start: check Redis → if hit, inject cached system prompt prefix directly, skip ACE preflight
- On miss: run ACE preflight → store result in Redis keyed by `chat_sessions.id`
- Drizzle join: `chat_sessions.id` → `ace:scenario:session:<id>` → warm KV slot via `engram.session_context_inject`
- Gate: only cache session prompts where ACE packet has `cacheHit: false` AND `selectedCards.length > 0` (validated content)

### CPU/GPU Split for Edge Deployment

| Step | CPU (Raspberry Pi / embedded) | GPU server |
|---|---|---|
| Normalize + hash | ✅ CPU | ✅ CPU |
| Redis exact lookup | ✅ CPU (Redis/SQLite) | ✅ CPU |
| Embed prompt | small model (384d MiniLM via ONNX) | embeddinggemma 768d |
| Qdrant ANN | ✅ CPU (local Qdrant or SQLite-vec) | ✅ GPU-accelerated Qdrant |
| TurboVec rerank | cosine dot product, CPU | batchCosineSimilarity N-API |
| Gemma4 rewrite | ❌ → remote GPU call (POST /api/ai/chat) | ✅ local llama-server |
| Full ACE/RAG | ❌ → remote GPU call | ✅ TRACE MCP + Gemma4 |
| Store new scenario | ✅ POST /api/scenarios/save | ✅ direct Drizzle insert |

On Raspberry Pi: Redis/SQLite for Tier 1 exact cache + small 384d embedding model for Tier 2 scenario search. Gemma4 calls only go to remote GPU server when confidence < 0.75.

### MessagePack Layering

Scenario cache entries stored as MessagePack in Redis (`ace:scenario:exact:*`) for ~40% size reduction. JSON fallback for `/api/scenarios` endpoint inspection. Use `msgpackr` (already in tree).

### Tasks

- [ ] Add `scenario_cache` Drizzle table to `schema-postgres.ts` + manual migration SQL
  - File: `sveltekit-frontend/drizzle/manual/scenario_cache.sql`
  - Gate: do NOT push until vector drift (P3) is decided
- [ ] Create Qdrant `scenario_cache` collection (768d, cosine)
  - Script: `npm run scenarios:index` → reads `scenario_cache` table, upserts to Qdrant
- [ ] Implement `$lib/server/ai/scenario-cache.ts`
  - Exports: `lookupScenario(prompt, sessionId)` → `ScenarioCacheResult | null`
  - Tier 1: Redis SHA-256 exact match
  - Tier 2: Qdrant ANN + TurboVec rerank
  - Returns: `{ response, confidence, requiresLlm, scenarioId }`
- [ ] Wire into `openai-facade.ts` before ACE preflight call
  - If `confidence ≥ 0.90`: return cached response, set `yorha.cacheHit = 'scenario'`
  - If `0.75–0.89`: call Gemma4 with micro-rewrite prompt, set `yorha.cacheHit = 'scenario:rewrite'`
  - If `< 0.75`: fall through to existing ACE preflight
- [ ] Cache startup system prompt per `chat_session_id`
  - Key: `ace:scenario:session:<id>` (TTL 24h)
  - Wire into session start flow: check key → inject → skip preflight on hit
  - On ACE build: write result to `ace:scenario:session:<id>` if `!cacheHit && selectedCards.length > 0`
- [ ] Add `POST /api/scenarios/save` route
  - Auth-guarded, Zod-validated
  - Validates `sourceRefs.length > 0` before insert (same gate as ACE)
  - Sets `promotion_state = 'active'`, queues Qdrant upsert via RabbitMQ `vector.index`
- [ ] Seed initial scenario set
  - File: `scripts/seed-scenarios.mjs` — 20–30 FAQ/greeting scenarios for legal app
  - Covers: case status FAQs, evidence upload questions, navigation help, legal term definitions

### Acceptance Criteria

- [ ] Greeting/FAQ queries (`where is X`, `how do I Y`) avoid Gemma4 entirely (confidence ≥ 0.90)
- [ ] Repeated identical prompts hit Redis exact cache (`ace:scenario:exact:*`)
- [ ] Semantically similar prompts hit Qdrant scenario cache (Tier 2)
- [ ] Full ACE packet only triggered below 0.75 confidence threshold
- [ ] Raspberry Pi path: small 384d model + Redis/SQLite → remote GPU only for Tier 3
- [ ] Session system prompt cached per `chat_sessions.id`, injected without re-running preflight
- [ ] Saved scenarios require `source_refs` non-empty (no unsourced caching)
- [ ] `yorha.cacheHit` in facade response reflects `'scenario'` | `'scenario:rewrite'` | `'ace'` | `'none'`

### Future / Phase 11 tail

- [ ] LibTorch GPU CUDA JSON string parsing for scenario batch scoring (Phase 10B lane)
- [ ] AnythingLLM workspace auto-prime from `ace:scenario:session:*` on workspace open
- [ ] LangGraph `scenario_lookup` node: runs Tier 1+2 before `ace_retrieval` node
- [ ] Export scenario set as portable SQLite for offline/air-gapped edge nodes
- [ ] Modular deployment bundle: scenario SQLite + small ONNX embed model + Redis → single Docker image for Pi/embedded chatbot

---

## Infrastructure Already Complete (SESSION_2026-04-12 context — do not re-implement)

These are done. Listed here so future sessions don't re-open them as gaps.

| Feature | Status | Reference |
|---|---|---|
| 3-Tier Cache (L1 Redis 5ms, L2 Bifrost 2-5s, L3 Ollama 25s) | ✅ PRODUCTION READY | `redis-exact-match.ts`, `bifrostChat()`, port 3040 |
| Langfuse observability (7 endpoints traced) | ✅ LIVE | error-brain, codebase-index, synthesis worker, 5 RabbitMQ queues |
| RabbitMQ 7-queue architecture | ✅ LIVE | `rabbitmq-manager-fixed.ts`, `dispatch-inline` wired |
| simdjson N-API addon (AVX2, 2-5× JSON speedup) | ✅ BUILT | `tensorrt_bridge.node` 349KB, sm_86 |
| LibTorch CUDA bridge (100× batch cosine) | ✅ BUILT | `libtorch-bridge.ts`, all 6 GPU functions exported |
| Phase AC — Atlas ↔ CHR97 cartridge bridge | ✅ COMPLETE | `atlas-cartridge-seeds.ts`, 4173 seeds generated |
| KG phases 1-6 (Neo4j + CouchDB + PageRank) | ✅ COMPLETE | `run-pagerank.ts`, `run-hypergraph.ts`, 1016 nodes |
| Karpathy GPU authority blend (0.4·PR+0.3·attn+0.3·authority) | ✅ WIRED | `gpu:karpathy:scores` Redis hash (24h TTL) |
| OpenAI-compatible v1 facade | ✅ LIVE | `POST /api/v1/chat/completions`, `GET /api/v1/models` |
| AGENTS.md relationship spine (3 Postgres tables) | ✅ COMPLETE | `agent_context_files`, `directory_context_bindings`, `ace_context_sources` |
| SeaweedFS S3 gateway (MinIO deprecated) | ✅ LIVE | port 8333, `SEAWEED_S3_PORT` override in `env.server.ts` |
| Dispatch-inline for RabbitMQ (8 queues) | ✅ PRODUCTION READY | `DISPATCH_INLINE_COMPLETE.md` |
| Redis permanent prod config (2GB, LRU, RDB snapshots) | ✅ PERMANENT | `docker-compose.yml` both containers |
| Codebase index (3140 files, 768d Qdrant) | ✅ INDEXED | `codebase_chunks_768` collection |
| RL feedback loop (context_timeline + adaptFromAnalytics) | ✅ WIRED | 6 routes wired, dwell tracking live |
| Route test stubs G16 (355 mutating routes) | ✅ GENERATED | `tests/routes/auto/`, `generate-route-test-stubs.mjs` |
| SOM topology on Neo4j (HAS_SOM_POSITION edges) | ✅ WIRED | `directory-summarizer.ts`, `HAS_DIRECTORY_SUMMARY` |
| Atlas lane health loop + output files | ✅ COMPLETE 2026-05-28 | `scripts/atlas/atlas-lane-health-loop.mjs` → `reports/atlas-lane-health-loop.md` |
| VS Code extension performance log | ✅ COMPLETE 2026-05-27 | `scripts/vscode-extension-performance-log.mjs` |

**What IS still open from SESSION context:**
- Playwright test fixtures for Track C production gap remediation
- `.env` audit for SeaweedFS + SEAWEED_* vars across all callers
- Model/GGUF cleanup (old MinIO admin commands still referenced in docs)
- `cases.user_id uuid → integer` migration (blocks case-seed in `tests/global-setup.ts`)

---

## Startup Audit Gate Failures (run: 2026-05-27T19-37-18)

Source: `sveltekit-frontend/memory/runs/2026-05-27T19-37-18/audit_failures.json`  
Gates failing: G17 (21), G18 (6), G19 (4), G25 (1) — total 32 violations

### G17 — Hardcoded localhost (21 violations)

All files below use `localhost` or `127.0.0.1` directly instead of `ENV.*` getters from `env.server.ts`.
Fix: replace literals with the appropriate `ENV.OLLAMA_URL`, `ENV.REDIS_URL`, `ENV.QDRANT_URL`, etc.

| File | Fix needed |
|---|---|
| `src/lib/server/cache/ace-packet-cache.ts` | Use `ENV.REDIS_URL` |
| `src/lib/server/cache/cache-invalidation.ts` | Use `ENV.REDIS_URL` |
| `src/lib/server/cache/semantic-cache.ts` | Use `ENV.REDIS_URL` or `ENV.BIFROST_URL` |
| `src/lib/server/analytics/ldr-client.ts` | Use `ENV.*` for LDR endpoint |
| `src/lib/server/features/feature-map-store.ts` | Use `ENV.*` |
| `src/lib/server/ai/preflight.ts` | Use `ENV.OLLAMA_URL` / `ENV.LLAMA_SERVER_URL` |
| `src/lib/server/langextract/mcp-langextract.ts` | Use `ENV.TRACE_MCP_URL` (`:8788`) |
| `src/lib/server/observability/cache-logger.ts` | Use `ENV.LANGFUSE_URL` or `ENV.REDIS_URL` |
| `src/lib/server/observability/synthesis-logger.ts` | Use `ENV.*` |
| `src/lib/server/ai/opencode-skill.ts` | Use `ENV.*` |
| `src/lib/server/ai/learning-loop.ts` | Use `ENV.*` |
| `src/lib/server/ai/langgraph-dag.ts` | Use `ENV.*` |
| `src/lib/server/ai/gemma4.ts` | Use `ENV.OLLAMA_URL` / `ENV.LLAMA_SERVER_URL` |
| `src/lib/server/ai/hermes/deep-research-dag.ts` | Use `ENV.*` |
| `src/lib/server/ai/execution-transition-memory.ts` | Use `ENV.*` |
| `src/lib/server/ai/gemma4-intent-engine.ts` | Use `ENV.*` |
| `src/lib/server/ai/agentic-diagnostic.ts` | Use `ENV.*` |
| `src/lib/server/ai/agent-worker.ts` | Use `ENV.*` |
| `src/lib/server/ai/auto-fix.ts` | Use `ENV.*` |
| `src/lib/server/ai/ace-builder.ts` | Use `ENV.*` |
| `src/lib/server/ai/accelerator-capabilities.ts` | Use `ENV.*` |

**Batch fix approach**: `rg -l "localhost" sveltekit-frontend/src/lib/server/ --type ts | grep -v env.server` gives the full list. Replace with `ENV.*` from `src/lib/server/env.server.ts`. Run `rg "localhost" src/lib/server/ --type ts` to verify 0 hits outside `env.server.ts` after fix.

### G18 — Missing auth guard (6 violations)

All 6 routes must add `if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 })` at the top of each handler.

| File | Handler type |
|---|---|
| `src/routes/api/ace/stream/+server.ts` | SSE stream — add auth before starting stream |
| `src/routes/api/ace/packet/+server.ts` | GET/POST — add auth check |
| `src/routes/api/chat/stream/+server.ts` | SSE stream — add auth before starting stream |
| `src/routes/api/atlas/audit/+server.ts` | Currently 501 stub — add auth when implementing |
| `src/routes/api/internal/index-memory/+server.ts` | Internal indexing — should be auth + admin-role check |
| `src/routes/api/memory/status/+server.ts` | Status endpoint — add auth |

### G19 — Missing Zod validation (4 violations)

4 API routes accept POST/PATCH body without Zod schema validation. Audit gates found 4 hits but filenames are not in `audit_failures.json` — run to find them:

```bash
rg --type ts -l "export async function POST|export async function PATCH" sveltekit-frontend/src/routes/api/ \
  | xargs grep -L "from.*zod\|z\.\|zodSchema\|superValidate"
```

Fix pattern for each:
```typescript
import { z } from 'zod';
const schema = z.object({ /* fields */ });
const parsed = schema.safeParse(await request.json());
if (!parsed.success) return json({ error: 'Invalid input' }, { status: 400 });
```

### G25 — Rune call in plain `.ts` file (1 violation)

| File | Issue | Fix |
|---|---|---|
| `src/lib/server/graph/codebase-scanner-v2.ts` | `$state` or `$derived` call in plain `.ts` (not `.svelte.ts`) | Rename to `.svelte.ts` OR replace rune with plain class/ref pattern |

**Note**: Runes are inert in plain `.ts` — they compile but don't react. This is a silent correctness bug, not a crash.

### Audit gate fix priority

```
G25 (1 file, easy rename) → G18 (6 auth guards, ~5 min each) → G19 (4 Zod schemas) → G17 (batch ENV.* substitution)
```

Run after fixing: `node sveltekit-frontend/scripts/run-audit-gates.mjs` (or equivalent) to verify gate counts drop to 0.
