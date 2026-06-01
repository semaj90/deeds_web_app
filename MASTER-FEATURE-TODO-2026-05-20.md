# MASTER-FEATURE-TODO-2026-05-20

This document is the canonical active checklist for the 2026-05-20 execution plan.
It is the locked source of truth for Phase 0 discipline and should be treated as the active master todo list.

Use this file as the primary checklist. Reference-only notes may remain in supporting docs, but all task state should be reflected here first.

# Karpathy GPU Finish Line - Execution Task

- [x] **Phase KG-1 (Quick Wins)**
  - [x] Register RabbitMQ `media.download` and `media.transcribe` queues in `src/lib/server/queue/rabbitmq-manager-fixed.ts`

- [x] **Phase KG-3 (Encyclopedia & Data Backfill)**
  - [x] Implement Topological Encyclopedia API route (`src/routes/api/research/topological-encyclopedia/+server.ts`)
  - [x] Build Batch Manifold4 backfill script (`scripts/backfill-manifold4.mjs`)
  - [x] Build Karpathy Wiki batch DirectoryNote generation script (`scripts/graphify-kag-notes-missing.mjs`)

- [x] **Phase KG-4**: Ran `npm run graphify:autoencoder:train` to execute the full autoencoder training, backfill Qdrant, encode Redis, and compute centroids.
- [x] **Phase KG-5**: Verified the end-to-end attention-rank smoke test script (`scripts/smoke-attention-rank.mjs`) and executed Obsidian vault JSONL export (`npm run graph:export:jsonl`). The Karpathy GPU inference loop is now live.

- [ ] **Knowledge Graph Tool Lanes**
  - [ ] `attention_rank_files` — embed query → `attentionScoreGPU` via LibTorch → top-N from Karpathy scores
  - [ ] `som_topology_stats` — delegate to `gpu:som_topology` for Redis SOM grid / centroid stats
  - [ ] `language_distribution` — delegate to `gpu:language_distribution` for Qdrant cluster tag stats
  - [ ] `playbook_lookup_by_language` — use CouchDB `karpathy_wiki` plus top Karpathy file intersection
  - [x] Register RabbitMQ `media.download` and `media.transcribe` queues in `src/lib/server/queue/rabbitmq-manager-fixed.ts`
  - [ ] Route these tools into the correct skill families (`gpu-acceleration`, `vector-cluster`, `codebase`, `research`) without creating a parallel graph source of truth

- [x] **Phase KG-6 (Hermes Tool Wiring)**
  - [x] `attention_rank_files` — embed query → attentionScoreGPU via libtorch → top-N from Karpathy scores
  - [x] `som_topology_stats` — delegates to `gpu:som_topology` (Redis SOM grid/centroid stats)
  - [x] `language_distribution` — delegates to `gpu:language_distribution` (Qdrant cluster tags)
  - [x] `playbook_lookup_by_language` — CouchDB karpathy_wiki + top Karpathy file intersection
  - [x] Registered all 4 tools into appropriate skill families (gpu-acceleration, vector-cluster, codebase, research)
  - [x] Updated Hermes planner system prompt with tool signatures
  - [x] TypeScript type check (task-655 succeeded)

- [x] **Verification**
  - [x] TypeScript check passes cleanly (0 errors, 7 pre-existing warnings)
  - [x] Run `npm run smoke:graphify` → 11/13 pillars pass, D27 ✓ D33 ✓, Pillar 7 ✓
  - [x] D27 fixed via `scripts/seed-ontology-d27.mjs` (17,200 edges seeded: 73 ResearchNote, 330 LegalEvidence, 16,797 DevCode)
  - [x] D33 (Neo4j health) already passing

- [x] **Remaining P2 Work (from TODO-karpathy-gpu-features.md)**
  - [x] Export: Karpathy score nodes in JSONL export — already wired; dry-run emits 50 nodes ✅
  - [x] npm aliases verified: `graph:export:jsonl`, `manifold4:backfill`, `graphify:kag-notes:missing`, `smoke:graphify`, `db:studio`
  - [x] Manifold4 backfill bug fixed (`with_vector: ['default']` → `['content']`); dry-run 50/50 ✅
  - [ ] Clustering quality cleanup (deferred)

- [x] **Track 3 — Drizzle-Zod Schema Barrel**
  - [x] `drizzle-zod@0.8.3` already installed
  - [x] Created `src/lib/server/db/zod-schemas.ts` — insert schemas for `cases`, `evidence`, `legalDocuments`, `chatMessages`
  - [x] v2: Fixed to use `$inferSelect` for types (avoids vector(768) conflicts)
  - [ ] Wire into API routes (`/api/cases`, `/api/evidence/upload`) — deferred

- [x] **Track A — Database Analysis + Gemma4 Schema Summary** (subagent 9c8fc59d)
  - [x] Sub-task A1: Table census (count, size, row counts)
  - [x] Sub-task A2: Index audit (tables missing indexes)
  - [x] Sub-task A3: Domain mapping (schema-postgres.ts → feature areas)
  - [x] Sub-task A4: gemma4-rotorquant:latest synthesis (natural language summary)
  - [x] Sub-task A5: Gap report (production checklist)
  - [x] Write `artifacts/db-analysis-report.md`

- [x] **Track B — SvelteKit 2 + Playwright Research** (subagent 4c4a8f5f)
  - [x] Playwright testing patterns for auth, API routes, DB fixtures
  - [x] PostgreSQL + Drizzle production patterns
  - [x] Superforms v2 + Zod best practices
  - [x] Write `artifacts/stack-research-report.md`

- [ ] **Track C — Production Gap Remediation** (after DB audit)
  - [x] Fix userId type cast (`Number(locals.user.id)`) across route files
- [x] Run `npm run manifold4:backfill` (full run completed ✅)
  - [ ] Seed legal canon chunks (legal PDF ingest pipeline)
  - [ ] Add Playwright test fixtures for auth + DB seeding
  - [x] Wire `insertCaseSchema` / `insertEvidenceSchema` into API routes

- [/] **Track D — Next Step (Subagents Active)**
  - [x] Option 1: Centroid + soft probability fix (softmax over distances, τ=0.5)
  - [ ] Option 2: ClusterCard schema + Redis/Qdrant wiring + API route
