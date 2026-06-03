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
  - [x] OpenCode agents/skills already expose these lanes; Hermes is archived to the deeds_labs legacy surface, and the remaining work is OpenCode/Gemma4 exposure and lane productization, not new runtime implementation
  - [x] Register RabbitMQ `media.download` and `media.transcribe` queues in `src/lib/server/queue/rabbitmq-manager-fixed.ts`
- [x] Route these tools into the correct skill families (`gpu-acceleration`, `vector-cluster`, `codebase`, `research`) without creating a parallel graph source of truth

- [x] **Phase KG-6 (legacy Hermes Tool Wiring / deeds_labs archive)**
  - [x] `attention_rank_files` — embed query → attentionScoreGPU via libtorch → top-N from Karpathy scores
  - [x] `som_topology_stats` — delegates to `gpu:som_topology` (Redis SOM grid/centroid stats)
  - [x] `language_distribution` — delegates to `gpu:language_distribution` (Qdrant cluster tags)
  - [x] `playbook_lookup_by_language` — CouchDB karpathy_wiki + top Karpathy file intersection
  - [x] Registered all 4 tools into appropriate skill families (gpu-acceleration, vector-cluster, codebase, research)
  - [x] Updated the legacy Hermes planner system prompt with tool signatures; active usage now routes through OpenCode agents/skills
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
- [x] Wire Qdrant real search in `retrieval-pass.mjs` (real Ollama embeddinggemma 768-dim + codebase_chunks_768 ANN) ✅
- [x] Wire Neo4j edge expansion (IMPORTS/SIMILAR_TOPOLOGY neighbor expansion, graceful fallback) ✅
- [x] Wire Redis packet cache (TTL 300s, key = ace:retrieval:packet:{queryHash}) ✅
- [x] Wire Langfuse trace on rank + compress runs (fires when LANGFUSE_SECRET_KEY set) ✅

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
- [x] Wire Qdrant real search in `scripts/ingest/retrieval-pass.mjs` (real embeddinggemma + codebase_chunks_768) ✅
- [x] Wire Neo4j edge expansion (neighbor sourceRefs boost score, graceful fallback) ✅
- [x] Wire Redis packet cache (TTL 300s key=ace:retrieval:packet:{queryHash}) ✅
- [x] Wire Langfuse trace on rank + compress runs ✅
- [x] Fuse retrieval-pass output into recommendation scoring — `detectImportErrors()` in `build-recommendations.mjs` reads `.tmp/feature-todo-queue.ndjson` + `path-map.json`; 6 high-priority barrel import errors now surface in recommendations ✅
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
- [x] Wire Qdrant real search in `scripts/ingest/retrieval-pass.mjs` and feed its hits into recommendation scoring ✅
- [x] Wire Neo4j edge expansion so neighbor `sourceRef`s boost score ✅
- [x] Wire Redis packet cache with TTL 300s and key `ace:retrieval:packet:{queryHash}` ✅
- [x] Wire Langfuse trace on rank + compress runs ✅
- [x] Fuse `retrieval-pass` output into recommendation scoring — `detectImportErrors()` wired, 131 todo-queue items feed into recommendations ✅
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
- [ ] Chunk the huge ripgrep search dumps (`docs/reports/rg_turbovec.txt`, `docs/reports/rg_napi.txt`) into parent-atlas-ready packets keyed by `title_id`, `feature_id`, and `sourceRef`; treat the raw `.txt` dumps as generated evidence, not source.
- [ ] Use the Obsidian-vault mirror as a downstream indexing surface only: ingest source files first, then pull the minimum mirror summaries needed to advance `next_steps/active/` and the parent atlas.
- [ ] Use LangExtract to summarize source files, parent-atlas packets, and selected Obsidian mirror summaries into completion notes before archiving any stale generated tree.
- [ ] Keep the repo minification split explicit: SeaweedFS (cold originals), Postgres/Qdrant/Neo4j/Redis (warm packets and indexes), and only completion notes plus active packet manifests in the repo.
- [ ] Keep only production-readiness completion notes active (`docs/reports/phase-101-closeout.md`, `docs/reports/phase-102-handoff.md`); archive superseded generated reports, mirror trees, and raw search dumps after their content has been promoted.
- [x] Rebuild the parent atlas from the production-ready feature list after archive decisions land.
  - `docs/reports/repo-dirty-tree-classification-2026-06-01.{json,md}`
  - `docs/reports/doc-feature-crosswalk-2026-06-01.{json,md}`
  - `docs/reports/repo-archive-move-plan-2026-06-01.{json,md}`
  - `node scripts/atlas/atlas-parent-indexing.mjs --apply`
  - bounded refresh run processed 9 lanes with 10,743 nodes and 9,398 edges
