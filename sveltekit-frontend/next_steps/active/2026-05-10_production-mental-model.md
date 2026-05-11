# Production-Ready Mental Model — 7 Orthogonal Lanes

**Status**: planning / synthesis. **NOT a sprint plan — a checklist that ties lanes together.**
**Created**: 2026-05-10
**Companion docs**:
- `next_steps_research.md` — feature-completeness audit
- `next_steps/active/2026-05-10_rotorquant-bitnet-cache-hierarchy.md` — inference-lane detail
- `next_steps/active/2026-05-10_service-worker-regex-tool-router.md` — client+backend lane detail
- `memory/MEMORY.md` — auto-memory index
- `CLAUDE.md` — durable architectural rules

---

## 0. Why this doc exists

Production-readiness isn't one bar — it's 7 bars, one per orthogonal lane. A lane being green doesn't help another lane. Don't let a quantization win delay a Drizzle migration; don't let a Postgres fix delay a Service Worker deploy. This doc captures the mental model so the next operator (or you, in 3 weeks) doesn't conflate them.

**The atlas-indexing-GPU-Karpathy-semantic-search work spans lanes 0, 2, 3, 5.** It does NOT touch 1, 4, 6, 7. Keep that scope tight.

---

## 1. The 7 lanes (visual)

```
                ┌──────────────────────────────────────┐
                │ 7. Operations (Docker, deploy, keys) │
                └──────────────────────────────────────┘
                              ▲
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
┌───────┴──────┐    ┌─────────┴─────────┐    ┌──────┴────────┐
│ 1. Framework │    │ 6. Observability  │    │ 2. Data layer │
│   (SK + DZ)  │    │ (Langfuse, gates) │    │ (PG/Qd/Neo4j) │
└───────┬──────┘    └───────────────────┘    └──────┬────────┘
        │                                            │
        ├──────────────┐               ┌─────────────┤
        ▼              ▼               ▼             ▼
┌──────────────┐  ┌─────────┐  ┌──────────────┐  ┌──────────┐
│ 4. Client    │  │ 3. Retr │  │ 5. Backend   │  │ 0. Infer │
│ (SW/runes)   │  │ + Atlas │  │ (services)   │  │ (GPU/KV) │
└──────────────┘  └─────────┘  └──────────────┘  └──────────┘
```

---

## Lane 0 — Inference (GPU, quantization, cache hierarchy)

**Production bar**: cold-prompt → first token ≤ 5s; cache hit ≤ 50ms; no OOM at 16K context with VLM.

- ✅ Gemma 4 VLM merged (`gemma4-legal-vlm:latest`, 5.3 GB, mmproj fused)
- ✅ TurboQuant binary path env-flagged (`LLAMA_SERVER_PATH`, `TURBO_PROFILE` stock / turboquant / turboquant-safe)
- ✅ KV cache `q8_0/q8_0` stable on stock binary; `q8_0/turbo3` if test1111 fork present
- ✅ Bifrost L2 semantic cache live on :3040
- ✅ Redis L1 exact-match (5ms) live on :6379
- ✅ N-API GPU bridge (`tensorrt_bridge.node`) with 5 exported functions verified
- ⏳ Tier-2 NVMe warm cache for KV blocks (designed in `2026-05-10_rotorquant-bitnet-cache-hierarchy.md`, not built)
- ⏳ Per-layer cache profile for Gemma 4 (SWA `q8_0/turbo3`, global `q8_0/q8_0`)
- ❌ CUDA Graph capture for `attentionScoreGPU` (deferred behind Nsight baseline)
- ❌ RotorQuant Gemma 4 head_dim verification (1-day spike)

**Done means**: 20-gen stability harness green, Nsight shows SM utilization ≥ 70% on rerank kernel, NVMe re-warm path beats cold prefill on 16K context.

---

## Lane 1 — Framework (SvelteKit 2 + Drizzle + Svelte 5 + bits-ui v2)

**Production bar**: `svelte-check` 0 errors, `vite build` PASS, all 47 audit gates green, no Svelte 4 patterns.

- ✅ SvelteKit 2.59.1, Svelte 5.53.3, bits-ui 2.16.2 (current)
- ✅ Drizzle 0.45.2 + drizzle-kit 0.31.10
- ✅ G21-G25 rune-compliance: 0 hits across `export let`, `$:`, `on:event`, `createEventDispatcher`, `$state` in `.ts`
- ✅ G26 route-test pattern (lazy import + `@vitest-environment node`)
- ✅ Superforms v2 wired with Zod adapter
- ✅ UnoCSS svelte-scoped mode app-wide (NOT mixing with Tailwind / shadcn-svelte)
- ✅ Schema convergence: 25 root `schema-*.ts` files consolidated to `schema-postgres.ts` + `schema/*.ts` subdir
- ⏳ Drizzle introspect pass to surface DB-vs-schema drift (3 remaining columns: `category`, `file_path`, `crimes` table)
- ⏳ 6 fat route handlers extracted to `lib/server/handlers/` (PR-4 in consolidation queue)
- ❌ ARCHITECTURE.md mapping 75+ server subsystems → feature domains (PR-7, deferred)