- [x] Option 3: Real XGBoost C API inference & CUDA Graph in tensorrt_bridge
  - [x] Phase 1 Contract: `normalize-labels.ts` unified Zod labeling schema (Subagent 971811ed completed ✅)

- [/] **Phase 4 — Bifrost Warmup**
  - [x] Warm common ClusterCards (Completed: 1 warmed, 4 skipped due to 504 timeout)
  - [ ] Warm workspace-start plans
  - [ ] Warm legal/codebase summaries

- [ ] **Remaining Lower-Priority**
  - [ ] Track 1: .env audit + dead-config archival
  - [ ] Track 2: Docker CPU limits + Caddy memory bump
  - [/] Track 4A: Legal PDF ingest (constitution, uscode, govinfo)
  - [ ] Track 5C–5E: Model/GGUF cleanup
  - [x] Track 10: Compact Cards / CHR97 / NES Retrieval Lane

- [x] **Track E — Model Configuration & Parallel Inference Hardening**
  - [x] Update `opencode.json` (both root and `sveltekit-frontend/`) model definitions to `"yorha/yorha-legal"` to align default and agent lanes to the active 40k context GGUF.
  - [x] Add dynamic parallel slots (`--parallel` / `-np`) support to `launch-turboquant.ps1` to enable multi-core concurrent request processing.
  - [x] Validate cache key mapping and integration via targeted Vitest runs (`tests/openai-facade.spec.ts`).

- [x] **Phase 1 Runtime Blocker Verification (2026-05-21)**
  - [x] Verified TurboQuant runtime truth on `:8090`: `/health` returns `ok`, `/props` reports `n_ctx=65536`, `/slots` reports active slot metadata.
  - [x] Verified TRACE liveness on `:8788/health` (`200`) and confirmed `GET /mcp -> 406` is expected protocol behavior for streamable HTTP MCP.
  - [x] Verified ast-grep is installed and callable as both `ast-grep` and `sg` (`0.42.3`).
  - [x] Verified fast AST gate remains green via `npm run smoke:fast-ast` in `sveltekit-frontend`.

---

## Phase AC — Atlas ↔ CHR97 Cartridge Bridge (2026-05-27)

**Guardrails**: read-only adapter, no runtime merge, no legal/evidence mixing, no startup dependency.

- [x] Fix RabbitMQ health check — probe port 15672 directly (no SvelteKit proxy race at startup)
- [x] Fix `startup-context.json` bloat — store paths for large artifacts instead of inlining; drops 703KB → ~10KB
- [x] `scripts/atlas/atlas-to-cartridge-seed.mjs` — read-only adapter: atlas → CHR97 seed tiles
  - Inputs: `feature-registry.json`, `codebase-atlas.json`, `.tmp/atlas-feature-registry.json`
  - Output: `.tmp/atlas-cartridge-seeds.jsonl`, `reports/atlas-cartridge-seed-report.md`
  - Redis publish gated behind `--publish` only; dry-run safe
- [x] `scripts/atlas/atlas-lane-health-loop.mjs` — on-demand health reporter
  - CMake configured, CUDA arch sm_86, LibTorch detected, .node addon built, simdjson vendor, seed freshness
  - NOT a startup dependency — `npm run atlas:lane-health`
- [x] npm scripts: `atlas:cartridge-seed`, `atlas:cartridge-seed:dry`, `atlas:cartridge-seed:publish`, `atlas:lane-health`

**Completed 2026-05-27**:
- [x] Wire atlas seeds as Tier-3 fallback in `fetchCodebaseContext()` — only fires when Qdrant ANN + Postgres FTS both empty
- [x] `src/lib/server/retrieval/atlas-cartridge-seeds.ts` — read-only server module, mtime-invalidated cache, score cap ≤0.25
- [x] Generated live seeds: 4209 seeds → `.tmp/atlas-cartridge-seeds.jsonl` (2757KB), `reports/atlas-cartridge-seed-report.md`
- [x] Verified: retrieval_mode=atlas_seed_for_chr97 ✅, source=parent_atlas ✅, no runtime collection leaks ✅, score cap 0.25 ✅, mtime cache ✅, non-fatal catch ✅
- [x] Lane health: sm_86 ✅, LibTorch ✅, .node addon ✅, simdjson vendor ✅, seeds fresh ✅

**Completed 2026-05-28**:
- [x] Wire simdjson `fastJsonParse` to Bifrost L2 Qdrant semantic cache response hot path (`ollama.ts:909`)
- [x] Wire simdjson `fastJsonParse` to Bifrost L3 Ollama direct completion response hot path (`ollama.ts:988`)
- [x] `npx tsgo --noEmit` — zero diagnostics on `ollama.ts` after wiring

**Open**:
- [x] Add `atlas:cartridge-seed` to graphify daily pipeline — appended to `graphify:daily:tsc` after `graphify:authority` (2026-05-31)

---

## Phase 10A — SIMD/Native JSON Hot-Read Acceleration — COMPLETE (2026-05-28)

**Note**: simdjson uses CPU SIMD instructions (AVX2/SSE4.2), not GPU/CUDA. Do not call this "GPU parsing".

**Implemented**:
- `fastJsonParse` fallback chain: native SIMD → `JSON.parse` (no regression if addon missing)
- LRU byte-budget cache (32MB cap, 30s TTL, FNV-1a hash, payloads <1KB bypass native)
- Bifrost L2 hot path: Qdrant semantic cache search response (`ollama.ts` line ~909)
- Bifrost L3 hot path: Ollama direct completion response (`ollama.ts` line ~988)
- `qdrant-manager.ts` line 406: Redis-cached string → `fastJsonParse`

**Smoke + bench**:
- `npm run json:parse:bench` — `scripts/bench/json-parse-bench.mjs` (small/medium/large payloads, speedup report)
- `npm run bifrost:trace:smoke` — `scripts/smoke/bifrost-trace-smoke.mjs` (L1 Redis + L2 Qdrant + L3 Ollama + fastJsonParse shape, 4/4 pass)
- `npm run retrieval:turbovec:smoke` — `scripts/smoke/scenario-rerank-smoke.mjs` (existing)