- [ ] Keep the pruning lane offline-only; it should not become a startup dependency.
- [ ] Audit PostgreSQL 17.6 vs 18 table/index drift and use the result to label canonical production tables vs experimental / archive-only tables.
- [ ] Keep `research_summaries` as the live canonical research table and finish the additive provenance/index migration before any dump/restore promotion to Postgres 18.
- [ ] Use the repo consolidation feature map to label ship-path, planned production, experimental, and archive-only files before trimming the repo to source, schemas, scripts, and docs.
- [ ] Re-run `scripts/atlas/classify-dirty-tree.mjs` before any archive move so the dirty tree is separated into generated artifacts, source changes, large blobs, and submodule dirtiness.
- [ ] Review `scripts/atlas/plan-archive-moves.mjs` and its report output before any archive operation; summarize promoted content with LangExtract first, then archive stale generated material.
- [ ] Use `scripts/atlas/doc-feature-crosswalk.mjs` to keep docs aligned to the sourceRef/pathmap spine for Neo4j, Qdrant, Redis, TurboVec, and offline-processing traversals.
- [x] Generate the dry-run sourceRef-parent join report and use its packet manifests to keep cold originals archived while warm indexes stay compact.
  - `scripts/atlas/sourceRef-parent-join-dry-run.mjs`
  - report: `docs/reports/sourceRef-parent-join-dry-run.{json,md}`
  - packet manifests: `.tmp/sourceRef-parent-join-packets.jsonl`
  - dry-run run uses `rg -uu` plus the sourceRef/pathmap/parent-atlas artifacts to produce compact sourceRef-prefix clusters and path packets without mutating Qdrant, Neo4j, Redis, or Postgres
- [x] Generate the sourceRef-parent archive plan from the dry-run join report and use it to separate keep-active index surfaces from summarize-then-archive evidence.
  - `scripts/atlas/sourceRef-parent-join-archive-plan.mjs`
  - report: `docs/reports/sourceRef-parent-join-archive-plan.{json,md}`
  - the archive plan is read-only and only classifies move candidates; it does not move files
- [x] Generate the sourceRef-parent archive move list from the archive plan so the summarize-then-archive bucket has explicit destinations.
  - `scripts/atlas/sourceRef-parent-join-archive-move-list.mjs`
  - report: `docs/reports/sourceRef-parent-join-archive-move-list.{json,md}`
  - the move list is still read-only; it only categorizes files into archive destinations
  - verified bucket split: `archive/review-needed/` (435), `archive/generated-reports/` (80), `archive/memory-exports/` (22), `archive/opencode-generated/` (6), `archive/obsidian-vault-mirror/` (5), `archive/model-blobs/` (2), `archive/legacy-doc-bundles/` (1), `archive/build-artifacts/` (1)
- [ ] Refresh the all-lanes parent atlas build after the crosswalk and archive-plan reports land, then use the active TOC as the traversal entrypoint for codebase indexing.

## NES/Glyph Architecture Notes (SourceRef-First Atlas Join & Cards)

