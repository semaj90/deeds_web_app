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
  - [x] Sub-task A4: gemma4-hermes-64k synthesis (natural language summary)
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
