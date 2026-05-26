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
  - [x] svelte-check validation (task-817 succeeded)
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

---

## Track F - TRACE Failure Reporter Alignment (2026-05-20)

### Findings
- TRACE toolchain is operational (`smoke:mcp:trace` passes all gates).
- False failure is caused by probing `GET /mcp` which correctly returns `406` for non-MCP requests.
- Correct MCP checks require JSON-RPC POST with MCP headers and payload.

### Tasks
- [ ] Replace all plain `GET /mcp` status checks with JSON-RPC `POST /mcp` initialize or `tools/list` handshake.
- [ ] Keep `/health` as liveness-only status, not capability status.
- [ ] Add a short operator note: `406` on `GET /mcp` is expected and should not trip incident alerts.
- [ ] Add regression check in startup scripts to run `npm run smoke:mcp:trace` after TRACE server boot.

## Track G - Stub vs Implemented Feature Map (rg + ast-grep plan)

### Current scan status
- `rg` scan found concrete placeholder/stub hotspots in code paths, including:
  - `sveltekit-frontend/src/lib/ai/onnx/inference.ts`
  - `sveltekit-frontend/src/mcp-gpu-orchestrator.ts`
  - `sveltekit-frontend/src/lib/webgpu/legal-document-graph.ts`
  - `sveltekit-frontend/src/lib/webgpu/dimensional-tensor-store.ts`
  - `sveltekit-frontend/src/routes/api/yorha/cluster-health/+server.ts`
- Implemented API surface is broad (`export const GET/POST/...: RequestHandler` across many `src/routes/api/**/+server.ts`).
- `ast-grep` is not currently installed in this workspace (`sg` unavailable), so structural pass is pending.

### Tasks
- [ ] Install `ast-grep` and add `npm run audit:stubs:ast` for structural stub detection.
- [ ] Keep lexical scan (`rg`) and structural scan (`ast-grep`) as separate outputs.
- [ ] Build feature-map buckets: `implemented`, `placeholder`, `mock/test-only`, `archived`.
- [ ] Diff those buckets against `next_steps` markdown commitments and mark drift items.