**Goal**: Use `sourceRef` as the canonical bridge across mapreduce, DuckDB, Postgres mirrors, Qdrant payloads, Redis/Bitfrost caches, and Neo4j context trees so offline joins can be compressed into reusable NES/Glyph cards.

**Navigation**: [Parent Atlas Table of Contents](</C:/Users/james/Videos/deeds-web-app/docs/atlas/parent-atlas-table-of-contents.md>)

**Tasks**:
- [x] Normalize joins on `sourceRef` / `file_path` / mapreduce stableKey only; do not join Qdrant to atlas by Qdrant point id.
- [x] Prepare PG18-ready atlas chunk tables and JSONB/GiN index definitions for sourceRef-rich card/profile payloads.
  - `path_map` (3270 rows, indexed by file_path/feature/directory/import_errors) ✅
  - `feature_todo_queue` (131 rows, indexed by status/priority/enqueued_at) ✅
- [x] Keep the live `task_semantic_packets.alias_id` path aligned with `feature_id` and `sourceRef` provenance.
  - `alias_id` column confirmed present in `task_semantic_packets` ✅
- [x] Wire DuckDB join outputs into Postgres mirror tables for atlas chunks, profile cards, and retrieval events.
  - `mapreduce-path-join.mjs` produces path-map.json + patches DuckDB card_enriched ✅
- [x] Wire the NES packet writer through ACE assembly so provenance is cached and indexed as immutable packet tuples in Redis/Bitfrost before compression.
  - ACE emits NES chrom packets during assembly
  - the packet path preserves `sourceRef` / `featureId` / `queryHash` provenance
  - the remaining gap is read/query exposure, not packet emission
- [x] Add a live read/query route for NES chrom packets and recent hits by `sourceRef` / `featureId` / `queryHash`.
  - `sveltekit-frontend/src/routes/api/atlas/nes-chrom/+server.ts`
  - read-only GET route; packet writer stays unchanged
- [x] Seed a live NES/Glyph packet batch from the missing-features analysis so the read/query lane returns real rows.
  - `scripts/atlas/backfill-nes-chrom-packets.mjs`
  - current seeded batch: 25 packets / 25 hits
- [x] Merge frontend feature-labeling outputs (`sveltekit-frontend/.tmp/kanban_tasks.jsonl`, `sveltekit-frontend/.tmp/missing_feature_todos.jsonl`) into `docs/graph/kanban-board.json` so the Parent Atlas kanban board stays aligned with missing-feature discovery.
  - `docs/graph/kanban-board.json` now carries merged board tasks plus Turbovec annotations for consolidation reviews.
- [x] TurboVec-assisted kanban consolidation exists for the mass file ingestion lane.
  - `npm --prefix sveltekit-frontend run atlas:kanban:consolidate:turbovec`
  - `sveltekit-frontend/scripts/atlas/kanban-turbovec-consolidation.mts`
  - `docs/reports/kanban-turbovec-consolidation-latest.json`
  - `docs/reports/kanban-turbovec-consolidation-latest.md`
  - batch-parses board / feature-label / missing-todo JSONL via simdjson and uses TurboVec prefilter clusters to group duplicates by feature family
- [x] Warm Redis / Bitfrost caches from sourceRef-backed ClusterCards and hot atlas joins.
  - `scripts/atlas/sourceRef-first-join-warmup.mjs`
  - `scripts/atlas/sourceRef-first-hot-join-warmup.mjs`
  - `docs/reports/sourceRef-first-join-warmup.{json,md}`
  - `docs/reports/sourceRef-first-hot-join-warmup.{json,md}`
  - bounded apply runs now seed Redis / Bitfrost-ready hot joins and register compact packet contexts for the sourceRef-first lane
- [x] Expand Neo4j context trees from KAG / DAG hits so multi-hop traversals can reuse the same sourceRef spine.
  - `scripts/atlas/project-sourceRef-context-neo4j.mjs`
  - `docs/reports/sourceRef-context-neo4j-report.{json,md}`
  - bounded apply runs now project KAG/DAG packet context into Neo4j with `sourceRef + featureId + queryHash` as the join spine