**Benchmark result (2026-05-28, native addon loaded)**:
- small (307B): 1.14× (below 1KB threshold, native bypassed by design)
- medium (5KB): 0.49× slower (LRU overhead on first parse — cache hit path is 200×+ faster)
- large (50KB): 1.01× (parity; SIMD wins grow with payload size and repeat queries)

**Rules going forward**:
- Do not call this GPU acceleration — CUDA parser not in use
- Keep MessagePack for packet/cache movement
- Keep JSONB as canonical searchable truth
- Next: benchmark before/after with warm LRU (repeat-query path shows full speedup)

---

## Phase 11D — Card Ranking + Token-Budget Compression — COMPLETE (2026-05-28)

**Goal**: Turn thousands of cards into a compact, useful ACE packet without overloading context.

**Implemented**:
- `scripts/ingest/rank-cards.mjs` — scores all 9372 cards by 7-signal formula:
  `0.35·semantic + 0.20·sourceRef + 0.15·error + 0.10·recency + 0.10·TODO + 0.05·root + 0.05·smoke`
  Output: `.tmp/retrieval-ranking-report.json`
- `scripts/ingest/compress-cards.mjs` — deduplicates by source, compresses to token budget:
  keep title/summary/commands/error fingerprints, drop log lines, group by feature area
  Output: `.opencode/ace-packet.json`, `.opencode/ace-packet-summary.md`
- npm scripts: `ingest:rank`, `ingest:rank:dry`, `ingest:compress`, `ingest:compress:dry`, `ingest:packet`

**Verified**: 9372 cards → 200 ranked → 99 deduped → 73 packed at 5964/6000 tokens ✅

**Current state**: pseudo-embeddings (SHA-256) — real Ollama embed wired in next gate.
**Verified**: 9372 cards → 200 ranked → 99 deduped → 73 packed at 5964/6000 tokens ✅

**Next gate** (Phase 11D-B):
- [x] Replace `pseudoEmbed()` in `rank-cards.mjs` with `POST localhost:11434/api/embed` (embeddinggemma:latest) — real embed with 8s timeout + pseudo fallback; confirmed `ollama (real)` path live (2026-05-31)
- [ ] Wire Qdrant real search in `retrieval-pass.mjs` (env `QDRANT_URL` already checked)
- [ ] Wire Neo4j edge expansion (neighbor sourceRefs boost score)
- [ ] Wire Redis packet cache (TTL 10min, key = sha256(query + budget))
- [ ] Wire Langfuse trace on rank + compress runs

---

## Phase 11E — Product Consolidation + Recommendation Layer

**Goal**: Reduce system complexity and turn Graphify/Atlas outputs into actionable recommendations.

**Inputs**: Graphify feature map, Atlas seeds, retrieval traces, TODO priorities, smoke/build failures,
dependency graph, sourceRefs, startup context, package scripts.

**Outputs**:
- Feature recommendations (top missing, top stale, top blocked)
- Patch-card recommendations
- Missing dependency alerts
- UI recommendation clusters
- Top-10 contextual suggestions

**Rules**:
- Recommendations are compact — no raw logs, no giant ACE packets
- Preserve sourceRefs on every recommendation
- Rank by usefulness and validation (smoke-test availability boosts rank)

**Feature clusters to build**:
| Cluster | Members |
|---------|---------|
| Context Engineering | ACE packets, startup context, patch cards, sourceRefs |
| Retrieval | Qdrant, TurboVec, Graphify, Redis cache |
| Agent Workflow | OpenCode, smoke tests, patch promotion, TODO tracking |
| Performance | simdjson, MessagePack, CUDA/LibTorch, hot/cold docs |
| Legal Workspace | evidence, case summaries, recommendations, timeline UI |

**Recommendation types to generate**:
- Top developer recommendations (ranked by score + smoke availability)
- Top missing features (sourceRef exists in atlas, not in DB/routes)
- Top failing lanes (smoke exit ≠ 0)
- Top duplicated systems (same feature implemented twice)
- Top removable complexity (orphan scripts, dead routes, zero-consumer exports)

**Tasks**:
- [x] `scripts/opencode/build-recommendations.mjs` — canonical builder; reads ace-packets + atlas seeds + smoke reports, emits `.opencode/recommendations/recommendations.json` and `.opencode/recommendations/recommendations.md`
- [ ] Feature cluster grouping by `sourceRef` prefix
- [ ] Stale feature detection (atlas entry exists, no recent git touch)
- [ ] Duplicate system detection (two scripts/routes with overlapping sourceRefs)
- [ ] Wire Qdrant real search in `scripts/ingest/retrieval-pass.mjs` and feed its hits into recommendation scoring
- [ ] Wire Neo4j edge expansion (neighbor sourceRefs boost score)
- [ ] Wire Redis packet cache (TTL 10min, key = sha256(query + budget))
- [ ] Wire Langfuse trace on rank + compress runs
- [ ] Fuse retrieval-pass output into recommendation scoring (Qdrant hits + Neo4j neighbor boost + Redis packet cache + Langfuse trace metadata)
- [ ] Optional mirror only: export aliases to `.opencode/recommendations.json` + `.opencode/recommendations-summary.md` if a flat compatibility surface is still required
- [ ] Retrieval hook inventory for Phase 11E:
  - `scripts/ingest/retrieval-pass.mjs`
  - `sveltekit-frontend/src/lib/server/search/qdrant-search.ts`
  - `sveltekit-frontend/src/lib/server/search/neo4j-rerank.ts`
  - `sveltekit-frontend/src/lib/server/cache/redis-semantic-cache.ts`
  - `sveltekit-frontend/src/lib/server/observability/langfuse.ts`
  - `sveltekit-frontend/src/lib/server/retrieval/prompt-listener.ts`

---

## Phase 11F — QueryRouter4x4 Adaptive Routing & Speculative Decoding

**Goal**: Replace static lane defaults with adaptive exploration and CPU-assisted draft validation.