**Done means**: `svelte-check` 0 errors, all rune gates 0 hits, schema drift down to zero, no `+server.ts` over 1000 LoC.

---

## Lane 2 — Data layer (Postgres + Qdrant + Neo4j + CouchDB + Redis)

**Production bar**: every `user_id` column type-matches its FK; every Qdrant collection has dual vectors + payload tags; every Neo4j label has a typed edge; backup + restore tested.

- ✅ Postgres 16 + pgvector, 70+ tables, 14 enums
- ✅ Qdrant 6 collections (`evidence_items`, `legal_documents`, `legal_cases`, `codebase_chunks_768`, `chat_messages`, `embedding_cache`) with 768-dim
- ✅ Neo4j with `SIMILAR_TOPOLOGY`, `BELONGS_TO_CLUSTER`, `SHARES_TAGS`, `IMPORTS` edges
- ✅ CouchDB `couchdb:pagerank_scores` view (6h TTL, JSON string)
- ✅ Redis ACE keys: `gpu:karpathy:scores`, `ace:topo:*`, `ace:authority:top`, 1135 atlas dirs + 4507 module cartridges
- ✅ `context_timeline` table for RL signals (integer `user_id`, FK to `users.id`)
- ⏳ Schema drift: `persons_of_interest.description` column missing (one ALTER TABLE)
- ⏳ Schema drift: `admin_ai_chat_sessions.context_tag`, evidence-related columns
- ❌ Backup + restore drill (untested; **production blocker**)
- ❌ Lucia integer-vs-uuid `user_id` split across 44 tables documented but not migrated (CLAUDE.md "Schema Mismatch" — 24 uuid columns still won't return rows for integer Lucia users)

**Done means**: `drizzle-kit introspect` against prod returns zero unexpected drift; restore-from-backup completes in ≤ 30 min; all 44 `user_id` columns either integer-FK or documented as deliberate orphans.

---

## Lane 3 — Retrieval + Atlas indexing + Karpathy blend (semantic search)

**Production bar**: cold query ≤ 5s, warm query ≤ 500ms, Karpathy blend feeds ≥ 10% of ranking signal, atlas + hyperrag smoke gates green.

- ✅ ACE Stage A0 with topo-byte Redis cache (TTL 300s, skip Qdrant on hit)
- ✅ Karpathy blend live: `0.4·PR + 0.3·attn + 0.3·authority` in `gpu:karpathy:scores` (24h TTL, 11 entries verified)
- ✅ Hypergraph 4-lane: `cluster_context`, `shared_resource`, `agents_context`, `vault_link` (282 edges)
- ✅ SOM topology coords on Neo4j edges + nodes (`HAS_DIRECTORY_SUMMARY`)
- ✅ KAG operator routing (Phase B done — `intent-router.ts`, 6 labels)
- ✅ Atlas smoke gates G-A1..G-A17 (17/17)
- ✅ HyperRAG smoke gates G-HR1..G-HR10 (10/10)
- ✅ Trust-tier sanitizer + T1/T2 fence (`ACE_PIPELINE_VERSION=3.0.0`)
- ⏳ Phase 1B: Postgres GIN tsvector + bm25 ranking (parallel agent in flight)
- ⏳ RRF fusion: `rrf-fuse` exists but not wired for legal-query lane in production cascade
- ❌ 4D-aware RRF with SOM-cell adjacency bonus (in design doc, not built)
- ❌ Cross-encoder rerank in production cascade (`cross-encoder-reranker.ts` exists, not enabled by flag)

**Done means**: smoke gates 27/27 green, 4D RRF wired, cross-encoder rerank flag-on default, Karpathy refresh cron at 3am succeeding 7 days running.

---

## Lane 4 — Client (SW, runes, IndexedDB)

**Production bar**: SW updates within 24h of deploy without forcing reload; offline RL signals reach `context_timeline` 100% on reconnect; client inference path returns ≤ 1s for simple queries.

- ✅ Svelte 5 runes everywhere (30 `.svelte.ts` stores, class-backed)
- ✅ Service Worker v1.6.0 with analytics POST interception scaffolding
- ✅ `sw-register.ts` + `timeline-client.ts` modules present
- ✅ ONNX client inference (`gemma3_270m_onnx`) with WebGPU → WASM → CPU fallback
- ✅ IndexedDB + LokiJS dual-tier client cache
- ⏳ SW offline queue → batch POST to `/api/analytics/context-timeline` (designed, partial implementation)
- ⏳ SW dead-letter store with 7-day TTL
- ❌ Browser-side bitnet.c via WASM (alternative to ONNX path — long-term R6)
- ❌ E2E test for offline buffer (in test plan, not written)

**Done means**: Playwright offline-buffer test green, SW version bump policy in place, RL signal loss rate < 0.1% on flaky connections.

---

## Lane 5 — Backend (services, gRPC, MCP, sidecars)

**Production bar**: all sidecars idempotent on restart, gRPC fallback cascade tested, MCP `tools/list` ≥ 70 tools registered, no service has > 1 critical-path single point of failure.

- ✅ MCP `:8788` with 88 tools across 11 namespaces (verified live)
- ✅ MCP per-request transport fix (G38 — no module-scope singleton)
- ✅ Zod schema fix (G34 — no Zod 3 single-arg `z.record(...)` in tool schemas)
- ✅ gRPC clients: 6 wired with HTTP + inline fallbacks (embedding, retrieval, tool-calling)
- ✅ RabbitMQ 7 queues with synthesis worker
- ✅ Bifrost on :3040, TurboQuant on :8090, Triton on :8000, TensorRT-LLM on :8099
- ⏳ Port 50055 collision (CHR97 + go-search-service)
- ⏳ Generation gRPC client (:50052) orphaned (no consumers)
- ⏳ Graph-ML gRPC (`GRAPH_ML_GRPC_URL` missing from `env.server.ts`)
- ⏳ Fat route handlers (chat-stream 2603 LoC, evidence-upload 2320 LoC) → extract to `lib/server/handlers/`
- ❌ Phase D MCP hooks design (mentioned in handoff #4, unblocked but not built)

**Done means**: zero orphaned gRPC clients, all sidecar ports documented in `grpc-service-map.md`, fat handlers extracted, Phase D hooks live.

---

## Lane 6 — Observability (Langfuse, audit gates, metrics)

**Production bar**: every LLM call traced; every retrieval has provenance; every cache layer has hit-rate metrics; alerts fire on regression > 20%.

- ✅ Langfuse on :3030 with 7+ traced endpoints
- ✅ 47-gate audit system (G1-G55 + G-HR1-G-HR10)
- ✅ Backend Infrastructure Audit (17 gates) via `scripts/audit/backend-infrastructure-audit.sh`
- ✅ Cache stats endpoint `/api/cache/exact-match/stats`
- ✅ `context_timeline` audit trail with keyset pagination
- ✅ Redis monitoring (memory, slow log, RDB snapshots permanently configured)
- ⏳ Tsgo diagnostics → JSONB import into `metadata_envelopes` (script exists, not on cron)
- ❌ Cache hit-rate dashboard (Grafana board referenced, not deployed)
- ❌ Cost-per-query attribution (Bifrost can give it; not exposed)

**Done means**: cache hit rate visible in real-time, regression alert fires before users notice, every operator action has a trace ID.

---

## Lane 7 — Operations (Docker, deploy, secrets, backups)

**Production bar**: zero-downtime deploy works; secrets never in git; daily backup; one-command rollback.

- ✅ Docker Compose profiles (essential / full / GPU tiers with memory limits)
- ✅ Caddy HTTP/3 unified config
- ✅ Node.js cluster wrapper (`server.js`) with auto-restart + health :9191
- ✅ Redis production config (2GB maxmemory, 3-tier RDB) made permanent in compose
- ⏳ Docker VHDX management (manual `wsl --shutdown` + `diskpart compact` on Win10)
- ⏳ Rate limiting (middleware exists for 3 endpoints; needs blanket policy)
- ❌ Zero-downtime deploy (untested — needs PM2 or k8s + readiness probes)
- ❌ Secrets rotation policy (Bifrost API key, Postgres password, gRPC tokens — manual today)
- ❌ Off-site backup destination (currently local Docker volumes only)

**Done means**: rollback drill completed in staging, secrets in a vault (not `.env`), off-site backup verified weekly.

---

## Cross-lane invariants

These rules fail silently if violated. Each spans multiple lanes; each gets its own checklist row in code review.

1. **TRACE runtime split** — Gemma4 talks to MCP `:8788` only; never directly to Qdrant/Neo4j/Postgres. (Lanes 0+5)
2. **Degraded response contract** — every GET API returns the same JSON shape on success and error. (Lane 1+5)
3. **UUID guards on client** — fetch `caseId` must pass `UUID_RE` test before request. (Lane 4)
4. **`db/client` import has no `.js`** — named-export resolution per G11. (Lane 1+5)
5. **`.svelte.ts` stores are client-only** — never imported from `+server.ts` / `+page.server.ts`. (Lane 1+4)
6. **`context_timeline` `user_id` is integer** — `Number(locals.user.id)` at insert sites. (Lane 2)
7. **No GPU work in SvelteKit request handlers** — all CUDA goes through workers or sidecars. (Lane 0+5)
8. **Cache write-through on success only** — never poison the cache with degraded responses. (Lane 0+3+5)
9. **Per-request MCP transport** — never construct `StreamableHTTPServerTransport` as module scope (G38). (Lane 5)
10. **Zod 2-arg `z.record(key, value)`** — single-arg fails Zod 3 (G34). (Lane 1+5)

---

## Where you are right now (2026-05-10 snapshot)

| Lane | Status | Blocker for prod? |
|---|---|---|
| 0 Inference | 80% (NVMe warm cache + per-layer profile pending) | No — current perf acceptable |
| 1 Framework | 85% (handler extraction + ARCHITECTURE.md) | No — checks green |
| 2 Data | 75% (drift remediation + backup drill) | **Yes — backup drill blocking** |
| 3 Retrieval | 90% (Phase 1B BM25-RRF in flight) | No — Karpathy blend live |
| 4 Client | 70% (SW offline queue partial) | No — degraded mode acceptable |
| 5 Backend | 80% (handler extraction + Phase D hooks) | No — sidecars working |
| 6 Observability | 65% (no cost attribution, no live dashboards) | **Yes — can't detect regressions** |
| 7 Operations | 50% (no zero-downtime deploy, no off-site backup) | **Yes — single-point disaster recovery** |

**Asymmetry**: the 3 production blockers are in lanes 2, 6, 7 — NOT in the lanes built most heavily (0, 3, 5). The inference + retrieval work is ahead; ops + observability + data-disaster-recovery is behind.

---

## Recommended next-3-sprints framing

- **Sprint A (ops gap)**: backup drill + off-site destination + secrets vault + zero-downtime deploy dress rehearsal. Lane 7 → green.
- **Sprint B (observability gap)**: cache hit-rate dashboard + regression alerts + cost-per-query. Lane 6 → green.
- **Sprint C (retrieval polish)**: Phase 1B BM25-RRF wire + 4D RRF + cross-encoder flag-on. Lane 3 → 95%.

After Sprint C, RotorQuant / NVMe warm cache / CUDA Graphs go on the "quarterly evaluation" calendar — not on the active sprint board. The inference lane is already past the production bar; further wins there are diminishing returns until lanes 2/6/7 catch up.

---

## What this doc does NOT do

- **Does NOT replace the master prompt or `next_steps_research.md`.** Those are feature inventories; this is the readiness checklist.
- **Does NOT prescribe specific PRs.** The consolidation queue (PR-1 through PR-7) lives separately; this is the lane-level "are we done" oracle.
- **Does NOT cover legal compliance.** Lane 7 ops covers backups; Daubert/admissibility hedges (PS1 stylization, evidence chain-of-custody, demonstrative-reconstruction overlay) are out of scope and live in `memory/reconstruction-3-tracks.md`.
- **Does NOT replace `BACKEND_INFRASTRUCTURE_AUDIT.md`.** That's the 17-gate runtime health probe; this is the architectural readiness map.

---

## Cross-references

- `CLAUDE.md` — durable architectural rules + 47 audit gates
- `BACKEND_INFRASTRUCTURE_AUDIT.md` — 17-gate runtime health
- `next_steps_research.md` — feature-completeness audit
- `next_steps/active/2026-05-10_rotorquant-bitnet-cache-hierarchy.md` — Lane 0 detail
- `next_steps/active/2026-05-10_service-worker-regex-tool-router.md` — Lane 4+5 detail
- `memory/MEMORY.md` — auto-memory index (load-bearing for next-session continuity)
- `memory/architecture/trace-runtime-split.md` — invariant #1
- `memory/architecture/karpathy-rl-som-routing-plan.md` — Lane 3 future build order
- `docs/architecture/trace-kag-web-development-guide.md` — 23-section practical guide
- `sveltekit-frontend/docs/master_agents.md` — codebase intelligence map

---

**Doc length**: ~260 lines. Read this first when the next operator (or you) asks "are we production ready" — they get the answer per lane plus the cross-lane invariants in one pass.