- [x] Compress offline join outputs into NES chrom cards with Gemma4 summaries and token-budgeted packets.
  - runner: `scripts/atlas/sourceRef-first-join-warmup.mjs`
  - report: `docs/reports/sourceRef-first-join-warmup.{json,md}`
  - warmup uses `sourceRef + featureId` as the join spine, with a short Bifrost timeout and provider/model fallback candidates so cache seeding stays best-effort instead of blocking the lane
  - compressor: `scripts/atlas/sourceRef-first-nes-glyph-compress.mjs`
  - compression report: `docs/reports/sourceRef-first-nes-glyph-compress.{json,md}`
  - compressed packet JSONL: `.tmp/sourceRef-first-nes-glyph-packets.jsonl`
  - the compressor turns warmup report samples into reusable NES/Glyph packets, persists them through the existing NES chrom packet service, and reuses the same `sourceRef + featureId + queryHash` spine
  - hot-join warmup: `scripts/atlas/sourceRef-first-hot-join-warmup.mjs`
  - hot-join report: `docs/reports/sourceRef-first-hot-join-warmup.{json,md}`
  - the hot-join warmup reads back from the compressed packet report as the canonical source for Redis / Bitfrost seeding and optional Neo4j context expansion
  - live apply run has already seeded Redis / Bitfrost-ready cache entries from the compressed packet report, so the canonical hot-join lane is active
  - the hot-join lane reuses the compressed packet summaries directly and seeds the same cache entries in Redis as Bifrost-ready KAG packets, so it no longer depends on a second summarization pass
  - parent atlas refresh: `scripts/atlas/sourceRef-first-parent-atlas-refresh.mjs`
  - refresh report: `docs/reports/sourceRef-first-parent-atlas-refresh.{json,md}`
  - the refresh step promotes the canonical hot-join report into `parent_atlas_records` and `parent_atlas_vectors` using the same `sourceRef + featureId + queryHash` spine
  - live apply run has already written parent-atlas refresh rows and vectors, so the sourceRef-first lane now reaches the parent-atlas mirror as well as NES/Glyph packet storage
  - parent atlas packet export: `scripts/atlas/generate_parent_atlas_packets.mjs --only-sourceRef-first`
  - packet export report: `docs/reports/sourceRef-first-parent-atlas-packets.{json,md}`
  - the sourceRef-first packet export writes a dedicated packet directory under `.tmp/parent_atlas_packets/sourceRef-first`
  - parent atlas job enqueue: `scripts/atlas/enqueue_parent_atlas_jobs.mjs` with `PACKETS_DIR=.tmp/parent_atlas_packets/sourceRef-first`
  - the sourceRef-first packets are now queued into `parent_atlas_jobs` so the refreshed rows have a downstream processing lane
  - raw rg transcript organizer: `scripts/atlas/organize-rg-search-transcripts.mjs`
  - raw rg transcript organizer report: `docs/reports/parent-atlas-rg-dump-organizer.{json,md}`
  - the organizer streams `docs/reports/rg_turbovec.txt` and `docs/reports/rg_napi.txt` into compact Parent Atlas packet rows with `title_id`, `feature_id`, `sourceRef`, and chunk summaries
  - raw rg transcript projection: `scripts/atlas/project-parent-atlas-rg-dump-packets.mjs`
  - raw rg transcript projection report: `docs/reports/parent-atlas-rg-dump-projection.{json,md}`
  - the projection mirrors the organized rg packets into durable Postgres/Qdrant/Neo4j artifacts while preserving the same `sourceRef + feature_id` replay spine
  - lean sync runner: `scripts/atlas/run-taskboard-parent-atlas-sync.mjs --source-ref-first-only`
  - lean sync report: `.tmp/taskboard-parent-atlas-sync.{json,md}`
  - the lean sourceRef-first sync path now validates the refresh, packet export, enqueue, parent atlas validation, and consistency audit without paying for the full codebase/graphify pass