**Tasks**:
- [x] Add bounded FP16 attention rerank to `fetchACPKnowledgeResults` for final ACE context weighting on the top retrieved slice.
- [ ] Wire `QueryRouter4x4` into `fetchACPKnowledgeResults` so retrieval can explore dynamically instead of using fixed lane defaults.
- [ ] Add adaptive Hebbian adjustments to `ace:router:matrix` based on observed chunk hits and retrieval outcomes.
- [ ] Configure `gemma3-270m.gguf` draft-model support in TurboQuant for CPU-assisted speculative token validation.
- [ ] Preserve the existing router/cache path in `src/lib/server/features/ai/ace/context-assembler.ts`; this is an extension lane, not a rewrite.
- [ ] Document the live 4x4 router matrix location and usage:
  - `sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts`
  - `scripts/atlas/eval-lane-routing.mjs`
  - `scripts/atlas/eval-messy-query-routing.mjs`
  - `scripts/atlas/eval-real-world-routing.mjs`
  - `scripts/atlas/eval-cross-domain-routing.mjs`
  - Redis keys: `ace:router4x4:matrix`, `ace:router4x4:matrix:{userId}`

---

## Phase 11G — Browser WebGPU Schema Encoder & Service Worker

**Goal**: Move client-side reranking and caching into the browser where it is safe and useful.

**Tasks**:
- [ ] Create `schema-encoder.wgsl` for client-side reranking of documents.
- [ ] Establish SharedArrayBuffer zero-copy structures for Web Worker communication.
- [ ] Implement IndexedDB caching of ONNX models and WebGPU weights inside the Service Worker.
- [ ] Preserve the existing WebGPU/SW foundation in `src/service-worker.ts`, `src/lib/workers/compute-worker.mjs`, and related browser guards; this is a productization lane, not greenfield.

---

## Phase 10-19 Follow-on Tasks

**Goal**: Close the remaining productization gaps across retrieval, analysis, and lane completion.

**Tasks**:
- [ ] Option 2: ClusterCard schema + Redis/Qdrant wiring + API route
- [ ] Thread `alias_id` through the prompt listener log entries as a stable cross-store alias field
- [ ] Add retrieval-loop sourceRef/feature_id/alias_id reconciliation into the prompt listener and recommendation score fusion path
- [ ] Wire Qdrant real search in `scripts/ingest/retrieval-pass.mjs` and feed its hits into recommendation scoring
- [ ] Wire Neo4j edge expansion so neighbor `sourceRef`s boost score
- [ ] Wire Redis packet cache with TTL 10min and key `sha256(query + budget)`
- [ ] Wire Langfuse trace on rank + compress runs
- [ ] Fuse `retrieval-pass` output into recommendation scoring (`Qdrant` hits + `Neo4j` neighbor boost + `Redis` packet cache + `Langfuse` trace metadata)
- [ ] Optional mirror only: export aliases to `.opencode/recommendations.json` + `.opencode/recommendations-summary.md` if a flat compatibility surface is still required
- [ ] Upgrade Phase 17 PyTorch Feature Extractor script and Python implementation with robust fallbacks and correct schema
- [ ] Upgrade Phase 18 XGBoost Reranker script and Python implementation with robust fallbacks and correct schema
- [ ] Implement Phase 19 lane completion hook (`scripts/atlas/phase-lane-completion.mjs`)

---

## Phase 101A — Directory Analysis & Codebase Pruning

**Goal**: Use structural analysis to trim the repo to production-ready source, schemas, scripts, and docs.
**Scope**: full repo, not just `/src`; use `repo-root-atlas`, `docs/graph/`, `memory/exports/`, `scripts/`, `sveltekit-frontend/`, `docs/`, and the existing directory cards as analysis roots.
**Hidden roots**: include gitignored workspace roots such as `.opencode/`, `.tmp/`, `.cache/`, `.svelte-kit/`, `.github/`, and `.vscode/` in the traversal surface.

**Tasks**:
- [ ] Wire `ast-grep` into the directory analysis pipeline for codebase pruning.
- [ ] Use directory-role analysis plus AST maps to separate missing features from redundant features.
- [ ] Keep pruning outputs compact and JSON-backed so the lane can be re-run deterministically.
- [ ] Rebuild the parent atlas from the production-ready feature list after archive decisions land.
- [ ] Keep the pruning lane offline-only; it should not become a startup dependency.
- [ ] Preserve the existing `tools:ast-grep`, `index:ast`, `audit:directories`, and `graphify:dependency:audit` entrypoints as the core analysis surface.
- [ ] Use TurboVec-assisted directory summarization to fill gaps in directories that do not yet have `llms.md` / `agents.md` cards.
- [ ] Inventory and reconcile directory cards (`llms.md`, `agents.md`, generated summaries) so pruning can operate on the whole repository consistently.
- [x] Missing-features path map exists.
  - `docs/graph/missing-features-path-map.md`
  - `docs/graph/missing-features-path-map.json`
  - quick traversal surface for mapreduce outputs, DuckDB joins, Postgres mirrors, sourceRef-prefix clusters, and archive decisions
- [x] Missing-features review report exists.
  - `scripts/atlas/missing-features-review.mjs`
  - `docs/reports/missing-features-review-latest.json`
  - `docs/reports/missing-features-review-latest.md`
  - `docs/reports/missing-features-review-latest.svg`
  - deterministic report over mapreduce, registry rows, parent atlas coverage, stale features, duplicate systems, and prefix clusters

---

## Phase 101B — AGENTS / Qdrant / Knowledge Base Manager

**Goal**: Use AGENTS metadata to enrich retrieval payloads and expose TRACE MCP tools for OpenCode.

**Tasks**:
- [ ] AGENTS -> Qdrant Backfill: enrich vector payloads with AGENTS card metadata using a dry-run-safe path first.
- [ ] RG-Atlas Persistence: stabilize directory-level metadata integration and keep it aligned with the atlas graph exports.
- [ ] Knowledge Base Manager: expose TRACE MCP tools for OpenCode integration.
- [ ] Keep this lane tied to the existing graph artifacts in `docs/graph/` rather than inventing a parallel source of truth.

---

# MASTER-FEATURE-TODO-2026-05-20

This document is the canonical active checklist for the 2026-05-20 execution plan.
It is the locked source of truth for Phase 0 discipline and should be treated as the active master todo list.

Use this file as the primary checklist. Reference-only notes may remain in supporting docs, but all task state should be reflected here first.

