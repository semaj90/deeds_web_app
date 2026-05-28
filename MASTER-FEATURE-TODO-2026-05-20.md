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
- [ ] Add `atlas:cartridge-seed` to graphify daily pipeline (after atlas build, before ACE pack)

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

**Next gate** (Phase 11D-B):
- [ ] Replace `pseudoEmbed()` in `rank-cards.mjs` + `embed-cards.mjs` with `POST localhost:11434/api/embed` (embeddinggemma:latest)
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
- [ ] `scripts/ingest/build-recommendations.mjs` — reads ace-packet + atlas seeds + smoke reports, emits `recommendations.json`
- [ ] Feature cluster grouping by sourceRef prefix
- [ ] Stale feature detection (atlas entry exists, no recent git touch)
- [ ] Duplicate system detection (two scripts/routes with overlapping sourceRefs)
- [ ] Output: `.opencode/recommendations.json` + `.opencode/recommendations-summary.md`

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
  - [x] Build `scripts/atlas/hot-keyword-cluster-summary.mjs` script
  - [x] Create distilled Drizzle/Postgres tables DDL/migration SQL for cards, profiles, edges, and retrieval events
  - [x] Implement read-only prompt listener adapter (`src/lib/server/retrieval/prompt-listener.ts`) and logging loop writing to `.tmp/atlas-retrieval-loop.jsonl`
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
- [ ] `scripts/ingest/rerank-cards.mjs` — cosine rerank using existing embedding cache, emit `turbovec_rank` delta
- [ ] Before/after diff output to `.tmp/rerank-diff.json`
- [ ] Add `rerank:cards` npm script
- [ ] Wire into `recommendations:build` chain: `rank-cards → rerank:cards → compress-cards`

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
- [ ] `scripts/ingest/cache-ace-packet.mjs` — write ace-packet.json → Valkey with TTL
- [ ] `scripts/ingest/load-ace-packet.mjs` — read from Valkey, fallback to disk, fallback to rerank
- [ ] Add `ace:cache` and `ace:cache:load` npm scripts

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
- [ ] `scripts/graphify/feature-labeling.mjs` — sourceRef → domain + feature_label + owner_area
- [ ] `scripts/graphify/domain-topology.mjs` — build domain graph from feature labels
- [ ] Intent cache write/read helpers in `scripts/ingest/intent-cache.mjs`
- [ ] Wire intent cache into `recommendations:build` after rank step
- [ ] Add `graphify:feature-labels` and `graphify:domain-topology` npm scripts

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
- [ ] `scripts/agent/prompt-generator.mjs` — intent → structured Gemma4 system prompt
- [ ] `scripts/agent/turbovec-search-memory.mjs` — user intent embedding cache with TTL
- [ ] Wire SearXNG fallback (localhost:8889) into research chain
- [ ] Gemma4 tool-calling manifest: `rg`, `ace_search`, `qdrant_search`, `searxng_search`
- [ ] Add `agent:prompt` and `agent:search-memory` npm scripts

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
→ ace_context_sources(source_kind='nightly_summary')
→ TTL 30+ days, eligible for Unsloth training corpus
```

**Tasks**:
- [ ] `scripts/opencode/nightly-summary.mjs` — git diff + hot errors + hot sourceRefs → markdown
- [ ] `scripts/opencode/weekly-cold-archive.mjs` — aggregate 7 nights → Postgres cold insert
- [ ] Add `summary:nightly` and `summary:weekly` npm scripts
- [ ] Wire nightly into startup heavy lane (`ace-incremental-startup.mjs`) with 24h cooldown

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