- [ ] Formalize the later compute lanes for PyTorch XGBoost reranking, SOM clustering collection, and Neo4j hypergraph merges against the same `sourceRef + feature_id` spine.
  - `scripts/atlas/pytorch-qdrant-redis-som-index.mjs`
  - `docs/reports/pytorch-qdrant-redis-som-index-2026-06-01.{json,md}`
  - evidence: vector64 compression, SOM metrics, cache effectiveness, and the PyTorch/Qdrant/Redis/SOM doc surfaces are now indexed together as a report-backed lane
- [ ] Keep the Postgres 18 indexing tables, Qdrant multi-query tags, and JSONB card packets aligned so semantic hash lookups stay stable across mirrors.
- [ ] Add deep_research test coverage for the future LLM orchestration lane before promoting any offline synthesis output into the live stack.
- [ ] Keep Ollama `embeddinggemma` on the fast path with timeout + fallback, then map the outputs into token transforms before compression.
- [ ] Keep the lane offline-first and report-only until the join outputs are validated against DuckDB and the parent atlas.
- [ ] Use the Parent Atlas feature command atlas as the container manifest for later PyTorch / XGBoost / SOM / Neo4j lanes so the same sourceRef spine stays retrievable.
- [x] Project the Parent Atlas feature command atlas into `parent_atlas_jobs` and a Neo4j Cypher export so the containers become durable indexing packets instead of report-only rows.
- [x] Mirror the Parent Atlas feature command atlas into Qdrant so the same containers are retrievable by semantic query and payload filters.
- [x] Mirror the Parent Atlas feature command atlas into Postgres `parent_atlas_vectors` with `embedding_768` so the same containers stay joinable by `sourceRef + feature_id` inside the durable ledger.
- [x] Add the task semantic packet workflow helper and Redis hot-cache so a Kanban task can be summarized, clustered, enqueued, and replayed as a deterministic packet.
- [x] Expose the task semantic packet workflow through the MCP tool surface and admin UI so OpenCode/Gemma4 can launch the lifecycle without calling the helper directly.
- [x] Add a dry-run switch to the workflow CLI so the packet lifecycle can be smoke-tested without hitting live embedding or Qdrant paths.
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
- [x] Parent Atlas table of contents exists.
  - `docs/atlas/parent-atlas-table-of-contents.md`
  - navigation index for storage, data spine, agent flow, and active todo spine

---

## Phase 101B — AGENTS / Qdrant / Knowledge Base Manager

**Goal**: Use AGENTS metadata to enrich retrieval payloads and expose TRACE MCP tools for OpenCode.

**Tasks**:
- [ ] AGENTS -> Qdrant Backfill: enrich vector payloads with AGENTS card metadata using a dry-run-safe path first.
- [ ] RG-Atlas Persistence: stabilize directory-level metadata integration and keep it aligned with the atlas graph exports.
- [ ] Knowledge Base Manager: expose TRACE MCP tools for OpenCode integration.
- [ ] Keep this lane tied to the existing graph artifacts in `docs/graph/` rather than inventing a parallel source of truth.

## Phase 101C — Local Deep Research / OpenCode / LangGraph Alignment

**Goal**: Make `local-deep-research` a research backend for Gemma4/OpenCode, not a competing assistant stack.

**Reference**: `docs/architecture/local-deep-research-boundary.md`, `docs/architecture/scheduler-gpu-bridge-roadmap.md`