# Karpathy GPU Finish Line - Execution Task

- [x] **Phase KG-1 (Quick Wins)**
  - [x] Register RabbitMQ `media.download` and `media.transcribe` queues in `src/lib/server/queue/rabbitmq-manager-fixed.ts`

- [x] **Phase KG-3 (Encyclopedia & Data Backfill)**
  - [x] Implement Topological Encyclopedia API route (`src/routes/api/research/topological-encyclopedia/+server.ts`)
  - [x] Build Batch Manifold4 backfill script (`scripts/backfill-manifold4.mjs`)
  - [x] Build Karpathy Wiki batch DirectoryNote generation script (`scripts/graphify-kag-notes-missing.mjs`)

- [x] **Phase KG-4**: Ran `npm run graphify:autoencoder:train` to execute the full autoencoder training, backfill Qdrant, encode Redis, and compute centroids.
- [x] **Phase KG-5**: Verified the end-to-end attention-rank smoke test script (`scripts/smoke-attention-rank.mjs`) and executed Obsidian vault JSONL export (`npm run graph:export:jsonl`). The Karpathy GPU inference loop is now live.

- [x] **Phase KG-6 (Hermes Tool Wiring)**
  - [x] `attention_rank_files` — embed query → attentionScoreGPU via libtorch → top-N from Karpathy scores
  - [x] `som_topology_stats` — delegates to `gpu:som_topology` (Redis SOM grid/centroid stats)
  - [x] `language_distribution` — delegates to `gpu:language_distribution` (Qdrant cluster tags)
  - [x] `playbook_lookup_by_language` — CouchDB karpathy_wiki + top Karpathy file intersection
  - [x] Registered all 4 tools into appropriate skill families (gpu-acceleration, vector-cluster, codebase, research)
  - [x] Updated Hermes planner system prompt with tool signatures
  - [x] TypeScript type check (task-655 succeeded)

- [x] **Verification**
  - [x] TypeScript check passes cleanly (0 errors, 7 pre-existing warnings)
  - [x] Run `npm run smoke:graphify` → 11/13 pillars pass, D27 ✓ D33 ✓, Pillar 7 ✓
  - [x] D27 fixed via `scripts/seed-ontology-d27.mjs` (17,200 edges seeded: 73 ResearchNote, 330 LegalEvidence, 16,797 DevCode)
  - [x] D33 (Neo4j health) already passing

- [x] **Remaining P2 Work (from TODO-karpathy-gpu-features.md)**
  - [x] Export: Karpathy score nodes in JSONL export — already wired; dry-run emits 50 nodes ✅
  - [x] npm aliases verified: `graph:export:jsonl`, `manifold4:backfill`, `graphify:kag-notes:missing`, `smoke:graphify`, `db:studio`
  - [x] Manifold4 backfill bug fixed (`with_vector: ['default']` → `['content']`); dry-run 50/50 ✅
  - [ ] Clustering quality cleanup (deferred)

- [x] **Track 3 — Drizzle-Zod Schema Barrel**
  - [x] `drizzle-zod@0.8.3` already installed
  - [x] Created `src/lib/server/db/zod-schemas.ts` — insert schemas for `cases`, `evidence`, `legalDocuments`, `chatMessages`
  - [x] v2: Fixed to use `$inferSelect` for types (avoids vector(768) conflicts)
  - [ ] Wire into API routes (`/api/cases`, `/api/evidence/upload`) — deferred

- [x] **Track A — Database Analysis + Gemma4 Schema Summary** (subagent 9c8fc59d)
  - [x] Sub-task A1: Table census (count, size, row counts)
  - [x] Sub-task A2: Index audit (tables missing indexes)
  - [x] Sub-task A3: Domain mapping (schema-postgres.ts → feature areas)
  - [x] Sub-task A4: gemma4-rotorquant:latest synthesis (natural language summary)
  - [x] Sub-task A5: Gap report (production checklist)
  - [x] Write `artifacts/db-analysis-report.md`

- [x] **Track B — SvelteKit 2 + Playwright Research** (subagent 4c4a8f5f)
  - [x] Playwright testing patterns for auth, API routes, DB fixtures
  - [x] PostgreSQL + Drizzle production patterns
  - [x] Superforms v2 + Zod best practices
  - [x] Write `artifacts/stack-research-report.md`

- [ ] **Track C — Production Gap Remediation** (after DB audit)
  - [x] Fix userId type cast (`Number(locals.user.id)`) across route files
- [x] Run `npm run manifold4:backfill` (full run completed ✅)
  - [ ] Seed legal canon chunks (legal PDF ingest pipeline)
  - [ ] Add Playwright test fixtures for auth + DB seeding
  - [x] Wire `insertCaseSchema` / `insertEvidenceSchema` into API routes

- [/] **Track D — Next Step (Subagents Active)**
  - [x] Option 1: Centroid + soft probability fix (softmax over distances, τ=0.5)
  - [ ] Option 2: ClusterCard schema + Redis/Qdrant wiring + API route
- [x] Option 3: Real XGBoost C API inference & CUDA Graph in tensorrt_bridge
  - [x] Phase 1 Contract: `normalize-labels.ts` unified Zod labeling schema (Subagent 971811ed completed ✅)

- [/] **Phase 4 — Bifrost Warmup**
  - [x] Warm common ClusterCards (Completed: 1 warmed, 4 skipped due to 504 timeout)
  - [ ] Warm workspace-start plans
  - [ ] Warm legal/codebase summaries

- [ ] **Remaining Lower-Priority**
  - [ ] Track 1: .env audit + dead-config archival
  - [ ] Track 2: Docker CPU limits + Caddy memory bump
  - [/] Track 4A: Legal PDF ingest (constitution, uscode, govinfo)
  - [ ] Track 5C–5E: Model/GGUF cleanup
  - [x] Track 10: Compact Cards / CHR97 / NES Retrieval Lane

- [x] **Track E — Model Configuration & Parallel Inference Hardening**
  - [x] Update `opencode.json` (both root and `sveltekit-frontend/`) model definitions to `"yorha/yorha-legal"` to align default and agent lanes to the active 40k context GGUF.
  - [x] Add dynamic parallel slots (`--parallel` / `-np`) support to `launch-turboquant.ps1` to enable multi-core concurrent request processing.
  - [x] Validate cache key mapping and integration via targeted Vitest runs (`tests/openai-facade.spec.ts`).

