# Consolidated TODO — April 19, 2026
**Status**: ACTIVE — Master TODO list, updated after deep audit + directory consolidation.
**Baseline**: svelte-check 0 errors, 0 warnings | 310 VS Code tasks | 414 API endpoints | 86 page routes

---

## Completed This Session (April 19, 2026)

- [x] **Fix pgvector schema drift** — `searchCodebasePgVector` referenced nonexistent columns (`embedding`→`content_embedding`, removed `signature`/`pagerank_score_couchdb`/`route_type`/`has_auth_guard`, now reads from `neo4j_meta` JSONB). Added `qdrant_id` UNIQUE constraint for `ON CONFLICT` upsert.
- [x] **Wire Karpathy tags into ACE** — `applyKarpathyBoost()` in context-assembler.ts: 30-keyword→tag map, +0.08/tag-match boost (max +0.24), +0.04 GPU cluster coherence. Applied to both reranked and fallback paths.
- [x] **VLM merge plan updated** — Upstream PEFT ClippableLinear fix (unsloth PR #4807) merged. Clean merge now possible without tensor stripping.
- [x] **3 VS Code tasks added** — index-stream mirror SSE, index-stream status GET, pending manual migrations. 307→310 tasks.
- [x] **Directory consolidation — Tier 1-3** — 10 dead files archived (0-import: messaging, json, simd, logging, log-adapters, actions, context, chat-backup, validation, contracts), 4 overlapping server dirs merged (embeddings→embedding, rabbitmq→queue, workflow→queue, adapters→types), 5 server dirs + 2 lib dirs eliminated. svelte-check 0 errors.
- [x] **Fix tasks.json malformed structure** — `patch-tasks.mjs` upgraded to general-purpose JSONC utility (--list/--count/--find/--fix/--add/--remove), 297→307 tasks
- [x] **Float32Array pool + OOM guards** — Already in libtorch-bridge.ts
- [x] **Batch parallel report export** — `POST /api/reports/batch-export`
- [x] **Granite-Docling Phase 3** — Ollama-native (`granite-docling.ts` uses `ollamaFetch`)
- [x] **Wire `/api/workflow-events`** — SSE endpoint with Redis LPOP poll, auth guard, auto-close
- [x] **VS Code tasks added** — 10 new tasks: screenshots (2), Drizzle (2), orphan detector, workflow-events SSE test, patch-tasks meta (2), LangGraph pipeline test (2)
- [x] **.env.example vars verified** — `SEARXNG_URL`, `DOCLING_SERVICE_URL`, `WHISPER_MODEL`, `WHISPER_CUDA` all present (lines 99-145)
- [x] **Admin auth guards verified** — All 4 admin pages have `+page.server.ts` with auth checks (search-intelligence, ai-dashboard, cache, error-brain)
- [x] **Case creation Superforms verified** — `cases/new/+page.server.ts` has superValidate + intakeCaseSchema + Drizzle insert + auth guard
- [x] **ChatSession queryHash verified** — metadata type includes `queryHash`
- [x] **Analytics pipeline verified** — context-timeline API, 12 search-analytics exports, drizzle/0015_context_timeline.sql all present
- [x] **LangGraph pipeline test script** — `test-langgraph-pipeline.mjs` with 4-phase test (preflight, endpoints, deep analysis, JSON+MD reports)
- [x] **Fix VLM model defaults** — env.server.ts + ollama.ts pointed to nonexistent `gemma4-legal-vlm:latest`. Fixed: CHAT_MODEL→`gemma4-legal:latest`, VLM_MODEL→`gemma4:e4b-it-q4_K_M` (stock multimodal base). User sets `OLLAMA_VLM_MODEL=gemma4-legal-vlm:latest` in `.env` after VLM merge.
- [x] **Chat feedback loop verified (P1+P5)** — queryHash already wired end-to-end: shortHash in ChatSession.svelte.ts, metadata preserved through SSE streaming, rateFeedback reads from metadata, FeedbackButtons in both ChatMessage.svelte and ContextualEvidenceChatModal.svelte.

---

## Quick Wins Remaining (runtime-only, need dev server)

- [ ] **Seed research_summaries** — Run VS Code task `🌱 P6-B: Seed research_summaries` (5 legal corpus topics → `corpus-search` → Postgres)
- [ ] **Build research graph** — Run VS Code task `📈 P6-C: Build research graph + RL policy` or combined `🚀 P6-B+C: Seed → Build` (needs ≥40 rows)
- [ ] **Pre-upload Playwright suite** — `test-screenshots.mjs --all --html` + verify 0 secrets in diff

---

## Medium Priority — Feature Completions

### Production Hardening
- [ ] Reconcile Drizzle schema docs with real DB/runtime contracts (schema drift audit)
- [ ] Publish single canonical April 2026 production-readiness snapshot
- [ ] Redis-backed rate limiting — DEFERRED until horizontal scaling
- [ ] Audit logging expansion (all DELETE operations) — DEFERRED

### User Analytics + Neo4j
- [ ] Activate Neo4j container + seed from PostgreSQL (RUNTIME — needs Docker)
- [ ] End-to-end validation: recommendations API, graph recs, SSE chat Neo4j context (RUNTIME — needs data)
- [x] User-specific graph recommendations (VIEWED/SEARCHED/ANALYZED edges, PageRank) — code exists: `user-interaction-sync.ts`, `graph-centrality.ts:getUserRecommendations()`, "For You" tab in analytics page

### Whisper GPU
- [ ] Benchmark CPU vs CUDA transcription latency on RTX 3060 Ti
- [ ] Create persistent `whisper-server.exe` mode (script, docker-compose, route update, health check)

### VLM Deployment — UNBLOCKED (upstream PEFT fix merged Apr 2026)
- [ ] Run Colab VLM re-attachment notebook — `pip install --upgrade unsloth` first (PR #4807 merged, ClippableLinear fixed)
- [ ] Clean PEFT merge now possible: vision+audio towers intact, no surgical tensor stripping
- [ ] Export: `gemma4-legal-vlm-Q4_K_M.gguf` + `gemma4-legal-vlm-mmproj-BF16.gguf`
- [ ] Deploy: `ollama create gemma4-legal-vlm:latest -f Modelfile` + update `.env OLLAMA_VLM_MODEL`
- [ ] Disk cleanup (~119 GB recoverable: WSL crash dumps, Claude CLI cache, duplicate GGUFs)

### deeds_labs Archival
- [ ] Create `semaj90/deeds-labs` private GitHub repo + push 17,900+ files

### Directory Consolidation — Remaining Tiers
- [ ] Tier 4: Fold ~20 1-file server/ dirs into neighbors (medium risk, import rewrites)
- [ ] Tier 5: Fold ~13 1-file component/ dirs (low priority, conventional in Svelte)

---

## Long-Term — Research / New Features

### 3D Prosecutor Simulation
- [ ] Phase 1-6: Drizzle schemas, FRE ingestion, fictional case schema, Qdrant legal_canon_chunks, QLoRA persona, 3D courtroom API

### POI AI Enhancements
- [ ] Face detection pipeline (FaceNet/ArcFace → pgvector)
- [ ] Auto photo categorization + EXIF/GPS metadata extraction

### ~~Audio-to-Knowledge Pipeline~~ ✅ DONE (Sprint 4B, Apr 12, 2026)
- [x] XState v5 audio upload machine + RabbitMQ `audio.process` worker + SSE progress — `audio-processor.ts`, `audio-queue-consumer.ts`, `api/audio/upload/+server.ts`

### N-API / C++ Audit
- [ ] TypeScript route graph enumeration
- [ ] TS → N-API boundary audit + C++ export graph

### Pipeline Gaps
- [ ] Triton/TRT-LLM deployment — DEFERRED
- [ ] Go gRPC embedding server reactivation — DEFERRED
- [ ] gRPC proto service activation — DEFERRED

---

## File Status Summary (44 files in next_steps/active/)

| Status | Count | Action |
|--------|-------|--------|
| **Archive candidate** | 19 | Marked SUPERSEDED/COMPLETE — safe to move to `next_steps/completed/` |
| **Active roadmap** | 15 | Contain pending actionable work |
| **Reference doc** | 10 | GPU comparison, Colab setup, N-API call map — keep as-is |

### Archive Candidates (19 files — all work done or superseded)
- `2026-04-06_consolidated-todo.md` — superseded by this file
- `2026-04-06_next-steps-triage.md` — superseded by Apr 18 re-triage
- `2026-04-18_ai-analysis-recommendations-buildout.md` — all 5 items complete
- `2026-03-15_TRITON_VLM_FULL_PIPELINE.md` — Docker deleted, never built
- `2026-03-15_TRTLLM_EXECUTION_PIPELINE.md` — Docker deleted, never built
- `ARCHITECTURE_ENHANCEMENT_ROADMAP_2026-04-02.md` — superseded by architecture-backlog
- `COUCHDB_NEO4J_GPU_READINESS_AUDIT_2026-03-31.md` — all verified
- `DEEP_REVIEW_AUDIT_2026-04-01.md` — disk cleanup complete
- `ENHANCED_UX_PLAYWRIGHT_TESTING.md` — all items done
- `GEMMA4_INTEGRATION_PLAN_2026-04-03.md` — Gemma4 integrated
- `MULTIMODAL_IMPLEMENTATION_ROADMAP.md` — Whisper done, CLIP not needed
- `PERFORMANCE_TEST_PLAN.md` — cache redesigned
- `PRODUCTION_ENHANCEMENT_ROADMAP_2026-03-31.md` — superseded
- `RUNTIME_PROOF_HANDOFF_2026-03-31.md` — all proven
- `SESSION_TODO_2026-04-03.md` — session complete
- `SETUP_WIZARD_ONBOARDING.md` — all items done
- `TRT_ENGINE_BUILD_STEPS.md` — engines never built
- `UUID_VALIDATION_DRIZZLE_AUDIT.md` — 89 routes validated
- `gemma4-audio-capabilities.md` — research complete

### Active Roadmaps (15 files — contain pending work)
- `2026-04-18_consolidated-todo.md` — THIS FILE
- `2026-04-17_architecture-backlog.md` — 24/24 done, P6-B/C runtime pending
- `2026-04-02_EVIDENCE_UPLOAD_VLM_NOTEBOOKS_TODO.md` — VLM re-attachment pending
- `2026-04-06_deep-review-pipeline-gaps-roadmap.md` — Triton/gRPC deferred
- `2026-04-06_whisper-multilingual-gpu-roadmap.md` — GPU benchmarks pending
- `2026-04-07_VLM_TRTLLM_DEPLOYMENT_PLAN.md` — VLM deployment pending
- `3D_PROSECUTOR_SIMULATION_ROADMAP.md` — Phase 1-6 pending
- `ALL_ROUTES_DIRECTORY_CONSOLIDATION.md` — Tier 4-5 remaining
- `DEEDS_LABS_ARCHIVAL.md` — GitHub repo creation pending
- `PRODUCTION_READINESS_2026-03-25.md` — schema drift + production snapshot
- `USER_ANALYTICS_NEO4J_VECTOR_CHAT.md` — Neo4j activation pending
- `audio-to-knowledge-pipeline.md` — XState audio machine pending
- `poi-ai-enhancement-roadmap.md` — face detection pending
- `TS_NAPI_CPP_AST_GRAPH_AUDIT_CHECKLIST_2026-03-31.md` — N-API audit pending
- `GRANITE_DOCLING_258M_INTEGRATION_2026-04-05.md` — Phase 3 done, later phases deferred

### Reference Docs (10 files — keep as-is)
- `2026-03-15_GPU_UPGRADE_COMPARISON.md`
- `2026-04-06_gemma4-community-integration-checklist.md`
- `2026-04-06_pipeline-audit-and-vlm-roadmap.md`
- `COLAB_MCP_SETUP.md`
- `GEMMA4_VLM_MULTIMODAL_TRAINING_PLAN_2026-04-05.md`
- `TENSORRT_ENV_AND_ARCHIVED_SERVICES.md`
- `TRT_DIRECTORY_CONSOLIDATION.md`
- `TS_NAPI_CPP_CROSS_LANGUAGE_CALL_MAP_2026-03-31.md`
- `UNSLOTH_VLM_CHR97_NEXT_STEPS_2026-04-02.md`
- `WSL2_TRTLLM_READINESS_CHECKLIST_2026-03-31.md`

---

## Deep Audit Results (April 19, 2026)

### Code Health
- **svelte-check**: 0 errors, 0 warnings ✅
- **Auth guards**: All admin pages guarded ✅
- **Superforms**: cases/new wired with Zod + intakeCaseSchema ✅
- **ChatSession queryHash**: Present in metadata type ✅
- **search-analytics**: 12/12 exports present ✅
- **context-timeline**: API + Drizzle migration present ✅
- **.env.example**: All 4 optional service vars present ✅

### Directory Consolidation Completed
| Action | Dirs eliminated |
|--------|----------------|
| Archive 10 dead 0-import files | 9 dirs removed |
| Merge server/embeddings → server/embedding | 1 dir removed |
| Merge server/rabbitmq → server/queue | 1 dir removed |
| Merge server/workflow → server/queue | 1 dir removed |
| Fold lib/adapters → lib/types | 1 dir removed |
| Archive lib/contracts (0 real importers) | 1 dir removed |
| **Total** | **14 dirs eliminated** |

### Production Readiness Score
| Category | Status | Score |
|----------|--------|-------|
| Type safety | svelte-check 0 errors | ✅ 100% |
| Auth guards | 358/386 routes (28 correctly public) | ✅ 93% |
| Zod validation | 315/425 routes (100% JSON coverage) | ✅ 74% |
| API degraded shapes | All GET routes return same-shape on error | ✅ 100% |
| Cache system | L1 Redis + L2 Bifrost + L3 Ollama | ✅ 100% |
| Observability | Langfuse 7 endpoints traced | ✅ 100% |
| Infrastructure audit | 15/17 gates passing | ⚠️ 88% |
| Directory hygiene | 14 dead dirs eliminated | ✅ done |