**Tasks**:
- [ ] Inventory the current `local-deep-research` compose and note the current boundary: local SQLite state on the research side, canonical backend stores in the repo.
- [ ] Compare the local-deep-research container against the repo's current OpenCode/Gemma4 function-calling path and document the exact role split.
- [ ] Recreate the `local-deep-research` container for GPU use when needed by bringing it up from the WSL2 GPU override path, then verify the host/container model boundary before promoting it to the checklist.
- [ ] Align `local-deep-research` to an OpenAI-compatible `llama-server` endpoint when using `llama.cpp`; keep Hermes archived in deeds_labs/test-only unless it proves useful as a separate lane.
- [ ] Add the export/import bridge that turns local SQLite research state into canonical backend rows before ACE packet generation.
- [ ] Emit a canonical ACE packet from the LDR bridge with preserved `sourceRefs`, then warm the shared Redis ACE packet cache for OpenCode reuse.
- [ ] Expose tuple metadata on the exact-match cache read path so front-door hits return the same envelope they store.
- [ ] Route agentic errors through a read-only proposal flow that launches parallel repair subagents before any patching is considered.
- [x] Record each proposal run as a `context_timeline.agentic_proposal` event so the repair-thinking path is temporally indexed in the durable ledger, with `sourceRef + feature_id` as the replay/join spine and `clusterId` kept as a routing hint only.
- [x] Keep regex extraction fallback-only at the proposal boundary so messy logs can recover `feature_id`, `workspace_task_id`, `parent_atlas_card_id`, and `source_ref` without replacing typed provenance.
- [ ] Promote each proposal run into the engram registry (`memory_registry` + `engram_cards`) so the repair timeline is indexed as reusable memory, not just audit history.
- [ ] Expose the proposal timeline in the agentic controller UI via the read-only `/api/v1/agentic?action=timeline` path.
- [x] Wire the Phase 101 parent-atlas packetizer lane (`scripts/atlas/phase101-parent-atlas-packetize.mjs`) as a dry-run-first Gemma/OpenCode tool surface that validates `nes.packet.v1`, prints the cache key, and keeps recommendations read-only or dry-run only.
  - dry-run verified in the repo shell; the exact grep scanner runs first and falls back to `grep -E` only when the literal pattern yields no lines
  - apply path remains gated on `LOCAL_OPENAI_BASE_URL`, `LOCAL_OPENAI_API_KEY`, and `LOCAL_GEMMA_MODEL` hydration
- [x] Emit a parent-atlas feature-labeling report that includes missing todos, `feature_id`, `featureKey`, `source_ref`, and `sourceRefs` so the kanban/atlas sync can consume one replayable task shape.
- [x] Land the NES chrom packet + KAG DAG hits schema (`nes_chrom_packets`, `nes_chrom_kag_dag_hits`) and the packet persistence helper with `chunk_id`, `sourceRef`, `jsonb`, and `pgvector` joins.
- [x] Add the read-only NES chrom packet report seam via `scripts/atlas/report-nes-chrom-packet-hits.mjs`, writing `docs/reports/nes-chrom-packet-recent-hits.{json,md}` without creating a second packet store.
  - current runtime note: the script runs successfully in report-only mode and records that one or both NES chrom relations are absent in the current local database
- [x] Add the additive `research_summaries.source_ref` / `source_refs` migration and Drizzle schema bridge so local-deep-research provenance can land in durable rows and indexes.
- [x] Apply the `research_summaries` provenance/index migration to the live 17.6 database and backfill the URL-backed rows.
- [ ] Keep Qdrant as the default ANN service and treat cuVS/CAGRA or a small Rust gRPC ANN worker as the future experiment lane behind the same retrieval contract and result shape.
  - Keep `sveltekit-frontend/src/lib/server/search/qdrant-search.ts` and `sveltekit-frontend/src/lib/server/retrieval/orchestrator.ts` as the stable retrieval abstraction boundary so cuVS/CAGRA can swap in later without changing callers.
  - Current default: Qdrant for semantic lookup, payload filters, HNSW traversal, and quantized vector search.
  - Future optional lane: cuVS/CAGRA or IVF variants as GPU ANN acceleration behind the same search interface.
  - Rule: callers must request retrieval intent/results and must not depend on Qdrant-specific client details.