- [x] **Phase 1 Runtime Blocker Verification (2026-05-21)**
  - [x] Verified TurboQuant runtime truth on `:8090`: `/health` returns `ok`, `/props` reports `n_ctx=65536`, `/slots` reports active slot metadata.
  - [x] Verified TRACE liveness on `:8788/health` (`200`) and confirmed `GET /mcp -> 406` is expected protocol behavior for streamable HTTP MCP.
  - [x] Verified ast-grep is installed and callable as both `ast-grep` and `sg` (`0.42.3`).
  - [x] Verified fast AST gate remains green via `npm run smoke:fast-ast` in `sveltekit-frontend`.
  - [x] Verified KV mapping/profile guard path in `scripts/launch-turboquant.ps1` (allowlist + profile + explicit override behavior).
  - [x] Verified active Caddy MCP route target in `infra/caddy/Caddyfile` (`handle /mcp*` -> `host.docker.internal:8788`).
  - [x] Verified Neo4j auth fallback/recovery path in `scripts/atlas/neo4j-graph-enrich.mjs` (`NEO4J_PASSWORD`/`NEO4J_PASS` + warning on default fallback).
  - [x] Patched health reporter to include TRACE MCP protocol-aware probe and not misclassify `GET /mcp` `406` as outage.
  - [x] Added missing root script `services:health:json` for machine-readable status runs.

- [x] **Phase 10-19 Feature-Profile Retrieval Loop & ML Lanes**
  - [x] Implement Parent Atlas Profile Card generator and output `.tmp/parent-atlas-profile-cards.jsonl` and `reports/parent-atlas-profile-cards.md`
  - [x] Enrich Qdrant semantic indexer payloads with additional `feature_label`, `phase_lane`, `dependency_cluster`, `hot_keyword_cluster`, `sourceRef`, and `parent_atlas_card_id`
  - [ ] Add `alias_id` to parent atlas profile payloads, task mirror payloads, and retrieval events once the live `task_semantic_packets` migration is applied
  - [x] Build `scripts/atlas/hot-keyword-cluster-summary.mjs` script
  - [x] Create distilled Drizzle/Postgres tables DDL/migration SQL for cards, profiles, edges, and retrieval events
  - [ ] Extend the distilled DDL/migration SQL to persist `alias_id` in the live task/profile path once the migration is scheduled
  - [x] Implement read-only prompt listener adapter (`src/lib/server/retrieval/prompt-listener.ts`) and logging loop writing to `.tmp/atlas-retrieval-loop.jsonl`
  - [ ] Thread `alias_id` through the prompt listener log entries as a stable cross-store alias field
  - [x] Upgrade Phase 17 PyTorch Feature Extractor script and Python implementation with robust fallbacks and correct schema
  - [x] Upgrade Phase 18 XGBoost Reranker script and Python implementation with robust fallbacks and correct schema
  - [x] Implement Phase 19 lane completion hook (`scripts/atlas/phase-lane-completion.mjs`)
  - [x] Register new scripts in `package.json` and verify pipeline

- [ ] **Phase 20 — Colab/A6000 training lane**
  - [ ] Support high-RAM LLM tagging
  - [ ] Install Unsloth + PyTorch (`uv pip install unsloth --torch-backend=auto`)
  - [ ] Configure optional LoRA/QLoRA adapter training
  - [ ] Export trained tagger/reranker artifacts
  - [ ] Exclude from startup (run only offline)
  - [ ] WebGPU optional only (do not require WebGPU)


---

## Phase 11E — Completed Tasks (2026-05-28)

- [x] **Task 1** — `build-recommendations.mjs` rewritten with real signal analysis (5 detectors: failing lanes, stale features, dev recs, duplicates, missing sourceRefs)
- [x] **Task 1** — `rank-cards.mjs` enriched: entries now carry `area`, `cluster`, `tags`, `featureStatus` fields
- [x] **Task 1** — `compress-cards.mjs` restored to known-good acceptance state (78 cards, 5996 tokens, ghost comment blocks removed, `fmt` duplicate fixed)
- [x] **Task 2** — `materialize-recommendation-tasks.mjs` created: recommendations.json → tasks.ndjson + tasks.md with `task_id`, `risk`, `storage_lane`, `ttl_days`
- [x] npm scripts: `recommendations:build`, `recommendations:tasks`, `recommendations:full`

---

## Phase 10B — TurboVec Rerank (NEXT)

**Goal**: Insert a lightweight cosine rerank pass between rank-cards output and compress-cards budget selection. No Qdrant mutation. Trace only.

**Rules**:
- Input: top-N from rank-cards (N = 200 default)
- Output: reranked top-N, same card shape + `turbovec_rank` field
- Never mutate Qdrant during rerank
- Emit before/after diff: which cards moved up/down ≥5 positions
- Slot in pipeline: `rank-cards → turbovec-rerank → compress-cards`

**Tasks**:
- [x] `scripts/ingest/rerank-cards.mjs` — cosine rerank using existing embedding cache, emit `turbovec_rank` delta
- [x] Before/after diff output to `.tmp/rerank-diff.json`
- [x] Add `rerank:cards` npm script
- [x] Wire into `recommendations:build` chain: `rank-cards → rerank:cards → compress-cards`

---

## Phase 11F — ACE Packet Cache (Valkey/Redis)

**Goal**: Cache the hot ACE packet in Valkey with TTL tiers. Never re-rank if packet is fresh.

**Cache policy**:
| Lane | Key | TTL |
|------|-----|-----|
| Validation error context | `ace:errors:{sha}` | 1 day |
| Active repair context | `ace:repair:{sha}` | 1 day |
| Hot sourceRefs / feature labels | `ace:hot:{query_hash}` | 7 days |
| ACE packet hot cache | `ace:packet:{budget}:{query_hash}` | 1–7 days |
| Weekly user/project summary | `ace:summary:weekly:{iso_week}` | 30 days cold |

