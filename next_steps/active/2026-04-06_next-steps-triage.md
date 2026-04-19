# Next Steps File Triage — April 6, 2026
**Status**: SUPERSEDED — replaced by April 18, 2026 re-triage. Archive candidate.

**Scope**: 39 files in `next_steps/active/` + 2 root-level files
**Also**: 9 in `archive/`, 26 in `completed/`, 9 in `canonical/`

---

## Summary

| Category | Count | Action |
|----------|-------|--------|
| **Superseded** | 11 | → `completed/` or `archive/` |
| **Still Active** | 16 | Keep in `active/`, some merge |
| **Deferred** | 7 | → `archive/` with DEFERRED label |
| **Root-level** | 2 | Keep as-is (reference docs) |

---

## SUPERSEDED (11) → Move to `completed/` or `archive/`

These files are point-in-time snapshots, completed work logs, or have been fully consumed by newer docs.

| # | File | Reason | Destination |
|---|------|--------|-------------|
| 2 | `2026-03-15_TRITON_VLM_FULL_PIPELINE.md` | Pre-Gemma4 era (March 15). Model references stale. Pipeline concept absorbed into #20, #36. | `archive/` |
| 3 | `2026-03-15_TRTLLM_EXECUTION_PIPELINE.md` | Same Gemma3 era. Steps still valid but superseded by `TRT_ENGINE_BUILD_STEPS.md` (#33) which is model-agnostic. | `archive/` |
| 15 | `COUCHDB_NEO4J_GPU_READINESS_AUDIT_2026-03-31.md` | Container status snapshot from Mar 31. Neo4j multi-hop now wired (consolidated-todo confirms). | `completed/` |
| 19 | `GEMMA4_INTEGRATION_PLAN_2026-04-03.md` | Integration decisions done. Gemma4 E4B deployed and running. Consumed by #5, #8, #20. | `completed/` |
| 23 | `PERFORMANCE_TEST_PLAN.md` | Session 93 era. Cache infra has evolved; Redis template patterns changed. | `archive/` |
| 27 | `RUNTIME_PROOF_HANDOFF_2026-03-31.md` | Point-in-time snapshot (50/50 screenshots). Newer runtime proofs exist. | `completed/` |
| 29 | `SESSION_TODO_2026-04-03.md` | Completed session log. Docker cleanup (16GB freed), VHDX compact (45GB), Langfuse v3, Bifrost fix — all done. | `completed/` |
| 32 | `TRT_DIRECTORY_CONSOLIDATION.md` | Pre-archive analysis from Mar 9. Archival actions already executed. | `completed/` |
| 38 | `UUID_VALIDATION_DRIZZLE_AUDIT.md` | Explicitly marked COMPLETE. 78 UUID routes validated, 54/54 Playwright tests pass. Keep as reference. | `completed/` |
| 39 | `WSL2_TRTLLM_READINESS_CHECKLIST_2026-03-31.md` | Validation plan, but TRT steps consolidated into #33. WSL2-specific Docker quirks are in `docker-cuda-setup.md`. | `archive/` |
| 1 | `2026-03-15_GPU_UPGRADE_COMPARISON.md` | Hardware purchase comparison matrix. No code action. RTX 3060 Ti still in use. | `archive/` (reference) |

---

## STILL ACTIVE (16) — Keep in `active/`

### Tier 1: Current Working Frontier (5 files)

These are the canonical docs driving current and next-sprint work.

| # | File | Why Active | Recommendation |
|---|------|-----------|---------------|
| 5 | `2026-04-06_consolidated-todo.md` | **Master TODO** — single source of truth. Ranked remaining tasks with effort/impact. | **CANONICAL** — keep as primary tracker |
| 6 | `2026-04-06_deep-review-pipeline-gaps-roadmap.md` | Architecture decisions (gRPC+N-API over Python, Bifrost+CHR97 unification). Gap items feed #5. | Keep — architectural decision record |
| 8 | `2026-04-06_pipeline-audit-and-vlm-roadmap.md` | 16-component pipeline audit. Gemma4 vs Gemma3 VLM decision matrix. Model inventory. | Keep — VLM decision reference |
| 9 | `2026-04-06_whisper-multilingual-gpu-roadmap.md` | Whisper route is wired but GPU batch + persistent model TODOs remain open. | Keep — whisper work continues |
| 20 | `GEMMA4_VLM_MULTIMODAL_TRAINING_PLAN_2026-04-05.md` | VLM training plan is the next major inference milestone. Tracks upstream PEFT/llama.cpp blockers. | Keep — next inference milestone |

### Tier 2: Valid References with Open Items (7 files)

| # | File | Why Active | Recommendation |
|---|------|-----------|---------------|
| 4 | `2026-04-02_EVIDENCE_UPLOAD_VLM_NOTEBOOKS_TODO.md` | UI upload re-test and disk cleanup TODOs still open. | Keep — merge open items into #5 at next session |
| 11 | `ALL_ROUTES_DIRECTORY_CONSOLIDATION.md` | Route inventory (561 files). Explicitly warns it doesn't prove SSR correctness. | Keep — reference, not actionable |
| 25 | `PRODUCTION_ENHANCEMENT_ROADMAP_2026-03-31.md` | Master phased roadmap (stable core → TRT proven → VLM → LoRA). Governing project plan. | Keep — high-level project roadmap |
| 26 | `PRODUCTION_READINESS_2026-03-25.md` | Security/validation hardening. Updated Apr 4 with live ownership audit. Open items remain. | Keep — security tracker |
| 33 | `TRT_ENGINE_BUILD_STEPS.md` | Concrete INT4 AWQ engine build recipe. Still the reference for TRT engine creation. | Keep — build recipe reference |
| 36 | `UNSLOTH_VLM_CHR97_NEXT_STEPS_2026-04-02.md` | Prioritized gaps: P0 Triton VLM readiness, P1 adapter merge, P2 VLM evidence wiring. | Keep — feeds into #20 |
| 37 | `USER_ANALYTICS_NEO4J_VECTOR_CHAT.md` | Just audited today. Clear gap list: dashboard UI, graph reads, recommendation engine. | Keep — **top priority** for Neo4j activation |

### Tier 3: Architecture Visibility (4 files)

| # | File | Why Active | Recommendation |
|---|------|-----------|---------------|
| 12 | `ARCHITECTURE_ENHANCEMENT_ROADMAP_2026-04-02.md` | Full architecture diagram. Partially superseded by #6 for gap items. | Keep — architectural reference |
| 17 | `DEEP_REVIEW_AUDIT_2026-04-01.md` | Disk audit (45.8 GB workspace, 4.2% free on C:). Cleanup actions may still be needed. | Keep — disk pressure monitor |
| 31 | `TENSORRT_ENV_AND_ARCHIVED_SERVICES.md` | Reference for recreating deleted TRT Python venv. ELI5 map of old→new services. | Keep — reference doc |
| 34 | `TS_NAPI_CPP_AST_GRAPH_AUDIT_CHECKLIST_2026-03-31.md` | Architecture visibility: which routes hit native code, CUDA requirements, fallbacks. | Merge with #35 |
| 35 | `TS_NAPI_CPP_CROSS_LANGUAGE_CALL_MAP_2026-03-31.md` | Verified call map: `tensorrt_bridge.node` → simdjson (5) + libtorch (4). | Merge with #34 → single N-API reference |

---

## DEFERRED (7) → Move to `archive/` with DEFERRED tag

These are greenfield features, integration plans for unused frameworks, or aspirational roadmaps with no existing code.

| # | File | Reason for Deferral | Reactivation Trigger |
|---|------|---------------------|----------------------|
| 7 | `2026-04-06_gemma4-community-integration-checklist.md` | Competitive analysis complete. Our stack already exceeds community patterns. No remaining actions. | New Gemma release |
| 10 | `3D_PROSECUTOR_SIMULATION_ROADMAP.md` | No existing code. Large scope (QLoRA persona, canon schema, taxonomy). | Dedicated sprint allocation |
| 13 | `AUTOGEN_CREWAI_GO_INTEGRATION.md` | Oldest file (Jan 10). Go services exist but AutoGen/CrewAI integration not started. LangGraph now fills this role. | Decision to adopt AutoGen/CrewAI over LangGraph |
| 14 | `COLAB_MCP_SETUP.md` | Small reference doc for Colab GPU access. Valid but no active work depends on it. | Next Colab training run |
| 16 | `DEEDS_LABS_ARCHIVAL.md` | Push gitignored `deeds_labs/` (17,900 files) to separate repo. Medium-priority risk mitigation. | Disk cleanup sprint |
| 22 | `MULTIMODAL_IMPLEMENTATION_ROADMAP.md` | Ambitious FastAPI multi-model plan (YOLO, Whisper, CLIP, video). Most models not loaded. | After VLM training milestone |
| 28 | `SELF_HOSTED_AGENT_FRAMEWORK_PLAN.md` | Phase 96+ future work. Same scope as #13 but more recent. LangGraph supervisor now active. | Post-LangGraph evaluation |
| 30 | `SETUP_WIZARD_ONBOARDING.md` | Design marked COMPLETE but no component exists. | Pre-launch UX sprint |
| 21 | `GRANITE_DOCLING_258M_INTEGRATION_2026-04-05.md` | IBM's 258M VLM for structured docs. High-value but Gemma4 VLM is current priority. | After Gemma4 VLM merge success |
| 24 | `poi-ai-enhancement-roadmap.md` | POI face recognition design. Schema field exists but no implementation. | After core evidence pipeline stable |

*Note: 10 items listed but some could be fast-tracked if priorities shift.*

---

## ROOT-LEVEL FILES (2) — Keep as-is

| File | Purpose | Action |
|------|---------|--------|
| `langgraph-eval-plan.md` | Active eval plan with real test data (Apr 6). Supervisor vs flat comparison. | Keep — active eval |
| `semantic-search-pipeline.md` | Architecture diagram for multi-tier search. Reference doc. | Keep — or move to `canonical/` |

---

## EXISTING DIRECTORIES

| Directory | Count | Status |
|-----------|-------|--------|
| `archive/` | 9 files | Legacy — superseded plans and analysis |
| `archived/` | 0 files | Empty — consider deleting |
| `completed/` | 26 files | Session logs and finished work |
| `canonical/` | 9 files | Reference docs (guides, quick-start) |

---

## KEY FINDING: Graph Pipeline Code Exists, Needs Data

**Verified against codebase — all claims confirmed:**

| Component | Lines | Status | Consumers |
|-----------|-------|--------|-----------|
| `graph-centrality.ts` | 273 | 3 real Cypher functions, graceful degradation | recommendations API, user-analytics-context |
| `user-analytics-context.ts` | 92 | 3 parallel data sources (PG, Neo4j, Qdrant) | SSE chat (line 1308), context-assembler |
| `api/recommendations/+server.ts` | 476 | 5-step pipeline: embed → candidates → enrich → rank → cache | Client API |
| `analytics/+page.svelte` | 472 | 3-tab dashboard (overview, patterns, cache) | Route at `/analytics` |
| `seed-neo4j.mjs` | 362 | Full PG→Neo4j MERGE seeder with `--dry-run`, `--verify` | CLI script |
| Neo4j in docker-compose.yaml | — | `neo4j:5.18` + GDS plugin, healthcheck wired | App env vars |

**All degrade gracefully to empty results when Neo4j is offline.** The activation path is:

```bash
docker compose --profile full up -d neo4j
node scripts/seed-neo4j.mjs
```

This unlocks: graph centrality in recommendations, multi-hop case connections in SSE chat, and the analytics dashboard's Neo4j-powered tabs.

---

## RECOMMENDED MERGE PLAN

To reduce file count from 39 → ~20 active:

1. **Move 11 superseded** → `completed/` or `archive/`
2. **Move 7+ deferred** → `archive/` (tag as DEFERRED in header)
3. **Merge** #34 + #35 → single `TS_NAPI_CPP_REFERENCE.md`
4. **Merge** #4 open items into #5 (consolidated-todo)
5. **Delete** empty `archived/` directory
6. **Move** `semantic-search-pipeline.md` → `canonical/`

### Post-Triage Active Set (~16 files):

**Canonical tracker**: `consolidated-todo.md`
**Architecture**: `deep-review-pipeline-gaps-roadmap.md`, `ARCHITECTURE_ENHANCEMENT_ROADMAP.md`
**Pipeline/VLM**: `pipeline-audit-and-vlm-roadmap.md`, `GEMMA4_VLM_MULTIMODAL_TRAINING_PLAN.md`, `UNSLOTH_VLM_CHR97.md`
**Whisper**: `whisper-multilingual-gpu-roadmap.md`
**TRT**: `TRT_ENGINE_BUILD_STEPS.md`, `TENSORRT_ENV_AND_ARCHIVED_SERVICES.md`
**Production**: `PRODUCTION_ENHANCEMENT_ROADMAP.md`, `PRODUCTION_READINESS.md`
**Routes/Testing**: `ALL_ROUTES_DIRECTORY_CONSOLIDATION.md`, `ENHANCED_UX_PLAYWRIGHT_TESTING.md`
**Graph/Analytics**: `USER_ANALYTICS_NEO4J_VECTOR_CHAT.md`
**N-API**: `TS_NAPI_CPP_REFERENCE.md` (merged)
**Disk**: `DEEP_REVIEW_AUDIT.md`
**Eval**: `langgraph-eval-plan.md`

---

## NEXT ACTION PRIORITIES (from active files)

| Priority | Action | Source File | Effort |
|----------|--------|-------------|--------|
| **P0** | Start Neo4j + seed data | #37 | 15 min |
| **P1** | Wire SearXNG as agent web search | #5 | 30 min |
| **P1** | VLM re-attachment (frozen-vision LoRA) | #20 | 2 hr (Colab) |
| **P2** | Fuse.js cold-start pre-population | #5 | 1 hr |
| **P2** | Persistent whisper-server.exe mode | #9 | 2 hr |
| **P2** | DAG/CouchDB production validation | #5 | 1 hr |
| **P3** | Langfuse spans in whisper route | #5 | 30 min |
| **P3** | Disk cleanup (C: at 4.2% free) | #17 | Variable |