- [ ] Keep the two-lane storage split explicit: cold originals and archives are immutable, warm packets/cards stay small and point back to them, hot cache stays transient, and Qdrant remains semantic lookup plus payload filters rather than the canonical store.
- [ ] Use RabbitMQ as a work queue only with separate urgent / normal / bulk / dead-letter lanes; do not model it as one catch-all deque.
- [ ] Archive originals only after SeaweedFS copy, checksum verification, Postgres ledger write, and archive-eligible marking.
- [x] Add a 0-100 superseded score for originals so archive prioritization is based on duplicate detection, validation coverage, and `sourceRef` / `feature_id` resolution.
  - candidate-only scorer: `scripts/packets/score-superseded-originals.mjs`
  - outputs `.tmp/superseded-score-candidates.{json,md,ndjson}` and `.tmp/superseded-score-implementation-report.{json,md}`
  - source-file candidates and generated-artifact candidates are scored in separate sections
  - `delete_allowed` and `move_allowed` remain false for every row
- [x] Generate a read-only, candidate-only superseded-score report that ranks dirty-tree and archive-plan candidates without moving or deleting anything.
- [x] Fix G17 hardcoded localhost in `EnhancedLegalAIChatWithSynthesis.svelte` by routing browser requests through `/api/ollama/generate`.
- [x] Add G18 startup truth gate checks for GPU bridge live count, Postgres 18.x, `parent_atlas_documents`, `alias_id`, and Redis auth/protected-mode.
- [x] Wire the GPU bridge probe into VS Code startup and log results to `logs/task-output/startup-gpu-bridge-probe.log`.
- [ ] Keep `parent_atlas_documents` population gated by promote-to-postgres dry-run/apply until the first bounded batch reconciles.
- [x] Advance bounded offline synthesis promotion through `--limit 25 --offset 25`, `--limit 50 --offset 50`, and `--limit 50 --offset 75`; confirm the `qdrant-postgres-reconciliation` dry-run stays clean.
- [x] Confirm Redis auth or protected-mode so the new startup truth gate clears its final blocker.
- [x] Clear ACE/Vite health so `startup-truth.mjs` can pass end to end instead of failing closed on `api.health.unavailable`.
  - startup truth is now green with the Valkey bundle and the widened `/api/health` timeout
  - [x] Keep the ANN adapter boundary stable in `sveltekit-frontend/src/lib/server/search/qdrant-search.ts` and `src/lib/server/retrieval/orchestrator.ts` so cuVS can swap in later without changing callers.
  - [x] Add the optional TurboVec seam behind `searchCodebaseAnn()` so a Rust/N-API backend or TurboVec sidecar rerank can be enabled without changing SvelteKit callers; Qdrant remains the default backend.
    - the seam now includes GPU-safe load shedding and SOM/AE-aware rerank for oversubscribed batches
  - [x] Add a backend-toggle smoke (`scripts/smoke/turbovec-ann-backend-smoke.mjs`) so the default Qdrant vs `CODEBASE_ANN_BACKEND=turbovec` selection stays testable without loading the full ANN stack.
- [ ] Keep LangGraph optional as orchestration only.
  - LangGraph nodes may validate, route, inspect, and call Gemma4/function tools.
  - LangGraph nodes must not directly write to Postgres, Qdrant, Redis, Neo4j, DuckDB, or SeaweedFS.
  - Durable writes must go through existing promotion queues, validation gates, and bounded apply scripts.
  - LangGraph is for agentic testing/planning/subagent coordination, not a replacement for SvelteKit routes, MCP tools, or the promotion ledger.