**Tasks**:
- [x] `scripts/ingest/cache-ace-packet.mjs` — write ace-packet.json → Valkey with TTL
- [x] `scripts/ingest/load-ace-packet.mjs` — read from Valkey, fallback to disk, fallback to rerank
- [x] Add `ace:cache` and `ace:cache:load` npm scripts

---

## Phase 11G — Intent Cache + Feature Labeling

**Goal**: Map user prompt intent → sourceRefs → featureLabels → acePacketId. Build domain topology graph.

**Intent cache table** (Redis hash `intent:{hash}`):
```
intent_hash      → sha256(normalised query)
sourceRefs       → top-N sourceRefs from last ACE pack
featureLabels    → domain labels derived from sourceRefs
acePacketId      → packet id that served this intent
ttl              → 7 days
```

**Feature labeling pass** (`scripts/graphify/feature-labeling.mjs`):
```
sourceRef → domain (Legal/Retrieval/Infra/UI/Agent)
         → feature_label (evidence-upload, case-timeline, qdrant-search, …)
         → owner_area (src/lib/server/, src/routes/, scripts/)
```

**Domain topology** (`scripts/graphify/domain-topology.mjs`):
```
nodes: sourceRef files
edges: feature_label relationships
output: .tmp/domain-topology.json + graphify refresh manifest
```

**Tasks**:
- [x] `scripts/graphify/feature-labeling.mjs` — sourceRef → domain + feature_label + owner_area
- [x] `scripts/graphify/domain-topology.mjs` — build domain graph from feature labels
- [x] Intent cache write/read helpers in `scripts/ingest/intent-cache.mjs`
- [x] Wire intent cache into `recommendations:build` after rank step
- [x] Add `graphify:feature-labels` and `graphify:domain-topology` npm scripts

---

## Phase 11H — Prompt Engineering + Agentic Research Fallback

**Goal**: Gemma4 tool-calling prompt generator with cascading fallback chain.

**Fallback chain** (caveman: local first, deep research last):
```
1. local rg (ripgrep) — always free, instant
2. ACE cache (Valkey hot packet) — 1–7 day TTL
3. Qdrant vector search — semantic recall
4. SearXNG fallback (localhost:8889) — web search
5. Gemma4 deep research + tool calling — last resort
```

**Prompt cache** (Redis `prompt:{intent_hash}`):
- Stores: system prompt + context chunks + tool signatures
- TTL: 7 days for stable domains, 1 day for volatile
- Invalidated by: new ACE pack, feature label change, sourceRef update

**Sub-agentic orchestration** (`scripts/agent/prompt-generator.mjs`):
```
intent → feature_labels → ACE context chunks → tool signatures
       → Gemma4 system prompt with NES/glyph memory hints
       → sub-agent task list with sourceRef anchors
```

**TurboVec search memory** (Redis hash `turbovec:memory:{user_id}`):
- Embedded intent vectors (768-dim compressed to 64-dim via autoencoder)
- TTL: 7 days
- Used for: attention head selection, personalized rerank boosts

**Tasks**:
- [x] `scripts/agent/prompt-generator.mjs` — intent → structured Gemma4 system prompt (2026-05-28)
- [x] `scripts/agent/turbovec-search-memory.mjs` — user intent embedding cache with TTL (2026-05-28)
- [x] Gemma4 tool-calling manifest: `rg`, `ace_search`, `qdrant_search`, `searxng_search` — embedded in prompt-generator.mjs
- [x] Add `agent:prompt` and `agent:search-memory` npm scripts (2026-05-28)
- [x] Wire SearXNG fallback (localhost:8889) into research chain (Phase 20 / Unsloth lane)

---

## Phase 11I — Nightly Summary + Cold Archive

**Goal**: Summarise hot activity daily, archive cold context weekly.

**Nightly summary** (runs after midnight, cron or startup gate):
```
changed files (git diff --name-only HEAD~1) → hot errors → hot sourceRefs
→ .opencode/summaries/nightly-{iso-date}.md
→ Redis ace:summary:nightly:{iso-date} TTL 30 days
```

**Weekly cold archive**:
```
7 nightly summaries → user/project summary → cold Postgres insert
→ ace_context_sources(source_kind='wiki_note' | 'prior_answer' as durable archive note)
→ TTL 30+ days, eligible for Unsloth training corpus
```

**Tasks**:
- [x] `scripts/opencode/nightly-summary.mjs` — git diff + hot errors + hot sourceRefs → markdown (2026-05-28)
- [x] Add `summary:nightly` and `summary:weekly` npm scripts (2026-05-28)
- [x] `scripts/opencode/weekly-cold-archive.mjs` — aggregate 7 nights → cold archive bundle + Postgres note insert
- [x] Wire nightly into startup heavy lane (`ace-incremental-startup.mjs`) with 24h cooldown

---

## NES/Glyph Architecture Notes (CHR97 ↔ ACE ↔ Gemma4)

**Core principle**: swap only what's needed, when needed. Never load full state.

```
User intent
  → intent_hash (SHA-256 of normalised query)
  → Redis lookup: intent:{hash} → featureLabels + sourceRefs + acePacketId
  → ACE packet load (Valkey hot cache → disk fallback)
  → Glyph tile selection: only tiles matching featureLabels
  → Gemma4 context: system prompt + selected tiles (≤6k tokens)
  → Tool calls: rg / qdrant / searxng (local first)
  → Response + RL signal (dwell, thumbs, citation save)
  → Update: intent cache TTL refresh + turbovec search memory
```

**Attention head selection** (future, after TurboVec rerank verified):
- Use turbovec 64-dim intent embeddings to select which attention heads to bias
- Store per-user head weights in `turbovec:memory:{user_id}`
- Apply as soft prompt prefix (≤128 tokens) before Gemma4 context

**Kernel training corpus** (offline, Unsloth A6000):
- Source: nightly summaries + cold archive + RL signal traces
- Format: prompt/response pairs with sourceRef anchors + reward scores
- Target: reduce hallucination on legal domain + improve tool-call accuracy

---

## Parent Atlas / Codebase Indexing Missing Checklist

This section is the current gap list for the parent-atlas and codebase-indexing lane. It is intentionally separate from the completed phase summaries above so the remaining work stays visible.

