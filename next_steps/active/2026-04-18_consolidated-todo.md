# Consolidated TODO — April 18, 2026
**Status**: ACTIVE — Master TODO list, sourced from all 16 remaining active roadmap files.
**Baseline**: svelte-check 0 errors | ~40 routes hardened (degraded shape + Zod) | P1-P5 architecture-backlog COMPLETE

---

## Quick Wins (< 30 min each)

- [x] **Fix tasks.json malformed structure** — Orphaned 1196 lines after main JSON merged back (239 tasks, 26 inputs)
- [x] **Float32Array pool + OOM guards** — Already implemented in libtorch-bridge.ts (pool, gpuHasRoom, heapHasRoom, cache-blocked CPU)
- [x] **Batch parallel report export** — `POST /api/reports/batch-export` (up to 50 reports, html/markdown/json)
- [ ] **Seed research_summaries** — Run VS Code task `🌱 P6-B: Seed research_summaries` (5 legal corpus topics → `corpus-search` → Postgres) (P6-B, runtime)
- [ ] **Build research graph** — Run VS Code task `📈 P6-C: Build research graph + RL policy` or combined `🚀 P6-B+C: Seed → Build` (P6-C, runtime)
- [ ] **Add missing .env.example vars** — `SEARXNG_URL`, `DOCLING_SERVICE_URL`, `WHISPER_MODEL`, `WHISPER_CUDA` (15 min)
- [ ] **Pre-upload Playwright suite** — `test-screenshots.mjs --all --html` + verify 0 secrets in diff (15 min)
- [x] **Granite-Docling Phase 3** — Already Ollama-native (`granite-docling.ts` uses `ollamaFetch` directly, no Docker container); `extract-docling/+server.ts` confirmed correct

---

## Medium Priority — Feature Completions

### Production Hardening (from PRODUCTION_READINESS)
- [ ] Reconcile Drizzle schema docs with real DB/runtime contracts (schema drift)
- [ ] Publish single canonical April 2026 production-readiness snapshot
- [ ] Redis-backed rate limiting — DEFERRED until horizontal scaling
- [ ] Audit logging expansion (all DELETE operations) — DEFERRED

### User Analytics + Neo4j (from USER_ANALYTICS_NEO4J_VECTOR_CHAT)
- [ ] Activate Neo4j container + seed from PostgreSQL
- [ ] End-to-end validation: recommendations API, graph recs, SSE chat Neo4j context, analytics dashboard
- [ ] User-specific graph recommendations (VIEWED/SEARCHED/ANALYZED edges, PageRank)

### Whisper GPU (from whisper-multilingual-gpu-roadmap)
- [ ] Benchmark CPU vs CUDA transcription latency on RTX 3060 Ti
- [ ] Create persistent `whisper-server.exe` mode (script, docker-compose, route update, health check)
- [ ] N-API native addon for zero-overhead Whisper (fork from `simd-bridge/cpp/`)

### VLM Deployment (from VLM_TRTLLM_DEPLOYMENT_PLAN + pipeline-audit)
- [ ] Run Colab VLM re-attachment notebook (preserve vision tower during LoRA merge)
- [ ] Fix VLM analyzer Ollama fallback (`gemma4-legal` → `gemma4:e4b` for image analysis)
- [ ] Disk cleanup (~119 GB recoverable: WSL crash dumps, Claude CLI cache, duplicate GGUFs)

### deeds_labs Archival (from DEEDS_LABS_ARCHIVAL)
- [ ] Create `semaj90/deeds-labs` private GitHub repo + push 17,900+ files
- [ ] Archive remaining dead files: `src/lib/tracking/`, `src/lib/stores/machines/`, `src/lib/utils/*.mjs`
- [x] Wire `/api/workflow-events` stub (referenced by `workflow-event-stream.ts`) — `src/routes/api/workflow-events/[sessionId]/+server.ts` created; Redis LPOP poll loop, SSE_CONNECTED emit, 5-min max duration, WORKFLOW_COMPLETE/ERROR auto-close

---

## Long-Term — Research / New Features

### 3D Prosecutor Simulation (from 3D_PROSECUTOR_SIMULATION_ROADMAP)
- [ ] Phase 1: Drizzle schemas (`canonical_documents`, `canonical_chunks`, `terms`, `examples`) + jurisdiction taxonomy
- [ ] Phase 2: Ingest FRE fundamentals + federal statutes + SCOTUS chunks with provenance
- [ ] Phase 3: Full fictional case schema (evidence, custody chains, charges, defenses, verifier)
- [ ] Phase 4: Qdrant `legal_canon_chunks` + RRF hybrid retrieval + cross-encoder reranker
- [ ] Phase 5: QLoRA prosecutor persona fine-tune + hallucination eval
- [ ] Phase 6: 3D courtroom API + Three.js/Babylon.js integration

### POI AI Enhancements (from poi-ai-enhancement-roadmap)
- [ ] Face detection pipeline (FaceNet/ArcFace → pgvector → cross-POI matching)
- [ ] Auto photo categorization (scene, objects, activity, evidence type)
- [ ] EXIF/GPS metadata extraction + timeline reconstruction + anomaly detection

### Audio-to-Knowledge Pipeline (from audio-to-knowledge-pipeline)
- [ ] XState v5 audio upload machine + `AudioUploadWidget.svelte`
- [ ] RabbitMQ `audio.process` queue worker (Whisper → SIMD → LangExtract → ACE → Qdrant → KAG/DAG)
- [ ] SSE progress streaming endpoint

### N-API / C++ Audit (from TS_NAPI_CPP_AST_GRAPH_AUDIT)
- [ ] TypeScript route graph enumeration (graph/error-brain/ai/health routes)
- [ ] TS → N-API boundary audit (prove live native addon usage)
- [ ] C++ export graph + CUDA requirement + fallback audit

### Pipeline Gaps (from deep-review-pipeline-gaps-roadmap)
- [ ] Triton/TRT-LLM deployment (0/10 WSL2 readiness phases) — DEFERRED
- [ ] Go gRPC embedding server reactivation from `deeds_labs/` archive — DEFERRED
- [ ] gRPC proto service activation (ToolCalling, Retrieval, Whisper, simdjson) — DEFERRED

---

## File Status Summary (43 files in next_steps/active/)

| Status | Count | Action |
|--------|-------|--------|
| **Archive candidate** | 17 | Marked SUPERSEDED/COMPLETE — safe to move to `next_steps/completed/` |
| **Active roadmap** | 16 | Contain pending actionable work above |
| **Reference doc** | 10 | GPU comparison, Colab setup, N-API call map — keep as-is |

### Archive Candidates (17 files)
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