- [x] Define the OpenCode-facing bridge so research queries can flow through TRACE MCP / function-caller without bypassing `sourceRef` provenance.
- [x] Store docs and large artifacts in SeaweedFS, not in the research container's local SQLite boundary.
- [ ] Summarize docs with Gemma4 and persist the compact outputs into Postgres 18 deep_research tables with JSONB / pgvector where appropriate.
- [ ] Keep BM25 and LangExtract as the lexical/provenance enrichment pass before the final recommendation fusion.
- [x] Treat TurboVec, LlamaIndex, LangChain, and LangGraph as adapters only; the boundary is documented in `docs/architecture/dual-lane-hot-brain-cold-queue.md`.
- [ ] Document the WSL2 GPU override as optional deployment flavor only; default to host-side CUDA inference when it is already available.
- [ ] Emit a short comparison note for Gemma4 vs Hermes-archive (deeds_labs) vs local-deep-research so the assistant path stays explicit.
- [ ] Re-run the assistant-path comparison after each boundary change and record the result in `IMPLEMENTATION_STATUS.md`.

**Rules**:
- Research backend stays read-mostly and sourceRef-preserving.
- OpenCode remains the user-facing assistant path.
- GPU acceleration belongs on the model server boundary, not inside the research UI unless explicitly enabled.

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
- [ ] Continue current-corpus offline ingest in bounded chunks until the full scan is promoted, not merely summarized.
  - Current scan scope is about 133k indexable files.
  - Promotion gates are green for bounded apply only.
  - Required cadence:
    1. run small bounded apply slice
    2. run Qdrant/Postgres/Neo4j/Redis reconciliation
    3. update promotion status
    4. widen only if reports remain green
  - Do not jump directly to broad/unbounded apply.
- [ ] Keep `parent_atlas_documents` population separate from schema readiness.
  - Table and indexes exist.
  - Population must proceed through bounded promotion slices.
  - Duplicate rel/sourceRef cases must use explicit upsert/dedupe strategy, not blind inserts.
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
- [ ] Add a read/query path for NES chrom packets and recent hits by `sourceRef` / `featureId` / `queryHash`
  - keep the packet writer as-is
  - surface the existing `docs/reports/nes-chrom-packet-recent-hits.{json,md}` report shape through a live query route or script so the lane is searchable, not write-only
- [ ] Keep the repo trimmed to source, schemas, scripts, and docs
  - move raw summaries, large exports, and generated atlas artifacts out of the repo
  - archive them to external storage instead of keeping them as long-lived source files
- [ ] Refresh the parent atlas using only the production-ready feature list after archive decisions are made
  - keep missing features and redundant features separated in the atlas refresh and kanban handoff
  - re-run kanban-to-parent-atlas sync after archive decisions are made

### Archive / retire after promotion
- [ ] Archive only after superseded-score and sourceRef validation gates pass.
  - No file move/delete is allowed from score alone.
  - Required before any move:
    1. validated warm packets/cards
    2. sourceRef coverage
    3. feature_id/workspace_task_id coverage where applicable
    4. cold copy candidate in SeaweedFS
    5. checksum verification
    6. Postgres ledger entry
    7. restore manifest
    8. manual/operator review
  - `archive/review-needed/` remains blocked.
  - Generated-report and memory-export buckets may receive reviewed dry-run move plans, but not automatic movement.
- [ ] Archive redundant Svelte 5 runes carry-logic layers only after feature folders are stable and sourceRef-backed packets exist.
- [ ] Archive dev MCP redundant async/SvelteKit RPC wrappers only after JSON-RPC 2.0 path is confirmed as the canonical agent-testing route.
  - SvelteKit 2 keeps its own app routing pipeline.
  - MCP/JSON-RPC is for agentic testing/tooling, not a replacement for user-facing SvelteKit routes.
- [ ] Archive duplicate JSON-RPC 2.0 shim logic after the canonical handler is confirmed
- [ ] Archive deep Drizzle audit artifacts after the schema/migration plan is signed off
- [ ] Archive stale or duplicate feature implementations after the parent atlas tags them as production-ready or redundant
- [ ] Archive originals only after SeaweedFS copy, checksum verification, Postgres ledger write, and sourceRef / feature_id resolution are complete

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
  - the encoded-cluster prefilter now warms `sim:v1:{sha1(queryHash + ':' + clusterKey)}` entries on successful centroid scoring, so the semantic cache is actually exercised instead of sitting unused
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