### Open promotion work
- [ ] Run the full current-corpus offline ingest in bounded chunks until the full scan is promoted, not just summarized
  - current scan scope is about 133k indexable files
  - keep the write path bounded and resumable
- [ ] Promote validated offline outputs into the durable stores only after validation passes
  - Postgres
  - Qdrant
  - Redis
  - Neo4j / SOM topology
  - SeaweedFS archive for large generated artifacts
- [ ] Confirm the live task mirror schema for `task_semantic_packets`
  - `alias_id` migration path
  - `feature_id` typing reconciliation
  - only persist fields the live table actually accepts
- [ ] Recover or containerize the missing worker lanes required for the full offline path
  - RabbitMQ topology MCP
  - TurboVec sidecar (transport fixed; all sidecars green on 2026-05-31)
  - Engram embed sidecar (transport fixed; all sidecars green on 2026-05-31)
  - LangExtract sidecar (transport fixed; all sidecars green on 2026-05-31)
  - graphify / batch helpers that currently time out on large runs
- [ ] Keep the repo trimmed to source, schemas, scripts, and docs
  - move raw summaries, large exports, and generated atlas artifacts out of the repo
  - archive them to external storage instead of keeping them as long-lived source files
- [ ] Refresh the parent atlas using only the production-ready feature list after archive decisions are made
  - keep missing features and redundant features separated in the atlas refresh and kanban handoff
  - re-run kanban-to-parent-atlas sync after archive decisions are made

### Archive / retire after promotion
- [ ] Archive redundant Svelte 5 runes carry-logic layers once the feature folders are stable
- [ ] Archive redundant async SvelteKit RPC wrappers once the JSON-RPC 2.0 path is the single canonical route
- [ ] Archive duplicate JSON-RPC 2.0 shim logic after the canonical handler is confirmed
- [ ] Archive deep Drizzle audit artifacts after the schema/migration plan is signed off
- [ ] Archive stale or duplicate feature implementations after the parent atlas tags them as production-ready or redundant

### Phase 1-20 rollup gaps still open
- [ ] Phase 20 A6000 training lane
  - [ ] high-RAM LLM tagging
  - [ ] Unsloth + PyTorch install and validation
  - [ ] optional LoRA / QLoRA adapter training
  - [ ] export trained tagger / reranker artifacts
  - [ ] keep the lane offline-only, not a startup dependency
- [ ] H4 write-enabled benchmark and FP16 accuracy comparison
  - [ ] keep CPU fallback as default until benchmark passes
  - [ ] do not enable FP16 globally before the comparison is recorded
- [ ] Deep Drizzle audit after consolidation and archiving
  - [ ] verify schema drift against the moved feature folders
  - [ ] apply migration only after the repo is trimmed and the live schema is consistent
- [ ] Parent atlas refresh using only the production-ready feature list
  - [ ] keep missing features and redundant features separated
  - [ ] re-run kanban-to-parent-atlas sync after archive decisions are made

---

## NAPI-RS / Rust Native Bridge Roadmap

This lane tracks the native bridge work that moved parsing, CUDA SOM caching, and container alignment off the main JS hot path. Keep it separate from the parent atlas checklist so runtime work and repo-trimming work do not get mixed.

### Completed
- [x] Rayon-powered batch parsing and worker-pool offload
  - `parse_batch` uses Rayon in Rust and Node worker threads to keep SvelteKit responsive
  - benchmarked against `JSON.parse` on 9,373 card files:
    - Standard `JSON.parse`: 3221.24ms
    - Rust Rayon worker-pool: 1680.74ms
    - speedup: 1.92x faster parsing
- [x] CUDA SOM cache integration
  - `som_cache.cu` builds with `SOM_HAVE_CUDA=1` on Windows/MSVC
  - `run_som_cache` binds directly to the native CUDA kernel copy path on `Float32Array` buffers
  - `build.rs` compiles `som_cache.cu` with CUDA and links `cudart_static`
  - `run_som_cache` export mapping is wired to the native CUDA kernel copy path
  - validation matches inputs perfectly
- [x] Container alignment
  - runtime base moved from `node:22-alpine` to `node:22-slim` for glibc compatibility
  - native addons are built in the multi-stage image and copied into runtime
  - `Dockerfile.sveltekit` now compiles and deploys the optimized C++/Rust addons and runs SvelteKit as a non-root user
- [x] Valkey / Redis semantic cache wiring
  - `simd_bridge_rs.node` wired into the Bifrost cache manager path
  - `parseFast` is used for cached KAG context extraction
  - SHA-256 cache-key hashing is now the canonical path
  - `bifrost-cache-manager.ts` now uses the native parse path for cached context structures
- [x] Autoencoder & Karpathy GPU pipeline execution
  - `train-autoencoder.mjs` trained the 768 → 64 contrastive autoencoder over 33,215 embeddings and saved weights to Redis (`ace:autoencoder:weights`, `ace:autoencoder:decoder:weights`)
  - `karpathy-gpu-enrich.mjs` ran through `npx tsx` with Qdrant/Redis URL fallbacks and wrote PageRank / Attention / Authority blend scores back to Redis
  - `karpathy-ace-hits.mjs` audited retrieval logs against authority scores and surfaced the top ghost files
  - `karpathy-gpu-recommendations.md` was generated as the report artifact
- [x] Validation and smoke checks
  - `npm run check` is green
  - `npm run bifrost:cards:smoke` is green

### Remaining
- [ ] Decide whether `simd-bridge-rs/` becomes the next canonical native add-on workspace or remains a staged canary
- [ ] Scaffold or promote the `napi-rs` prototype API surface (`parse_batch`, `compute_centroids`, Tokio worker handoff)
- [ ] Add a dedicated benchmark harness for JSON.parse vs simdjson vs Rust roundtrip
- [ ] Wire the production native base image into CI so the runtime image and addon ABI stay pinned
- [ ] Add telemetry for parse latency, worker queue time, and GPU allocation metrics
- [ ] Keep CPU fallback paths available for dev and rollback

### Guardrails
- [ ] Do not remove the JS fallback path until the Rust native path is benchmarked and canary-validated
- [ ] Do not treat the CUDA path as mandatory for the browser or startup lanes
- [ ] Keep offline training and zero-copy handoff separate from the live retrieval path until benchmarks pass
