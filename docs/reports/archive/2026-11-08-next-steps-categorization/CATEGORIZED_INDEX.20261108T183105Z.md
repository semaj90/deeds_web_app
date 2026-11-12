# Next Steps — Categorized 14-Domain Index

**Generated**: 2026-11-08T18:30:22.080Z | **Docs classified**: 314 markdown (generated indexes and non-markdown excluded: 6) | **Status**: PROPOSAL, unreviewed, `canonicalAuthority:false` | **Palette**: nes-domain-palette-v2-candidate (CANDIDATE_NOT_APPLIED, checksum `sha256:9aa054b0...`)

Complements [INDEX.md](./INDEX.md) (every tracked doc with date and Status line). Domains are keyword scores, not reviewed labels. "Topic hint" says what a doc talks about, not where anything runs; documents are not worker jobs. "Comm*" is a heuristic number derived from the domain, not a graph community. No file was moved.

## Topic Hint Summary (keyword-based)

- **cpu topics** (`CPU_TOPIC`): 58 docs (default; no gpu/audit keywords)
- **gpu topics** (`GPU_TOPIC`): 190 docs (ml/graph domain, or the words gpu, cuda, tensor, vlm, 3dgs appear)
- **governance topics** (`GOVERNANCE_TOPIC`): 66 docs (auth/devops domain, or the words audit, gate, promotion, policy appear)

## Domain Table of Contents

- [🛡️ Auth (7)](#auth)
- [🎨 UI (31)](#ui)
- [🔍 Retrieval (58)](#retrieval)
- [🌐 Network (6)](#network)
- [🗄️ Database (43)](#database)
- [⚡ Cache (30)](#cache)
- [🤖 Agent (20)](#agent)
- [🕸️ Graph (29)](#graph)
- [🧠 ML/GPU (47)](#ml)
- [📄 General (1)](#general)
- [⚙️ Compiler (1)](#compiler)
- [🚀 DevOps (19)](#devops)
- [🩹 Error Handling (8)](#error-handling)
- [🧪 Test (14)](#test)

### <a id="auth"></a>🛡️ Auth (`DOM_AUTH_GUARD` | Byte: 1 | Hex: `0x16`) — 7 Docs

| Document | Status | Topic hint | Comm* | Title |
|---|---|---|:---:|---|
| [PRODUCTION_READINESS_2026-03-25.md](../next_steps/completed/production-history/PRODUCTION_READINESS_2026-03-25.md) | `IN PROGRESS — P0/P1/P2 q` | `GPU_TOPIC` | 10 | PRODUCTION_READINESS_2026-03-25.md |
| [2026-05-03-auth-gaps.md](../sveltekit-frontend/next_steps/active/2026-05-03-auth-gaps.md) | `401 });` | `GOVERNANCE_TOPIC` | 10 | Auth Guard Coverage Plan — 2026-05-03 20:44:51 |
| [2026-05-07-dir-audit-lib-server.md](../sveltekit-frontend/next_steps/active/2026-05-07-dir-audit-lib-server.md) | `ACTIVE` | `GPU_TOPIC` | 1 | Deep Directory Audit — 2026-05-07 20:57:56 |
| [2026-05-09-dir-audit-lib-server.md](../sveltekit-frontend/next_steps/active/2026-05-09-dir-audit-lib-server.md) | `ACTIVE` | `GPU_TOPIC` | 10 | Deep Directory Audit — 2026-05-09 07:09:45 |
| [2026-06-16-auth-gaps.md](../sveltekit-frontend/next_steps/active/2026-06-16-auth-gaps.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 10 | Auth Guard Coverage Plan — 2026-06-16 (UPDATED 2026-07-07) |
| [2026-06-16-production-blockers.md](../sveltekit-frontend/next_steps/active/2026-06-16-production-blockers.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 10 | Production Blockers Plan — 2026-06-16 18:19:20 |
| [2026-07-01-dir-audit-lib-server.md](../sveltekit-frontend/next_steps/active/2026-07-01-dir-audit-lib-server.md) | `ACTIVE` | `GPU_TOPIC` | 10 | Deep Directory Audit — 2026-07-01 15:46:14 |

### <a id="ui"></a>🎨 UI (`DOM_UI_SVELTE5_RUNES` | Byte: 2 | Hex: `0x2A`) — 31 Docs

| Document | Status | Topic hint | Comm* | Title |
|---|---|---|:---:|---|
| [AST-Audit-2026-04-21-12-12-11.md](../next_steps/AST-Audit-2026-04-21-12-12-11.md) | `deep-audit-complete` | `GOVERNANCE_TOPIC` | 3 | 🧠 AST-Grounded Research Report - 2026-04-21 |
| [2026-05-04-graph-analysis.md](../next_steps/active/2026-05-04-graph-analysis.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 3 | Codebase Graph Analysis — 2026-05-04 |
| [2026-05-08_detective-mode-3d-reconstruction.md](../next_steps/active/2026-05-08_detective-mode-3d-reconstruction.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 3 | 2026-05-08_detective-mode-3d-reconstruction.md |
| [2026-05-08_visual-evidence-lane-todo.md](../next_steps/active/2026-05-08_visual-evidence-lane-todo.md) | `ACTIVE` | `GPU_TOPIC` | 1 | 2026-05-08_visual-evidence-lane-todo.md |
| [2026-05-29_reconstruction-lanes-map.md](../next_steps/active/2026-05-29_reconstruction-lanes-map.md) | `Infrastructure audit com` | `GOVERNANCE_TOPIC` | 3 | 3-Track Reconstruction Architecture Map |
| [2026-05-30_ARCHITECTURE_TODO_CLIENT_SERVER_SEPARATION.md](../next_steps/active/2026-05-30_ARCHITECTURE_TODO_CLIENT_SERVER_SEPARATION.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 3 | Architecture TODO — Client/Server Separation + XState Deprioritization |
| [2026-07-18_browser_3d_gemma4_lane_plan.md](../next_steps/active/2026-07-18_browser_3d_gemma4_lane_plan.md) | `ACTIVE` | `GPU_TOPIC` | 3 | Browser 3D + Gemma4 Lane Plan |
| [2026-07-18_phoenix_wright_courtroom_integration.md](../next_steps/active/2026-07-18_phoenix_wright_courtroom_integration.md) | `ACTIVE` | `CPU_TOPIC` | 3 | Phoenix Wright Courtroom Integration |
| [ARCHIVE_GEMS_REVIEW.md](../next_steps/archive/ARCHIVE_GEMS_REVIEW.md) | `⭐ 1 superior implementat` | `CPU_TOPIC` | 3 | deeds_labs Archive Review - Superior Code Findings |
| [COMPREHENSIVE_CONSOLIDATION_ROADMAP.md](../next_steps/archive/COMPREHENSIVE_CONSOLIDATION_ROADMAP.md) | `ARCHIVE` | `GPU_TOPIC` | 3 | COMPREHENSIVE_CONSOLIDATION_ROADMAP.md |
| [WEBGPU_DEMO_IMPLEMENTATION.md](../next_steps/archive/WEBGPU_DEMO_IMPLEMENTATION.md) | `✅ Complete` | `GPU_TOPIC` | 3 | WebGPU Memory Palace Demo — Implementation Summary |
| [ACTIVE_DEMOS_LIST.md](../next_steps/canonical/ACTIVE_DEMOS_LIST.md) | `CANONICAL` | `GPU_TOPIC` | 3 | Active Demos — Complete List |
| [TESTING_GUIDE.md](../next_steps/canonical/TESTING_GUIDE.md) | `CANONICAL` | `CPU_TOPIC` | 3 | TESTING_GUIDE.md |
| [ALL_ROUTES_DIRECTORY_CONSOLIDATION.md](../next_steps/completed/ALL_ROUTES_DIRECTORY_CONSOLIDATION.md) | `ROUTE DIRECTORY COMPLETE` | `GPU_TOPIC` | 3 | ALL_ROUTES_DIRECTORY_CONSOLIDATION.md |
| [ALL_ROUTES_ENHANCEMENT_PLAN.md](../next_steps/completed/ALL_ROUTES_ENHANCEMENT_PLAN.md) | `COMPLETED` | `CPU_TOPIC` | 3 | ALL_ROUTES_ENHANCEMENT_PLAN.md |
| [CODEBASE_ANALYSIS_REPORT.md](../next_steps/completed/CODEBASE_ANALYSIS_REPORT.md) | `COMPLETED` | `GOVERNANCE_TOPIC` | 3 | Codebase Analysis Report — 2026-03-16 (Full 4-Skill Audit) |
| [DEEDS_LABS_ARCHIVAL.md](../next_steps/completed/DEEDS_LABS_ARCHIVAL.md) | `TODO` | `GPU_TOPIC` | 1 | DEEDS_LABS_ARCHIVAL.md |
| [ERROR_ELIMINATION_ROADMAP_2026-02-09.md](../next_steps/completed/ERROR_ELIMINATION_ROADMAP_2026-02-09.md) | `COMPLETED` | `CPU_TOPIC` | 3 | ERROR_ELIMINATION_ROADMAP_2026-02-09.md |
| [LEGAL_AI_UX_IMPLEMENTATION.md](../next_steps/completed/LEGAL_AI_UX_IMPLEMENTATION.md) | `COMPLETED` | `GPU_TOPIC` | 3 | LEGAL_AI_UX_IMPLEMENTATION.md |
| [P4_ROUTES_PARKED_REVIEW.md](../next_steps/completed/P4_ROUTES_PARKED_REVIEW.md) | `✅ **ALREADY COMPLETE** -` | `CPU_TOPIC` | 3 | P4: routes_parked Cleanup - Deep Review |
| [SETUP_WIZARD_ONBOARDING.md](../next_steps/completed/SETUP_WIZARD_ONBOARDING.md) | `✅ COMPLETE — All items d` | `GPU_TOPIC` | 3 | Setup Wizard — Interactive Onboarding Tutorial |
| [UUID_VALIDATION_DRIZZLE_AUDIT.md](../next_steps/completed/UUID_VALIDATION_DRIZZLE_AUDIT.md) | `✅ COMPLETE (78 UUID + 11` | `GPU_TOPIC` | 3 | UUID Validation Audit — Drizzle API Routes |
| [PRODUCTION_AUDIT_2026-03-15.md](../next_steps/completed/production-history/PRODUCTION_AUDIT_2026-03-15.md) | `COMPLETED` | `GPU_TOPIC` | 3 | PRODUCTION_AUDIT_2026-03-15.md |
| [PRODUCTION_READINESS_PLAN_2026-02-09.md](../next_steps/completed/production-history/PRODUCTION_READINESS_PLAN_2026-02-09.md) | `COMPLETED` | `CPU_TOPIC` | 3 | PRODUCTION_READINESS_PLAN_2026-02-09.md |
| [MULTIMODAL_INTEGRATION_GUIDE.md](../next_steps/completed/vlm-history/MULTIMODAL_INTEGRATION_GUIDE.md) | `Phase 1 Complete + FastM` | `GPU_TOPIC` | 3 | MULTIMODAL_INTEGRATION_GUIDE.md |
| [FULL_CONSOLIDATION_REPORT.md](../next_steps/consolidated_audits/FULL_CONSOLIDATION_REPORT.md) | `ACTIVE` | `CPU_TOPIC` | 3 | 🏗️ Production Consolidation: Codebase Health Report |
| [12-app-wiring-consolidation.md](../sveltekit-frontend/next_steps/12-app-wiring-consolidation.md) | `PLANNING` | `GOVERNANCE_TOPIC` | 3 | 12 — App Directory Wiring Diagrams & Consolidation Plan |
| [2026-05-10_production-mental-model.md](../sveltekit-frontend/next_steps/active/2026-05-10_production-mental-model.md) | `planning / synthesis. **` | `GPU_TOPIC` | 21 | 2026-05-10_production-mental-model.md |
| [2026-05-10_service-worker-regex-tool-router.md](../sveltekit-frontend/next_steps/active/2026-05-10_service-worker-regex-tool-router.md) | `design-only, not impleme` | `CPU_TOPIC` | 3 | Service Worker Token Offload + Regex Intent Router — Design Doc |
| [mau5_subgraph_grep_stream_analysis.md](../sveltekit-frontend/next_steps/plans/mau5_subgraph_grep_stream_analysis.md) | `PLANNING` | `CPU_TOPIC` | 3 | mau5-subgraph-grep-stream-analysis.md — Repo Diagnostics for Subgraph Instruction Programming |
| [subgraph_instruction_programming_schema_todo.md](../sveltekit-frontend/next_steps/plans/subgraph_instruction_programming_schema_todo.md) | `PLANNING` | `GPU_TOPIC` | 3 | Subgraph Instruction Programming + KAG/ACE Topology TODO |

### <a id="retrieval"></a>🔍 Retrieval (`DOM_RETRIEVAL_ANN_RRF` | Byte: 3 | Hex: `0x21`) — 58 Docs

| Document | Status | Topic hint | Comm* | Title |
|---|---|---|:---:|---|
| [litert-conversion-pathway.md](../docs/next_steps/litert-conversion-pathway.md) | `DEFERRED` | `GPU_TOPIC` | 1 | LiteRT.js Conversion Pathway (Optional Post-Phase 106) |
| [PHASE_76_ROADMAP.md](../next_steps/PHASE_76_ROADMAP.md) | `✅ **RESOLVED** — `svelte` | `GPU_TOPIC` | 1 | PHASE_76_ROADMAP.md |
| [2026-05-08_topology-notebook-glossary.md](../next_steps/active/2026-05-08_topology-notebook-glossary.md) | `ACTIVE` | `GPU_TOPIC` | 1 | 2026-05-08_topology-notebook-glossary.md |
| [2026-05-14_183210_long-context-architecture.md](../next_steps/active/2026-05-14_183210_long-context-architecture.md) | `ACTIVE` | `CPU_TOPIC` | 10 | Long-Context Architecture Prompt |
| [2026-05-14_docs-codebase-indexing-pathmap.md](../next_steps/active/2026-05-14_docs-codebase-indexing-pathmap.md) | `ACTIVE` | `GPU_TOPIC` | 10 | Docs Codebase Indexing + Path Map |
| [2026-05-14_surrealdb-multi-store-consolidation-note.md](../next_steps/active/2026-05-14_surrealdb-multi-store-consolidation-note.md) | `ACTIVE` | `CPU_TOPIC` | 10 | SurrealDB Multi-Store Consolidation Note |
| [2026-05-19_qdrant-cluster-autoencoder-roadmap.md](../next_steps/active/2026-05-19_qdrant-cluster-autoencoder-roadmap.md) | `ACTIVE` | `GPU_TOPIC` | 10 | 2026-05-19_qdrant-cluster-autoencoder-roadmap.md |
| [2026-05-30_ATLAS_JOIN_FIX_STRATEGY.md](../next_steps/active/2026-05-30_ATLAS_JOIN_FIX_STRATEGY.md) | `BLOCKER ANALYSIS (Phase ` | `CPU_TOPIC` | 10 | Atlas Join Fix: sourceRef ↔ Card Contract Resolution |
| [2026-05-30_PHASE_19B_ACE_INTEGRATION.md](../next_steps/active/2026-05-30_PHASE_19B_ACE_INTEGRATION.md) | `Integration design (read` | `GOVERNANCE_TOPIC` | 10 | Phase 19B Integration: Card Lifecycle → ACE Context Assembler |
| [2026-05-30_PHASE_19B_FEATURE_REGISTRY_COMPLETE.md](../next_steps/active/2026-05-30_PHASE_19B_FEATURE_REGISTRY_COMPLETE.md) | `✅ **PRODUCTION READY** (` | `GOVERNANCE_TOPIC` | 10 | Phase 19B Feature Registry — COMPLETE |
| [2026-05-30_PHASE_19C_CONSOLIDATION_COMPLETE.md](../next_steps/active/2026-05-30_PHASE_19C_CONSOLIDATION_COMPLETE.md) | `✅ **PRODUCTION READY** (` | `GOVERNANCE_TOPIC` | 10 | Phase 19C Knowledge Consolidation — COMPLETE & OPERATIONAL |
| [2026-06-10_PHASE-3-IMPLEMENTATION-GATES.md](../next_steps/active/2026-06-10_PHASE-3-IMPLEMENTATION-GATES.md) | `** READY FOR EXECUTION` | `GOVERNANCE_TOPIC` | 10 | Phase 3: Implementation Gates |
| [2026-06-10_PHASE-3-RUNTIME-INTELLIGENCE.md](../next_steps/active/2026-06-10_PHASE-3-RUNTIME-INTELLIGENCE.md) | `** COMPLETE, DO NOT MODI` | `CPU_TOPIC` | 10 | Phase 3: Runtime Intelligence — Strategic Shift |
| [2026-06-10_PHASE-3-STRATEGIC-PIVOT.md](../next_steps/active/2026-06-10_PHASE-3-STRATEGIC-PIVOT.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 10 | Phase 3: Strategic Pivot — From Retrieval Metrics to Agentic Execution |
| [2026-09-12_promotion-board-real-work.md](../next_steps/active/2026-09-12_promotion-board-real-work.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 21 | Promotion Board — Real Work Remaining (2026-09-12) |
| [2026-09-16_openspec-tasks-md-audit.md](../next_steps/active/2026-09-16_openspec-tasks-md-audit.md) | `ACTIVE` | `GPU_TOPIC` | 1 | OpenSpec tasks.md Audit — 2026-09-16T23:08:10.847Z |
| [2026-10-12-opencode-ace-addendum.md](../next_steps/active/2026-10-12-opencode-ace-addendum.md) | `Gate 0 partial; containm` | `GOVERNANCE_TOPIC` | 10 | OpenCode ACE addendum: next steps (updated 2026-10-12) |
| [JEPA_DSPY_NEXT_STEPS.md](../next_steps/active/JEPA_DSPY_NEXT_STEPS.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 10 | JEPA + DSPy Next Steps |
| [OPEN_TELEMETRY_PHASE9_PLAN.md](../next_steps/active/OPEN_TELEMETRY_PHASE9_PLAN.md) | `ACTIVE` | `GPU_TOPIC` | 1 | OpenTelemetry Phase 9 Plan |
| [codebase-layer-mapping-2026-05-19.md](../next_steps/active/codebase-layer-mapping-2026-05-19.md) | `ACTIVE` | `CPU_TOPIC` | 10 | codebase-layer-mapping-2026-05-19.md |
| [retrieval-replay-eval.md](../next_steps/active/retrieval-replay-eval.md) | `** **Failed**. The syste` | `GPU_TOPIC` | 10 | Retrieval Replay Evaluation (L6) |
| [todo-gemma4-surgical-tensor-memory.md](../next_steps/active/todo-gemma4-surgical-tensor-memory.md) | `** Active planning — foc` | `GPU_TOPIC` | 10 | todo-gemma4-surgical-tensor-memory.md |
| [3D_PROSECUTOR_SIMULATION_DEEP_RESEARCH.md](../next_steps/archive/3D_PROSECUTOR_SIMULATION_DEEP_RESEARCH.md) | `ARCHIVE` | `CPU_TOPIC` | 10 | Building a 3D Prosecutor Simulation With Fictional Cases and High-Fidelity Legal Realism |
| [2026-03-14_INFRASTRUCTURE_OPTIMIZATION_ROADMAP.md](../next_steps/completed/2026-03-14_INFRASTRUCTURE_OPTIMIZATION_ROADMAP.md) | `COMPLETED` | `GOVERNANCE_TOPIC` | 1 | 2026-03-14_INFRASTRUCTURE_OPTIMIZATION_ROADMAP.md |
| [2026-04-06_gemma4-community-integration-checklist.md](../next_steps/completed/2026-04-06_gemma4-community-integration-checklist.md) | `What We Already Have ✅` | `GPU_TOPIC` | 1 | 2026-04-06_gemma4-community-integration-checklist.md |
| [3D_PROSECUTOR_SIMULATION_ROADMAP.md](../next_steps/completed/3D_PROSECUTOR_SIMULATION_ROADMAP.md) | `COMPLETED` | `CPU_TOPIC` | 10 | 3D Prosecutor Simulation — Implementation Roadmap |
| [ARCHITECTURE_ENHANCEMENT_ROADMAP_2026-04-02.md](../next_steps/completed/ARCHITECTURE_ENHANCEMENT_ROADMAP_2026-04-02.md) | `SUPERSEDED — predates Bi` | `GPU_TOPIC` | 1 | ARCHITECTURE_ENHANCEMENT_ROADMAP_2026-04-02.md |
| [CASE_SIMILARITY_IMPLEMENTATION.md](../next_steps/completed/CASE_SIMILARITY_IMPLEMENTATION.md) | `✅ Complete` | `CPU_TOPIC` | 10 | Case Similarity Analysis — Implementation Summary |
| [LAWPDFS_INDEXING_GUIDE.md](../next_steps/completed/LAWPDFS_INDEXING_GUIDE.md) | `Ready to execute` | `CPU_TOPIC` | 10 | LAWPDFS_INDEXING_GUIDE.md |
| [MCP_RAG_PIPELINE_AUDIT.md](../next_steps/completed/MCP_RAG_PIPELINE_AUDIT.md) | `COMPLETED` | `GPU_TOPIC` | 10 | MCP + RAG/KAG/DAG Pipeline Audit & Enhancements |
| [P3_P4_COMPLETION_PLAN.md](../next_steps/completed/P3_P4_COMPLETION_PLAN.md) | `0 errors, 396 warnings, ` | `CPU_TOPIC` | 10 | P3/P4 Completion Plan - Production UX Polish |
| [langfuse-next-steps.md](../next_steps/completed/langfuse-next-steps.md) | `COMPLETED` | `GPU_TOPIC` | 10 | Langfuse Integration — Next Steps |
| [2026-04-18_ai-analysis-recommendations-buildout.md](../next_steps/completed/session-history/2026-04-18_ai-analysis-recommendations-buildout.md) | `✅ COMPLETED — all 5 item` | `CPU_TOPIC` | 1 | 2026-04-18_ai-analysis-recommendations-buildout.md |
| [semantic-search-pipeline.md](../next_steps/semantic-search-pipeline.md) | `ACTIVE` | `GPU_TOPIC` | 10 | Semantic Search Pipeline — Architecture & File Map |
| [02-mcp-integration.md](../sveltekit-frontend/next_steps/02-mcp-integration.md) | `** 11 tools implemented,` | `CPU_TOPIC` | 10 | MCP Integration - Next Steps |
| [04-ai-integration.md](../sveltekit-frontend/next_steps/04-ai-integration.md) | `ACTIVE` | `CPU_TOPIC` | 10 | AI & LLM Integration - Next Steps |
| [11-wiring-production-quality.md](../sveltekit-frontend/next_steps/11-wiring-production-quality.md) | `ACTIVE` | `GPU_TOPIC` | 10 | Production Readiness: VLM/Triton Deployment Pipeline |
| [2026-05-08-production-core-routes-recommendation.md](../sveltekit-frontend/next_steps/active/2026-05-08-production-core-routes-recommendation.md) | `ACTIVE` | `CPU_TOPIC` | 10 | Production Core Routes Recommendation - 2026-05-08 |
| [2026-05-08_23-30-42_topology-admin-thoughts.md](../sveltekit-frontend/next_steps/active/2026-05-08_23-30-42_topology-admin-thoughts.md) | `ACTIVE` | `GPU_TOPIC` | 10 | Topology + Admin Thoughts (Updated June 2, 2026) |
| [2026-05-08_agentic-ingestion-program.md](../sveltekit-frontend/next_steps/active/2026-05-08_agentic-ingestion-program.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 10 | Agentic Ingestion Program - 2026-05-08 |
| [2026-05-08_agentic-retrieval-checklist.md](../sveltekit-frontend/next_steps/active/2026-05-08_agentic-retrieval-checklist.md) | `ACTIVE` | `GPU_TOPIC` | 10 | Agentic Retrieval Checklist - 2026-05-08 |
| [2026-05-08_agentic-retrieval-ladder.md](../sveltekit-frontend/next_steps/active/2026-05-08_agentic-retrieval-ladder.md) | `ACTIVE` | `CPU_TOPIC` | 10 | Agentic Retrieval Ladder - 2026-05-08 |
| [2026-05-08_path-mapping-retrieval-stack.md](../sveltekit-frontend/next_steps/active/2026-05-08_path-mapping-retrieval-stack.md) | `ACTIVE` | `CPU_TOPIC` | 10 | Path Mapping + Retrieval Stack - 2026-05-08 |
| [INDEX.md](../sveltekit-frontend/next_steps/active/2026-06-16-directory-context/INDEX.md) | `ACTIVE` | `CPU_TOPIC` | 10 | Directory Context Index — 2026-06-16 18:19:20 |
| [codebase-index-api-context.md](../sveltekit-frontend/next_steps/active/2026-06-16-directory-context/codebase-index-api-context.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 10 | Directory Context: `src/routes/api/codebase-index` — 2026-06-16 18:19:20 |
| [indexer-context.md](../sveltekit-frontend/next_steps/active/2026-06-16-directory-context/indexer-context.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 10 | Directory Context: `src/lib/server/indexer` — 2026-06-16 18:19:20 |
| [retrieval-context.md](../sveltekit-frontend/next_steps/active/2026-06-16-directory-context/retrieval-context.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 10 | Directory Context: `src/lib/server/retrieval` — 2026-06-16 18:19:20 |
| [vector-context.md](../sveltekit-frontend/next_steps/active/2026-06-16-directory-context/vector-context.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 10 | Directory Context: `src/lib/server/vector` — 2026-06-16 18:19:20 |
| [codebase-todo-recommendations.md](../sveltekit-frontend/next_steps/active/codebase-todo-recommendations.md) | `ACTIVE` | `GPU_TOPIC` | 10 | codebase-todo-recommendations.md |
| [ace_feature_context_matrix_codex_prompt.md](../sveltekit-frontend/next_steps/plans/ace_feature_context_matrix_codex_prompt.md) | `PLANNING` | `GPU_TOPIC` | 1 | ace_feature_context_matrix_codex_prompt.md |
| [bitfrost_turboquant_turbovec_production_todo.md](../sveltekit-frontend/next_steps/plans/bitfrost_turboquant_turbovec_production_todo.md) | `PLANNING` | `GPU_TOPIC` | 21 | bitfrost_turboquant_turbovec_production_todo.md |
| [codex_workstation_agentic_todos.md](../sveltekit-frontend/next_steps/plans/codex_workstation_agentic_todos.md) | `PLANNING` | `GPU_TOPIC` | 10 | Codex Workstation Prompt + TODOs for Local Legal-AI HyperRAG Node |
| [enhanced_master_agents_path_map.md](../sveltekit-frontend/next_steps/plans/enhanced_master_agents_path_map.md) | `PLANNING` | `GPU_TOPIC` | 10 | enhanced_master_agents_path_map.md |
| [gpu_karpathy_feature_mapping_atlas_plan.md](../sveltekit-frontend/next_steps/plans/gpu_karpathy_feature_mapping_atlas_plan.md) | `PLANNING` | `GPU_TOPIC` | 10 | Deeds Web App — Consolidated Feature Breakdown + GPU/Karpathy Atlas Enhancement Plan |
| [langfuse_embedding_subagent_observability_todo.md](../sveltekit-frontend/next_steps/plans/langfuse_embedding_subagent_observability_todo.md) | `PLANNING` | `GPU_TOPIC` | 1 | langfuse_embedding_subagent_observability_todo.md |
| [ocr_langextract_whisper_memory_gpu_todo.md](../sveltekit-frontend/next_steps/plans/ocr_langextract_whisper_memory_gpu_todo.md) | `PLANNING` | `GPU_TOPIC` | 10 | OCR + LangExtract + Whisper Memory/GPU TODO |
| [sveltekit_llm_wiki_evidence_ingestion_todo.md](../sveltekit-frontend/next_steps/plans/sveltekit_llm_wiki_evidence_ingestion_todo.md) | `PLANNING` | `GPU_TOPIC` | 10 | SvelteKit 2 LLM-Wiki + Evidence Ingestion TODO |
| [turbovec_gpu_bitfrost_evidence_architecture.md](../sveltekit-frontend/next_steps/plans/turbovec_gpu_bitfrost_evidence_architecture.md) | `PLANNING` | `GPU_TOPIC` | 21 | TurboVec + GPU CUDA Streams + BitFrost ACE Context Architecture |

### <a id="network"></a>🌐 Network (`DOM_NETWORK_HTTP_TRPC` | Byte: 4 | Hex: `0x2C`) — 6 Docs

| Document | Status | Topic hint | Comm* | Title |
|---|---|---|:---:|---|
| [2026-05-08_serialization-roadmap.md](../next_steps/active/2026-05-08_serialization-roadmap.md) | `ACTIVE` | `CPU_TOPIC` | 4 | Serialization Roadmap — JSONB → Proto → gRPC → MCP → QUIC |
| [GO_GRPC_IMPLEMENTATION_GUIDE.md](../next_steps/completed/GO_GRPC_IMPLEMENTATION_GUIDE.md) | `** Ready for Implementat` | `CPU_TOPIC` | 4 | GO_GRPC_IMPLEMENTATION_GUIDE.md |
| [inference.md](../next_steps/inference.md) | `design` | `GPU_TOPIC` | 1 | inference.md |
| [turbovecquant.md](../next_steps/turbovecquant.md) | `design` | `GPU_TOPIC` | 1 | turbovecquant.md |
| [01-reports-next-steps.md](../sveltekit-frontend/next_steps/01-reports-next-steps.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 4 | Report System - Next Steps |
| [2026-06-16-production-readiness-master.md](../sveltekit-frontend/next_steps/active/2026-06-16-production-readiness-master.md) | `ACTIVE` | `GPU_TOPIC` | 4 | Production Readiness Plan — 2026-06-16 18:19:20 |

### <a id="database"></a>🗄️ Database (`DOM_PG18_DRIZZLE` | Byte: 5 | Hex: `0x12`) — 43 Docs

| Document | Status | Topic hint | Comm* | Title |
|---|---|---|:---:|---|
| [2026-05-08_agents-md-relationships-todo.md](../next_steps/active/2026-05-08_agents-md-relationships-todo.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 2 | 2026-05-08_agents-md-relationships-todo.md |
| [2026-05-08_dual-postgres-dbs-todo.md](../next_steps/active/2026-05-08_dual-postgres-dbs-todo.md) | `ACTIVE` | `CPU_TOPIC` | 2 | 2026-05-08_dual-postgres-dbs-todo.md |
| [2026-05-09_dev-test-prod-split-plan.md](../next_steps/active/2026-05-09_dev-test-prod-split-plan.md) | `ACTIVE` | `GPU_TOPIC` | 1 | Dev / Test / Prod Split + TurboQuant Routing + Drizzle Migration Safety |
| [2026-05-29_PHASE3_EXTRACT_COMPLETE.md](../next_steps/active/2026-05-29_PHASE3_EXTRACT_COMPLETE.md) | `** Extraction complete, ` | `CPU_TOPIC` | 2 | Phase 3 USES_DB Extraction — COMPLETE ✅ |
| [2026-05-29_PHASE3_NEO4J_READY.md](../next_steps/active/2026-05-29_PHASE3_NEO4J_READY.md) | `** Extraction complete, ` | `CPU_TOPIC` | 2 | Phase 3 USES_DB → Neo4j Sync — COMPLETE ✅ |
| [2026-05-30_PHASE_19_SCHEMA_BRIDGE_STRATEGY.md](../next_steps/active/2026-05-30_PHASE_19_SCHEMA_BRIDGE_STRATEGY.md) | `PLANNING (Phase 19D depe` | `GOVERNANCE_TOPIC` | 2 | Phase 19: Schema Bridge & Join Strategy |
| [2026-05-30_userid_migration_plan.md](../next_steps/active/2026-05-30_userid_migration_plan.md) | `draft — in-progress (aud` | `GOVERNANCE_TOPIC` | 2 | 2026-05-30_userid_migration_plan.md |
| [2026-06-06_drizzle-schema-audit.md](../next_steps/active/2026-06-06_drizzle-schema-audit.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 2 | Drizzle Schema Audit — 2026-06-06 |
| [2026-06-10_PHASE-3-ATLAS-3A-SYMBOL-MAP.md](../next_steps/active/2026-06-10_PHASE-3-ATLAS-3A-SYMBOL-MAP.md) | `** CRITICAL PATH (Blocks` | `GOVERNANCE_TOPIC` | 2 | Phase 3: ATLAS-3A Symbol Map Foundation |
| [2026-06-10_PHASE-3-PRIORITY-SEQUENCE.md](../next_steps/active/2026-06-10_PHASE-3-PRIORITY-SEQUENCE.md) | `** Based on audit findin` | `GOVERNANCE_TOPIC` | 2 | Phase 3: Corrected Priority Sequence |
| [2026-06-10_atlas-runner-deployment.md](../next_steps/active/2026-06-10_atlas-runner-deployment.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 2 | Atlas-Runner Deployment & Validation |
| [2026-07-21_PHASE_107_F_AUDIT_EXECUTION.md](../next_steps/active/2026-07-21_PHASE_107_F_AUDIT_EXECUTION.md) | `READY FOR EXECUTION` | `GOVERNANCE_TOPIC` | 2 | Phase 107 Phase F — Materializer Audit & Bindings |
| [2026-07-21_PHASE_107_F_COMPLETION_AUDIT.md](../next_steps/active/2026-07-21_PHASE_107_F_COMPLETION_AUDIT.md) | `IMPLEMENTATION COMPLETE ` | `GOVERNANCE_TOPIC` | 2 | Phase 107 Phase F — Completion Audit & Provenance Verification |
| [2026-07-21_python-orchestrator-wiring.md](../next_steps/active/2026-07-21_python-orchestrator-wiring.md) | `🟢 WIRED` | `CPU_TOPIC` | 2 | Python Orchestrator Wiring (Phase 4 Integration) |
| [2026-07-21_unknown-resolution-phase-108-roadmap.md](../next_steps/active/2026-07-21_unknown-resolution-phase-108-roadmap.md) | `🟢 ARCHITECTURE DEFINED,` | `GOVERNANCE_TOPIC` | 2 | Unknown Resolution Architecture & Phase 108 Roadmap |
| [2026-09-12_parent-atlas-deep-audit-workstation-fit.md](../next_steps/active/2026-09-12_parent-atlas-deep-audit-workstation-fit.md) | `✅ Real, dated, transacti` | `GOVERNANCE_TOPIC` | 21 | Parent Atlas Deep Audit — What We Have vs What's Needed (2026-09-12) |
| [DRIZZLE_SCHEMA_COLUMN_AUDIT.md](../next_steps/active/DRIZZLE_SCHEMA_COLUMN_AUDIT.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 2 | Drizzle Schema Column-Level Drift Audit |
| [DRIZZLE_SCHEMA_DRIFT_AUDIT.md](../next_steps/active/DRIZZLE_SCHEMA_DRIFT_AUDIT.md) | `✅ **COMPLETE** — Referen` | `GPU_TOPIC` | 2 | Drizzle Schema Drift — Remediation Plan |
| [SCHEMA_CONSOLIDATION_PLAN.md](../next_steps/active/SCHEMA_CONSOLIDATION_PLAN.md) | `ACTIVE` | `GPU_TOPIC` | 2 | Schema Consolidation Plan |
| [SCHEMA_FILE_OWNERSHIP.md](../next_steps/active/SCHEMA_FILE_OWNERSHIP.md) | `ACTIVE` | `GPU_TOPIC` | 2 | Schema File Ownership |
| [SCHEMA_MANIFEST.md](../next_steps/active/SCHEMA_MANIFEST.md) | `ACTIVE` | `CPU_TOPIC` | 2 | Schema Manifest |
| [database-audit-context-2026-05-19.md](../next_steps/active/database-audit-context-2026-05-19.md) | `ACTIVE` | `GPU_TOPIC` | 1 | database-audit-context-2026-05-19.md |
| [PG17_UPGRADE_AND_TRTLLM_INTEGRATION.md](../next_steps/archive/PG17_UPGRADE_AND_TRTLLM_INTEGRATION.md) | `ARCHIVE` | `GPU_TOPIC` | 2 | PG17 Upgrade — Complete |
| [GRANITE_DOCLING_258M_INTEGRATION_2026-04-05.md](../next_steps/completed/GRANITE_DOCLING_258M_INTEGRATION_2026-04-05.md) | `** Active — Phase 1 + Ph` | `GPU_TOPIC` | 2 | GRANITE_DOCLING_258M_INTEGRATION_2026-04-05.md |
| [VLM_POI_PHOTOS_WIRING.md](../next_steps/completed/VLM_POI_PHOTOS_WIRING.md) | `COMPLETE` | `GPU_TOPIC` | 2 | VLM_POI_PHOTOS_WIRING.md |
| [poi-ai-enhancement-roadmap.md](../next_steps/completed/poi-ai-enhancement-roadmap.md) | `COMPLETED` | `GPU_TOPIC` | 2 | poi-ai-enhancement-roadmap.md |
| [PRODUCTION_REMEDIATION_PLAN.md](../next_steps/completed/production-history/PRODUCTION_REMEDIATION_PLAN.md) | `COMPLETED` | `GPU_TOPIC` | 2 | PRODUCTION_REMEDIATION_PLAN.md |
| [2026-04-17_architecture-backlog.md](../next_steps/completed/session-history/2026-04-17_architecture-backlog.md) | `COMPLETE — P1-P5 ALL COM` | `CPU_TOPIC` | 2 | Architecture Backlog — 2026-04-17 |
| [2026-04-18_consolidated-todo.md](../next_steps/completed/session-history/2026-04-18_consolidated-todo.md) | `ACTIVE — Master TODO lis` | `GPU_TOPIC` | 1 | 2026-04-18_consolidated-todo.md |
| [production-ready-audit.md](../next_steps/production-ready-audit.md) | `**In Progress**` | `GPU_TOPIC` | 1 | Phase 9 — Production-Ready Audit, .gitignore Visibility, and Drizzle Reconciliation |
| [production-ready-gitignore-drizzle-audit.md](../next_steps/production-ready-gitignore-drizzle-audit.md) | `**operator checklist / n` | `GPU_TOPIC` | 2 | Phase 9 — Production-Ready Audit, `.gitignore` Visibility, and Drizzle Reconciliation |
| [03-evidence-improvements.md](../sveltekit-frontend/next_steps/03-evidence-improvements.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 2 | Evidence System - Next Steps |
| [06-database-migrations.md](../sveltekit-frontend/next_steps/06-database-migrations.md) | `ACTIVE` | `CPU_TOPIC` | 2 | 06-database-migrations.md |
| [08-detective-mode-integration.md](../sveltekit-frontend/next_steps/08-detective-mode-integration.md) | `** Enhanced detective mo` | `GPU_TOPIC` | 2 | Detective Mode Training Integration |
| [DRIZZLE_SCHEMA_MATCHING.md](../sveltekit-frontend/next_steps/DRIZZLE_SCHEMA_MATCHING.md) | `FULLY ALIGNED — Schema ↔` | `GPU_TOPIC` | 2 | DRIZZLE_SCHEMA_MATCHING.md |
| [SESSION_93r28c_COMPLETE.md](../sveltekit-frontend/next_steps/SESSION_93r28c_COMPLETE.md) | `** ✅ ALL DELIVERABLES CO` | `GPU_TOPIC` | 2 | Session 93r28c — Complete Summary |
| [ZOD_SUPERFORMS_BENEFITS.md](../sveltekit-frontend/next_steps/ZOD_SUPERFORMS_BENEFITS.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 2 | Zod + Superforms v2 — Benefits for SvelteKit 2 |
| [2026-05-05_unwired-features-wiring-plan.md](../sveltekit-frontend/next_steps/active/2026-05-05_unwired-features-wiring-plan.md) | `~~WIRE~~ → **ARCHIVED** ` | `GOVERNANCE_TOPIC` | 2 | 2026-05-05_unwired-features-wiring-plan.md |
| [2026-05-08_reconstruction-track-production-ready.md](../sveltekit-frontend/next_steps/active/2026-05-08_reconstruction-track-production-ready.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 2 | Reconstruction Track — Production-Ready Status (2026-05-08) |
| [2026-05-08_schema-consolidation-production-ready.md](../sveltekit-frontend/next_steps/active/2026-05-08_schema-consolidation-production-ready.md) | `ACTIVE · 2026-05-08` | `GPU_TOPIC` | 1 | 2026-05-08_schema-consolidation-production-ready.md |
| [2026-05-09_agents-md-incremental-pipeline.md](../sveltekit-frontend/next_steps/active/2026-05-09_agents-md-incremental-pipeline.md) | `design-only. Operator mu` | `GOVERNANCE_TOPIC` | 2 | AGENTS.md Incremental Update Pipeline — Design Doc |
| [2026-05-10_full-stack-claude-checklist.md](../sveltekit-frontend/next_steps/active/2026-05-10_full-stack-claude-checklist.md) | `ACTIVE` | `GPU_TOPIC` | 2 | Full-Stack Legal-AI Claude Code Prompt Checklist |
| [desktop.md](../sveltekit-frontend/next_steps/desktop.md) | `ACTIVE` | `CPU_TOPIC` | 2 | Desktop Migration & Autonomous Research Architecture |

### <a id="cache"></a>⚡ Cache (`DOM_VALKEY_BITFROST_LRU` | Byte: 6 | Hex: `0x27`) — 30 Docs

| Document | Status | Topic hint | Comm* | Title |
|---|---|---|:---:|---|
| [2026-05-14_184215_task-distillates-and-trt-spike.md](../next_steps/active/2026-05-14_184215_task-distillates-and-trt-spike.md) | `ACTIVE` | `GPU_TOPIC` | 21 | Task Distillates + TRT-LLM Spike Prompt |
| [2026-05-29_READY_FOR_VALIDATION_TESTING.md](../next_steps/active/2026-05-29_READY_FOR_VALIDATION_TESTING.md) | `All 5 unified utilities ` | `CPU_TOPIC` | 21 | Redis Cache Consolidation — Day 1 COMPLETE ✅ |
| [2026-05-29_REDIS_CACHE_CONSOLIDATION_INTEGRATION.md](../next_steps/active/2026-05-29_REDIS_CACHE_CONSOLIDATION_INTEGRATION.md) | `5 unified utilities impl` | `CPU_TOPIC` | 21 | Redis Cache Consolidation — Day 1 Integration Guide |
| [2026-05-30_ATLAS_JOIN_FIX_COMPLETE.md](../next_steps/active/2026-05-30_ATLAS_JOIN_FIX_COMPLETE.md) | `BLOCKER RESOLVED` | `CPU_TOPIC` | 21 | Atlas Join Fix: COMPLETE ✅ |
| [2026-05-30_CONTINUATION_LANES_GPU_GLYPHS.md](../next_steps/active/2026-05-30_CONTINUATION_LANES_GPU_GLYPHS.md) | `ACTIVE` | `GPU_TOPIC` | 21 | 2026-05-30 — Continuation: G17 Fix → Drizzle Cleanup → GPU Lanes → pg18+Redis+Bitfrost → CHR97 |
| [2026-05-30_PHASE2_REWARD_ATTRIBUTION_COMPLETE.md](../next_steps/active/2026-05-30_PHASE2_REWARD_ATTRIBUTION_COMPLETE.md) | `COMPLETE` | `CPU_TOPIC` | 21 | Phase 2: Reward Attribution - COMPLETE ✅ |
| [2026-07-07-phase3-bitmap-optimization.md](../next_steps/active/2026-07-07-phase3-bitmap-optimization.md) | `Design Ready` | `GOVERNANCE_TOPIC` | 21 | Phase 3: Redis/Valkey Bitmap Optimization for Atlas Packets |
| [2026-07-10_gsd-cache-probe-phase.md](../next_steps/active/2026-07-10_gsd-cache-probe-phase.md) | `READY_WITH_CORRECTIONS` | `GOVERNANCE_TOPIC` | 21 | GSD Phase: Prove OpenCode Context Reuse |
| [2026-07-10_phase-2-session-132-checklist.md](../next_steps/active/2026-07-10_phase-2-session-132-checklist.md) | `Phase 2 (Sessions 131-13` | `GPU_TOPIC` | 21 | Phase 2 Session 132+ Implementation Checklist |
| [END_TO_END_GAP_CHECKLIST.md](../next_steps/active/END_TO_END_GAP_CHECKLIST.md) | `ACTIVE` | `GPU_TOPIC` | 21 | End-To-End Gap Checklist |
| [LLMS.md](../next_steps/active/LLMS.md) | `ACTIVE` | `GPU_TOPIC` | 21 | AGENTS.md — `next_steps/active` |
| [RUNTIME_CACHE_PROMOTION_PLAN.md](../next_steps/active/RUNTIME_CACHE_PROMOTION_PLAN.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 21 | Runtime Cache Promotion Plan |
| [mtp_6_26.md](../next_steps/active/mtp_6_26.md) | `ACTIVE` | `GPU_TOPIC` | 21 | MTP/Speculative Decoding Architecture Concepts (June 26) |
| [CONTEXT7_COMPREHENSIVE_GUIDE.md](../next_steps/canonical/CONTEXT7_COMPREHENSIVE_GUIDE.md) | `** 🟢 Fully Operational` | `GPU_TOPIC` | 21 | CONTEXT7_COMPREHENSIVE_GUIDE.md |
| [PERFORMANCE_OPTIMIZATION_GUIDE.md](../next_steps/canonical/PERFORMANCE_OPTIMIZATION_GUIDE.md) | `CANONICAL` | `GOVERNANCE_TOPIC` | 21 | PERFORMANCE_OPTIMIZATION_GUIDE.md |
| [2026-03-13_SEMANTIC_CACHE_AND_EXTENSIONS.md](../next_steps/completed/2026-03-13_SEMANTIC_CACHE_AND_EXTENSIONS.md) | `COMPLETED` | `GPU_TOPIC` | 21 | Semantic Cache + PostgreSQL Extensions — Complete |
| [CITATION_COLLECTIONS_NEXT_STEPS.md](../next_steps/completed/CITATION_COLLECTIONS_NEXT_STEPS.md) | `COMPLETED` | `CPU_TOPIC` | 21 | CITATION_COLLECTIONS_NEXT_STEPS.md |
| [PERFORMANCE_TEST_PLAN.md](../next_steps/completed/PERFORMANCE_TEST_PLAN.md) | `SUPERSEDED — cache syste` | `CPU_TOPIC` | 21 | PERFORMANCE_TEST_PLAN.md |
| [OPTIMIZATION_COMPARISON.md](../next_steps/completed/production-history/OPTIMIZATION_COMPARISON.md) | `COMPLETED` | `CPU_TOPIC` | 21 | Production Deployment: Basic vs Optimized Comparison |
| [PRODUCTION_READINESS_ROADMAP.md](../next_steps/completed/production-history/PRODUCTION_READINESS_ROADMAP.md) | `** 2 of 7 critical items` | `GPU_TOPIC` | 21 | PRODUCTION_READINESS_ROADMAP.md |
| [GEMMA4_INTEGRATION_PLAN_2026-04-03.md](../next_steps/completed/vlm-history/GEMMA4_INTEGRATION_PLAN_2026-04-03.md) | `COMPLETED` | `GPU_TOPIC` | 21 | GEMMA4_INTEGRATION_PLAN_2026-04-03.md |
| [00-OVERVIEW.md](../sveltekit-frontend/next_steps/00-OVERVIEW.md) | `** svelte-check 0 errors` | `GOVERNANCE_TOPIC` | 21 | Next Steps - Complete Overview |
| [05-infrastructure.md](../sveltekit-frontend/next_steps/05-infrastructure.md) | `ACTIVE` | `CPU_TOPIC` | 21 | Infrastructure & Performance - Next Steps |
| [2026-05-05_inverted-features-build-order.md](../sveltekit-frontend/next_steps/active/2026-05-05_inverted-features-build-order.md) | `ACTIVE` | `GPU_TOPIC` | 21 | INVERTED Features — Build Order by Dependency |
| [2026-05-09_karpathy-chr97-wiring.md](../sveltekit-frontend/next_steps/active/2026-05-09_karpathy-chr97-wiring.md) | `design-only, not impleme` | `GPU_TOPIC` | 21 | Karpathy KB ↔ NES/CHR97 Cartridge Wiring — Design Doc |
| [2026-05-10_rotorquant-bitnet-cache-hierarchy.md](../sveltekit-frontend/next_steps/active/2026-05-10_rotorquant-bitnet-cache-hierarchy.md) | `research / planning. **N` | `GPU_TOPIC` | 21 | RotorQuant + bitnet.c — Integration Notes + Cache Hierarchy Design |
| [2026-05-14_todo-pt3-ace-cache-indexing-postgres-qdrant.md](../sveltekit-frontend/next_steps/active/2026-05-14_todo-pt3-ace-cache-indexing-postgres-qdrant.md) | `ACTIVE` | `CPU_TOPIC` | 21 | TODO Pt3 - ACE Cache Indexing + Postgres/Qdrant |
| [cache-context.md](../sveltekit-frontend/next_steps/active/2026-06-16-directory-context/cache-context.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 21 | Directory Context: `src/lib/server/cache` — 2026-06-16 18:19:20 |
| [gpu_karpathy_ace_context_cache_architecture.md](../sveltekit-frontend/next_steps/plans/gpu_karpathy_ace_context_cache_architecture.md) | `** design note / impleme` | `GPU_TOPIC` | 21 | CUDA Graph + Redis/BitFrost Cache + 4D Topology Retrieval Architecture |
| [parent_atlas_karpathy_engram_codex_tasks.md](../sveltekit-frontend/next_steps/plans/parent_atlas_karpathy_engram_codex_tasks.md) | `PLANNING` | `GPU_TOPIC` | 21 | parent_atlas_karpathy_engram_codex_tasks.md |

### <a id="agent"></a>🤖 Agent (`DOM_AGENT_OAK_RLM_DSPY` | Byte: 7 | Hex: `0x24`) — 20 Docs

| Document | Status | Topic hint | Comm* | Title |
|---|---|---|:---:|---|
| [PIPELINE_GAPS_AND_TODO.md](../next_steps/active/PIPELINE_GAPS_AND_TODO.md) | `ACTIVE — P0 all closed, ` | `GPU_TOPIC` | 1 | Pipeline Gaps & Consolidated TODO — April 19, 2026 |
| [COMPREHENSIVE_ARCHIVE_REVIEW.md](../next_steps/archive/COMPREHENSIVE_ARCHIVE_REVIEW.md) | `ARCHIVE` | `CPU_TOPIC` | 10 | COMPREHENSIVE_ARCHIVE_REVIEW.md |
| [LANGFUSE_INTEGRATION_GUIDE.md](../next_steps/canonical/LANGFUSE_INTEGRATION_GUIDE.md) | `✅ **Production Ready**` | `CPU_TOPIC` | 10 | LANGFUSE_INTEGRATION_GUIDE.md |
| [COLAB_MCP_SETUP.md](../next_steps/completed/COLAB_MCP_SETUP.md) | `COMPLETED` | `GPU_TOPIC` | 10 | Colab MCP Server Setup — Remote GPU Training from CLI |
| [09-agent-investigate-endpoint.md](../sveltekit-frontend/next_steps/09-agent-investigate-endpoint.md) | `ACTIVE` | `GPU_TOPIC` | 10 | Agent Investigation Endpoint — Enhanced Detective Mode in Production |
| [2026-05-03-directory-consolidation.md](../sveltekit-frontend/next_steps/active/2026-05-03-directory-consolidation.md) | `ACTIVE` | `GPU_TOPIC` | 10 | Directory Consolidation Plan — 2026-05-03 20:44:51 |
| [2026-05-03-production-blockers.md](../sveltekit-frontend/next_steps/active/2026-05-03-production-blockers.md) | `ACTIVE` | `CPU_TOPIC` | 10 | Production Blockers Plan — 2026-05-03 20:44:51 |
| [2026-05-03-production-readiness-master.md](../sveltekit-frontend/next_steps/active/2026-05-03-production-readiness-master.md) | `ACTIVE` | `GPU_TOPIC` | 10 | 2026-05-03-production-readiness-master.md |
| [2026-05-08_agentic-error-fixing-workflow.md](../sveltekit-frontend/next_steps/active/2026-05-08_agentic-error-fixing-workflow.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 10 | Agentic Error Fixing Workflow - 2026-05-08 |
| [2026-05-10_langgraph-background-research-worker.md](../sveltekit-frontend/next_steps/active/2026-05-10_langgraph-background-research-worker.md) | `deferred — design doc on` | `GPU_TOPIC` | 1 | 2026-05-10_langgraph-background-research-worker.md |
| [2026-06-16-directory-consolidation.md](../sveltekit-frontend/next_steps/active/2026-06-16-directory-consolidation.md) | `ACTIVE` | `CPU_TOPIC` | 10 | Directory Consolidation Plan — 2026-06-16 18:19:20 |
| [ace-context.md](../sveltekit-frontend/next_steps/active/2026-06-16-directory-context/ace-context.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 10 | Directory Context: `src/lib/server/ace` — 2026-06-16 18:19:20 |
| [ai-api-context.md](../sveltekit-frontend/next_steps/active/2026-06-16-directory-context/ai-api-context.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 10 | Directory Context: `src/routes/api/ai` — 2026-06-16 18:19:20 |
| [ai-context.md](../sveltekit-frontend/next_steps/active/2026-06-16-directory-context/ai-context.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 10 | Directory Context: `src/lib/server/ai` — 2026-06-16 18:19:20 |
| [services-context.md](../sveltekit-frontend/next_steps/active/2026-06-16-directory-context/services-context.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 10 | Directory Context: `src/lib/services` — 2026-06-16 18:19:20 |
| [karpathy-gpu-recommendations.md](../sveltekit-frontend/next_steps/active/karpathy-gpu-recommendations.md) | `ACTIVE` | `GPU_TOPIC` | 10 | Karpathy GPU Authority Blend |
| [hermes_agents_ace_deep_research_report.md](../sveltekit-frontend/next_steps/plans/hermes_agents_ace_deep_research_report.md) | `PLANNING` | `GPU_TOPIC` | 10 | Hermes Agents for ACE Deep Research, Case Building, GraphRAG, and Rapid Prototyping |
| [langextract_ace_kag_agentic_workflow_plan.md](../sveltekit-frontend/next_steps/plans/langextract_ace_kag_agentic_workflow_plan.md) | `PLANNING` | `GPU_TOPIC` | 10 | ACE Agentic Workflow + LangExtract + KAG/DAG Integration Plan |
| [mau5 (1).md](../sveltekit-frontend/next_steps/plans/mau5 (1).md) | `PLANNING` | `CPU_TOPIC` | 10 | mau5.md — Master Agents CRM + Agentic Workflow Atlas |
| [useranalytics.md](../sveltekit-frontend/next_steps/plans/useranalytics.md) | `PLANNING` | `CPU_TOPIC` | 10 | useranalytics.md — UI, Agent Workflow, and Daily Atlas TODO |

### <a id="graph"></a>🕸️ Graph (`DOM_GRAPH_CUGRAPH_PAGERANK` | Byte: 8 | Hex: `0x1A`) — 29 Docs

| Document | Status | Topic hint | Comm* | Title |
|---|---|---|:---:|---|
| [SESSION-97-PHASE-B-EXPORT-HARDENING-PLAN.md](../next_steps/SESSION-97-PHASE-B-EXPORT-HARDENING-PLAN.md) | `Phase B in progress (6.5` | `GPU_TOPIC` | 21 | Session 97: Phase B Completion → Export/Replication Hardening Plan |
| [2026-05-08_mcp-trace-hardening-session.md](../next_steps/active/2026-05-08_mcp-trace-hardening-session.md) | `ACTIVE` | `GPU_TOPIC` | 2 | MCP TRACE Hardening + Topology Ontology Session — 2026-05-08 |
| [2026-05-09_gemma4-mcp-synthesis-loop.md](../next_steps/active/2026-05-09_gemma4-mcp-synthesis-loop.md) | `design (no code yet — sc` | `GPU_TOPIC` | 2 | 2026-05-09_gemma4-mcp-synthesis-loop.md |
| [2026-05-14_183928_trt-llm-hypergraph-routing.md](../next_steps/active/2026-05-14_183928_trt-llm-hypergraph-routing.md) | `ACTIVE` | `GPU_TOPIC` | 2 | TRT-LLM + Hypergraph Routing Prompt |
| [2026-05-14_gpu-karpathy-topology-60-100-plan.md](../next_steps/active/2026-05-14_gpu-karpathy-topology-60-100-plan.md) | `about 60%.` | `GPU_TOPIC` | 2 | GPU Karpathy Topology Plan (60% → 100%) |
| [2026-05-14_wiki-loop-end-to-end.md](../next_steps/active/2026-05-14_wiki-loop-end-to-end.md) | `ACTIVE` | `GPU_TOPIC` | 2 | Wiki Loop End-to-End |
| [2026-05-29_implementation-roadmap.md](../next_steps/active/2026-05-29_implementation-roadmap.md) | `ACTIVE` | `GPU_TOPIC` | 2 | Implementation Roadmap Summary — May 29, 2026 |
| [2026-05-30_PHASE_19_COMPLETE_SUMMARY.md](../next_steps/active/2026-05-30_PHASE_19_COMPLETE_SUMMARY.md) | `✅ **PRODUCTION READY** (` | `GPU_TOPIC` | 2 | Phase 19: Atlas Card Lifecycle & Knowledge Consolidation — COMPLETE |
| [2026-06-07_nes-packet-pipeline-roadmap.md](../next_steps/active/2026-06-07_nes-packet-pipeline-roadmap.md) | `Phases 2–9 complete ✅ — ` | `GPU_TOPIC` | 2 | NES/CHROM Packet Pipeline — Active Roadmap |
| [2026-06-10_ATLAS-2.0-PHASE-SUMMARY.md](../next_steps/active/2026-06-10_ATLAS-2.0-PHASE-SUMMARY.md) | `** Phase 2A LOCKED (mate` | `GPU_TOPIC` | 2 | ATLAS-2.0 Phase Summary: Materialization → Neo4j → Communities |
| [2026-06-10_GATE-2-DIAGNOSTIC.md](../next_steps/active/2026-06-10_GATE-2-DIAGNOSTIC.md) | `ACTIVE` | `GPU_TOPIC` | 2 | Gate 2 Failure Diagnostic |
| [2026-06-10_PHASE-3-AUDIT-CORRECTION.md](../next_steps/active/2026-06-10_PHASE-3-AUDIT-CORRECTION.md) | `ACTIVE` | `GPU_TOPIC` | 2 | Phase 3: Audit Correction & Reframed Priorities |
| [2026-06-10_atlas-phase-2b-neo4j-communities.md](../next_steps/active/2026-06-10_atlas-phase-2b-neo4j-communities.md) | `ACTIVE` | `GPU_TOPIC` | 2 | ATLAS-2.0 Phase 2B: Neo4j Sync + Community Detection + Manifold4[3] |
| [2026-09-20_openspec-tasks-md-audit.md](../next_steps/active/2026-09-20_openspec-tasks-md-audit.md) | `ACTIVE` | `GPU_TOPIC` | 1 | OpenSpec tasks.md Audit — 2026-09-21T00:06:34.718Z |
| [FEATURE_ROADMAPS.md](../next_steps/active/FEATURE_ROADMAPS.md) | `ACTIVE — All features de` | `GPU_TOPIC` | 2 | Feature Roadmaps — Consolidated |
| [GPU_TOPOLOGY_ACCELERATION_PLAN.md](../next_steps/active/GPU_TOPOLOGY_ACCELERATION_PLAN.md) | `ACTIVE` | `GPU_TOPIC` | 2 | GPU Topology Acceleration Plan |
| [KAG_finalization_workflow.md](../next_steps/active/KAG_finalization_workflow.md) | `ACTIVE` | `GPU_TOPIC` | 2 | KAG_finalization_workflow.md |
| [hypergraph-todo-prompt.md](../next_steps/active/hypergraph_todos/20260514_180339/hypergraph-todo-prompt.md) | `ACTIVE` | `GPU_TOPIC` | 2 | Hypergraph Todo Prompt |
| [california_ingestion_pipeline.md](../next_steps/california_ingestion_pipeline.md) | `ACTIVE` | `GPU_TOPIC` | 1 | california_ingestion_pipeline.md |
| [COUCHDB_NEO4J_GPU_READINESS_AUDIT_2026-03-31.md](../next_steps/completed/COUCHDB_NEO4J_GPU_READINESS_AUDIT_2026-03-31.md) | `SUPERSEDED — CouchDB/Neo` | `GPU_TOPIC` | 2 | COUCHDB_NEO4J_GPU_READINESS_AUDIT_2026-03-31.md |
| [TS_NAPI_CPP_AST_GRAPH_AUDIT_CHECKLIST_2026-03-31.md](../next_steps/completed/TS_NAPI_CPP_AST_GRAPH_AUDIT_CHECKLIST_2026-03-31.md) | `COMPLETED` | `GPU_TOPIC` | 1 | TS_NAPI_CPP_AST_GRAPH_AUDIT_CHECKLIST_2026-03-31.md |
| [USER_ANALYTICS_NEO4J_VECTOR_CHAT.md](../next_steps/completed/USER_ANALYTICS_NEO4J_VECTOR_CHAT.md) | `CODE COMPLETE — NEEDS NE` | `GPU_TOPIC` | 2 | User Analytics — Neo4j + embeddinggemma + Qdrant → ACE Contextual Chat |
| [PRODUCTION_ENHANCEMENT_ROADMAP_2026-03-31.md](../next_steps/completed/production-history/PRODUCTION_ENHANCEMENT_ROADMAP_2026-03-31.md) | `SUPERSEDED — core stabil` | `GPU_TOPIC` | 2 | PRODUCTION_ENHANCEMENT_ROADMAP_2026-03-31.md |
| [15-neo4j-gds-karpathy-gpu-architecture.md](../sveltekit-frontend/next_steps/15-neo4j-gds-karpathy-gpu-architecture.md) | `** Deep review — gaps id` | `GPU_TOPIC` | 2 | Next Steps: Neo4j GDS + APOC + Karpathy GPU Indexing Architecture |
| [2026-05-07_graph-glyph-ace-synthesis.md](../sveltekit-frontend/next_steps/active/2026-05-07_graph-glyph-ace-synthesis.md) | `ACTIVE — ACE multi-lane ` | `GPU_TOPIC` | 2 | 2026-05-07_graph-glyph-ace-synthesis.md |
| [2026-05-08_knowledge-graph-retrieval-feature-tracker.md](../sveltekit-frontend/next_steps/active/2026-05-08_knowledge-graph-retrieval-feature-tracker.md) | `ACTIVE` | `GPU_TOPIC` | 2 | Feature Tracker: Knowledge Graph Retrieval & Topological Sort (N8-N10) |
| [graph-context.md](../sveltekit-frontend/next_steps/active/2026-06-16-directory-context/graph-context.md) | `ACTIVE` | `GPU_TOPIC` | 2 | Directory Context: `src/lib/server/graph` — 2026-06-16 18:19:20 |
| [2026-07-06-nes-chrom-okf-acp-integration.md](../sveltekit-frontend/next_steps/active/2026-07-06-nes-chrom-okf-acp-integration.md) | `DESIGN_READY + Existing ` | `GPU_TOPIC` | 2 | NES-CHROM → OKF Decompilation (ACP/A2A/LangGraph Integration) |
| [2026-05-06-15-analysis.md](../sveltekit-frontend/next_steps/plans/2026-05-06-15-analysis.md) | `PLANNING` | `GPU_TOPIC` | 2 | Startup Analysis Plan — 2026-05-06T15:20 (updated post-Docker) |

### <a id="ml"></a>🧠 ML/GPU (`DOM_ML_ATEN_TENSORRT_GEMM` | Byte: 9 | Hex: `0x14`) — 47 Docs

| Document | Status | Topic hint | Comm* | Title |
|---|---|---|:---:|---|
| [2026-10-31_vlm_2d_to_3d_comfyui_handoff.md](../docs/next_steps/2026-10-31_vlm_2d_to_3d_comfyui_handoff.md) | `** Canonical & Audited` | `GPU_TOPIC` | 1 | Handoff: Ornith 1.5 VLM, 2D-to-3D Reconstruction, ComfyUI Flow & 384 Audit |
| [agentic-error-fix-21-10-36-fast.md](../next_steps/active/2026-05-03/agentic-error-fix-21-10-36-fast.md) | `unknown` | `GPU_TOPIC` | 1 | Agentic Error Fix (fast) |
| [2026-05-08_3dgs-forensic-roadmap.md](../next_steps/active/2026-05-08_3dgs-forensic-roadmap.md) | `ACTIVE` | `GPU_TOPIC` | 1 | 2026-05-08_3dgs-forensic-roadmap.md |
| [2026-05-09_gpu-routing-autoencoder-todo.md](../next_steps/active/2026-05-09_gpu-routing-autoencoder-todo.md) | `ACTIVE` | `GPU_TOPIC` | 1 | GPU Routing + Autoencoder + SeaweedFS — 2026-05-09 |
| [2026-05-31_CUDA_PRIMITIVES_IMPROVEMENTS.md](../next_steps/active/2026-05-31_CUDA_PRIMITIVES_IMPROVEMENTS.md) | `ACTIVE` | `GPU_TOPIC` | 1 | CUDA Primitives — Improvement Opportunities |
| [2026-05-31_GPU_PHASE_GAP_ALIGNMENT.md](../next_steps/active/2026-05-31_GPU_PHASE_GAP_ALIGNMENT.md) | `ACTIVE` | `GPU_TOPIC` | 1 | GPU Phase Gap Alignment — 2026-05-31 03:00 PST |
| [2026-05-31_NAPI_RS_RUST_BRIDGE_OPTIMIZATIONS.md](../next_steps/active/2026-05-31_NAPI_RS_RUST_BRIDGE_OPTIMIZATIONS.md) | `ACTIVE` | `GPU_TOPIC` | 1 | N-API.rs & Rust Native Bridge Optimization Plan |
| [2026-05-31_PHASE_COMPLETION_ROADMAP.md](../next_steps/active/2026-05-31_PHASE_COMPLETION_ROADMAP.md) | `ACTIVE` | `GPU_TOPIC` | 1 | Phase Completion Roadmap — Updated 2026-05-31 |
| [2026-05-31_phase-h-gpu-cmake-todo.md](../next_steps/active/2026-05-31_phase-h-gpu-cmake-todo.md) | `ACTIVE` | `GPU_TOPIC` | 1 | Phase H GPU/CMake Integration — Todo (2026-05-31) |
| [2026-09-14_gpu-mini-fabric-cutile-level3-and-tests.md](../next_steps/active/2026-09-14_gpu-mini-fabric-cutile-level3-and-tests.md) | `CUTILE-ACE-01 LEVEL 3 is` | `GPU_TOPIC` | 21 | GPU Mini-Fabric: CUTILE-ACE-01 LEVEL 3 + test coverage — 2026-09-14 |
| [ARCHITECTURE_IMPLEMENTATION_BOARD.md](../next_steps/active/ARCHITECTURE_IMPLEMENTATION_BOARD.md) | `ACTIVE` | `GPU_TOPIC` | 1 | Architecture Implementation Board |
| [AUDIO_KNOWLEDGE_PIPELINE.md](../next_steps/active/AUDIO_KNOWLEDGE_PIPELINE.md) | `MOSTLY COMPLETE — Route+` | `GPU_TOPIC` | 1 | Audio-to-Knowledge Pipeline — Consolidated Roadmap |
| [CODEBASE_MAINTENANCE.md](../next_steps/active/CODEBASE_MAINTENANCE.md) | `ACTIVE — Tier 1-3 consol` | `GPU_TOPIC` | 1 | Codebase Maintenance — Consolidated |
| [GPU_MODEL_VLM_DEPLOYMENT.md](../next_steps/active/GPU_MODEL_VLM_DEPLOYMENT.md) | `ACTIVE` | `GPU_TOPIC` | 1 | GPU_MODEL_VLM_DEPLOYMENT.md |
| [GPU_TOPOLOGY_ACCELERATION_READINESS.md](../next_steps/active/GPU_TOPOLOGY_ACCELERATION_READINESS.md) | `READY_WITH_CORRECTIONS` | `GPU_TOPIC` | 1 | GPU Topology Acceleration Readiness |
| [PARENT_ATLAS_WORKSTATION_PHASE133_134.md](../next_steps/active/PARENT_ATLAS_WORKSTATION_PHASE133_134.md) | `ACTIVE` | `GPU_TOPIC` | 1 | Parent Atlas Workstation Phase 133-134 |
| [TENSORRT_VLM_PIPELINE.md](../next_steps/archive/TENSORRT_VLM_PIPELINE.md) | `ARCHIVE` | `GPU_TOPIC` | 1 | TENSORRT_VLM_PIPELINE.md |
| [WEBGPU_MEMORY_PALACE_ANALYSIS.md](../next_steps/archive/WEBGPU_MEMORY_PALACE_ANALYSIS.md) | `Active memory palace use` | `GPU_TOPIC` | 1 | WebGPU vs WebGL for Memory Palace — Analysis |
| [2026-03-15_GPU_UPGRADE_COMPARISON.md](../next_steps/completed/2026-03-15_GPU_UPGRADE_COMPARISON.md) | `COMPLETED` | `GPU_TOPIC` | 1 | 2026-03-15_GPU_UPGRADE_COMPARISON.md |
| [2026-04-06_pipeline-audit-and-vlm-roadmap.md](../next_steps/completed/2026-04-06_pipeline-audit-and-vlm-roadmap.md) | `COMPLETED` | `GPU_TOPIC` | 1 | 2026-04-06_pipeline-audit-and-vlm-roadmap.md |
| [2026-04-06_whisper-multilingual-gpu-roadmap.md](../next_steps/completed/2026-04-06_whisper-multilingual-gpu-roadmap.md) | `Active` | `GPU_TOPIC` | 1 | 2026-04-06_whisper-multilingual-gpu-roadmap.md |
| [DEEP_REVIEW_AUDIT_2026-04-01.md](../next_steps/completed/DEEP_REVIEW_AUDIT_2026-04-01.md) | `SUPERSEDED — disk cleanu` | `GPU_TOPIC` | 1 | DEEP_REVIEW_AUDIT_2026-04-01.md |
| [SERVICE_CONSOLIDATION_PLAN.md](../next_steps/completed/SERVICE_CONSOLIDATION_PLAN.md) | `Ready for Review` | `GPU_TOPIC` | 1 | SERVICE_CONSOLIDATION_PLAN.md |
| [TENSORRT_ENV_AND_ARCHIVED_SERVICES.md](../next_steps/completed/TENSORRT_ENV_AND_ARCHIVED_SERVICES.md) | `COMPLETED` | `GPU_TOPIC` | 1 | TENSORRT_ENV_AND_ARCHIVED_SERVICES.md |
| [TRT_DIRECTORY_CONSOLIDATION.md](../next_steps/completed/TRT_DIRECTORY_CONSOLIDATION.md) | `PRE-ARCHIVE ANALYSIS` | `GPU_TOPIC` | 1 | TensorRT Directory Consolidation — Deep Review |
| [TS_NAPI_CPP_CROSS_LANGUAGE_CALL_MAP_2026-03-31.md](../next_steps/completed/TS_NAPI_CPP_CROSS_LANGUAGE_CALL_MAP_2026-03-31.md) | `COMPLETED` | `GPU_TOPIC` | 1 | TS_NAPI_CPP_CROSS_LANGUAGE_CALL_MAP_2026-03-31.md |
| [UNSLOTH_VLM_CHR97_NEXT_STEPS_2026-04-02.md](../next_steps/completed/UNSLOTH_VLM_CHR97_NEXT_STEPS_2026-04-02.md) | `COMPLETED` | `GPU_TOPIC` | 1 | UNSLOTH_VLM_CHR97_NEXT_STEPS_2026-04-02.md |
| [WSL2_TRTLLM_READINESS_CHECKLIST_2026-03-31.md](../next_steps/completed/WSL2_TRTLLM_READINESS_CHECKLIST_2026-03-31.md) | `COMPLETED` | `GPU_TOPIC` | 1 | WSL2_TRTLLM_READINESS_CHECKLIST_2026-03-31.md |
| [gemma4-audio-capabilities.md](../next_steps/completed/gemma4-audio-capabilities.md) | `RESEARCHED ✅ — Research ` | `GPU_TOPIC` | 1 | gemma4-audio-capabilities.md |
| [RTX-8GB-OPTIMIZATION-GUIDE.md](../next_steps/completed/production-history/RTX-8GB-OPTIMIZATION-GUIDE.md) | `COMPLETED` | `GPU_TOPIC` | 1 | RTX-8GB-OPTIMIZATION-GUIDE.md |
| [2026-04-06_consolidated-todo.md](../next_steps/completed/session-history/2026-04-06_consolidated-todo.md) | `SUPERSEDED — session-sco` | `GPU_TOPIC` | 1 | 2026-04-06_consolidated-todo.md |
| [2026-04-06_deep-review-pipeline-gaps-roadmap.md](../next_steps/completed/session-history/2026-04-06_deep-review-pipeline-gaps-roadmap.md) | `Active — ranked by impac` | `GPU_TOPIC` | 1 | 2026-04-06_deep-review-pipeline-gaps-roadmap.md |
| [2026-04-06_next-steps-triage.md](../next_steps/completed/session-history/2026-04-06_next-steps-triage.md) | `SUPERSEDED — replaced by` | `GPU_TOPIC` | 1 | 2026-04-06_next-steps-triage.md |
| [2026-04-19_PIPELINE_STATUS_AND_GAPS.md](../next_steps/completed/session-history/2026-04-19_PIPELINE_STATUS_AND_GAPS.md) | `COMPLETED` | `GPU_TOPIC` | 1 | 2026-04-19_PIPELINE_STATUS_AND_GAPS.md |
| [2026-03-15_TRITON_VLM_FULL_PIPELINE.md](../next_steps/completed/vlm-history/2026-03-15_TRITON_VLM_FULL_PIPELINE.md) | `SUPERSEDED — Docker imag` | `GPU_TOPIC` | 1 | 2026-03-15_TRITON_VLM_FULL_PIPELINE.md |
| [2026-04-07_VLM_TRTLLM_DEPLOYMENT_PLAN.md](../next_steps/completed/vlm-history/2026-04-07_VLM_TRTLLM_DEPLOYMENT_PLAN.md) | `UNBLOCKED — upstream PEF` | `GPU_TOPIC` | 1 | 2026-04-07_VLM_TRTLLM_DEPLOYMENT_PLAN.md |
| [GEMMA3_VLM_IMPLEMENTATION_GUIDE.md](../next_steps/completed/vlm-history/GEMMA3_VLM_IMPLEMENTATION_GUIDE.md) | `🟢 READY FOR DEPLOYMENT` | `GPU_TOPIC` | 1 | GEMMA3_VLM_IMPLEMENTATION_GUIDE.md |
| [GEMMA4_VLM_MULTIMODAL_TRAINING_PLAN_2026-04-05.md](../next_steps/completed/vlm-history/GEMMA4_VLM_MULTIMODAL_TRAINING_PLAN_2026-04-05.md) | `** Active` | `GPU_TOPIC` | 1 | GEMMA4_VLM_MULTIMODAL_TRAINING_PLAN_2026-04-05.md |
| [MULTIMODAL_IMPLEMENTATION_ROADMAP.md](../next_steps/completed/vlm-history/MULTIMODAL_IMPLEMENTATION_ROADMAP.md) | `PARTIALLY SUPERSEDED (re` | `GPU_TOPIC` | 1 | Multi-Modal Implementation Roadmap: Existing → Production |
| [production_wheels.md](../next_steps/production/production_wheels.md) | `ACTIVE` | `GPU_TOPIC` | 1 | production_wheels.md |
| [07-ml-training.md](../sveltekit-frontend/next_steps/07-ml-training.md) | `ACTIVE` | `GPU_TOPIC` | 1 | ML Training & Model Deployment - Next Steps |
| [13-dead-code-rewrite-candidates.md](../sveltekit-frontend/next_steps/13-dead-code-rewrite-candidates.md) | `** Refreshed against liv` | `GPU_TOPIC` | 1 | 13-dead-code-rewrite-candidates.md |
| [14-vlm-deferred-reference.md](../sveltekit-frontend/next_steps/14-vlm-deferred-reference.md) | `** Deferred on purpose` | `GPU_TOPIC` | 1 | 14-vlm-deferred-reference.md |
| [2026-05-08_master-pipeline-todo.md](../sveltekit-frontend/next_steps/active/2026-05-08_master-pipeline-todo.md) | `ACTIVE` | `GPU_TOPIC` | 1 | 2026-05-08_master-pipeline-todo.md |
| [2026-05-14_todo-pt2-workspace-startup-and-gpu-indexing.md](../sveltekit-frontend/next_steps/active/2026-05-14_todo-pt2-workspace-startup-and-gpu-indexing.md) | `ACTIVE` | `GPU_TOPIC` | 1 | TODO Pt2 - Workspace Startup + GPU Indexing |
| [ace_startup_cuda_bridge_docs (1).md](../sveltekit-frontend/next_steps/plans/ace_startup_cuda_bridge_docs (1).md) | `** Verified Operational` | `GPU_TOPIC` | 1 | ACE Startup Infrastructure & CUDA Bridge Wiring |
| [ace_startup_cuda_bridge_docs.md](../sveltekit-frontend/next_steps/plans/ace_startup_cuda_bridge_docs.md) | `** Verified Operational` | `GPU_TOPIC` | 1 | ACE Startup Infrastructure & CUDA Bridge Wiring |

### <a id="general"></a>📄 General (`DOM_GENERAL_FALLBACK` | Byte: 10 | Hex: `0x0F`) — 1 Docs

| Document | Status | Topic hint | Comm* | Title |
|---|---|---|:---:|---|
| [10_3_26.md](../next_steps/10_3_26.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 10 | 10_3_26.md |

### <a id="compiler"></a>⚙️ Compiler (`DOM_COMPILER_AST_TOOLING` | Byte: 11 | Hex: `0x17`) — 1 Docs

| Document | Status | Topic hint | Comm* | Title |
|---|---|---|:---:|---|
| [2026-04-02_EVIDENCE_UPLOAD_VLM_NOTEBOOKS_TODO.md](../next_steps/completed/2026-04-02_EVIDENCE_UPLOAD_VLM_NOTEBOOKS_TODO.md) | `COMPLETED` | `GPU_TOPIC` | 10 | 2026-04-02_EVIDENCE_UPLOAD_VLM_NOTEBOOKS_TODO.md |

### <a id="devops"></a>🚀 DevOps (`DOM_DEVOPS_INFRA_RUNTIME` | Byte: 12 | Hex: `0x28`) — 19 Docs

| Document | Status | Topic hint | Comm* | Title |
|---|---|---|:---:|---|
| [2026-06-10_atlas-runner-deployment-OLD.md](../next_steps/active/2026-06-10_atlas-runner-deployment-OLD.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 10 | Atlas-Runner Deployment & Security Setup |
| [2026-06-10_session-summary.md](../next_steps/active/2026-06-10_session-summary.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 10 | Session Summary: Packet Materialization Alignment |
| [2026-07-17_atlas-runtime-registry.md](../next_steps/active/2026-07-17_atlas-runtime-registry.md) | `active roadmap note` | `GOVERNANCE_TOPIC` | 10 | Atlas Runtime Registry |
| [2026-10-29_dev-eval-vs-canonical-guardrail.md](../next_steps/active/2026-10-29_dev-eval-vs-canonical-guardrail.md) | `DRAFT` | `GPU_TOPIC` | 10 | Dev/Eval vs Canonical Hardening Guardrail |
| [todo-2026-05-18.md](../next_steps/active/todo-2026-05-18.md) | `Active planning — 4 infr` | `GPU_TOPIC` | 10 | todo-2026-05-18.md |
| [todo-2026-05-19.md](../next_steps/active/todo-2026-05-19.md) | `Active planning — infras` | `GPU_TOPIC` | 10 | todo-2026-05-19.md |
| [todo-5-19.md](../next_steps/active/todo-5-19.md) | `Active planning — 4 infr` | `GPU_TOPIC` | 10 | todo-5-19.md |
| [PRODUCTION_DEPLOYMENT.md](../next_steps/canonical/PRODUCTION_DEPLOYMENT.md) | `CANONICAL` | `GOVERNANCE_TOPIC` | 10 | PRODUCTION_DEPLOYMENT.md |
| [QUICK_START_PRODUCTION.md](../next_steps/canonical/QUICK_START_PRODUCTION.md) | `✅ Verified responding` | `GOVERNANCE_TOPIC` | 10 | QUICK_START_PRODUCTION.md |
| [README.md](../next_steps/canonical/README.md) | `CANONICAL` | `GOVERNANCE_TOPIC` | 1 | README.md |
| [PHASE0_CONFIG_AUDIT.md](../next_steps/completed/PHASE0_CONFIG_AUDIT.md) | `** Complete` | `GPU_TOPIC` | 1 | PHASE0_CONFIG_AUDIT.md |
| [TRT_ENGINE_BUILD_STEPS.md](../next_steps/completed/TRT_ENGINE_BUILD_STEPS.md) | `SUPERSEDED — engines nev` | `GPU_TOPIC` | 1 | TRT-LLM INT4 Engine Build — Step-by-Step Plan |
| [PRODUCTION_OPTIMIZATIONS_COMPLETE.md](../next_steps/completed/production-history/PRODUCTION_OPTIMIZATIONS_COMPLETE.md) | `** All optimizations ver` | `GPU_TOPIC` | 10 | Production Optimizations — Complete Reference Guide |
| [RUNTIME_PROOF_HANDOFF_2026-03-31.md](../next_steps/completed/production-history/RUNTIME_PROOF_HANDOFF_2026-03-31.md) | `SUPERSEDED — runtime pro` | `GPU_TOPIC` | 10 | RUNTIME_PROOF_HANDOFF_2026-03-31.md |
| [SESSION_TODO_2026-04-03.md](../next_steps/completed/session-history/SESSION_TODO_2026-04-03.md) | `SUPERSEDED — session-sco` | `GPU_TOPIC` | 1 | SESSION_TODO_2026-04-03.md |
| [2026-03-15_TRTLLM_EXECUTION_PIPELINE.md](../next_steps/completed/vlm-history/2026-03-15_TRTLLM_EXECUTION_PIPELINE.md) | `SUPERSEDED — Docker imag` | `GPU_TOPIC` | 10 | TRT-LLM Triton Inference — Execution Pipeline |
| [merged-gguf-opencode-validation-checklist.md](../next_steps/merged-gguf-opencode-validation-checklist.md) | `ACTIVE` | `GPU_TOPIC` | 21 | merged-gguf-opencode-validation-checklist.md |
| [10-trtllm-triton-deployment.md](../sveltekit-frontend/next_steps/10-trtllm-triton-deployment.md) | `READY TO EXECUTE` | `GPU_TOPIC` | 1 | 10-trtllm-triton-deployment.md |
| [TODO_TRTLLM_TRITON.md](../sveltekit-frontend/next_steps/TODO_TRTLLM_TRITON.md) | `ACTIVE` | `GPU_TOPIC` | 1 | TODO_TRTLLM_TRITON.md |

### <a id="error-handling"></a>🩹 Error Handling (`DOM_ERROR_RECOVERY` | Byte: 13 | Hex: `0x26`) — 8 Docs

| Document | Status | Topic hint | Comm* | Title |
|---|---|---|:---:|---|
| [agentic-error-fix-20-21-46-diagnose.md](../next_steps/active/2026-05-03/agentic-error-fix-20-21-46-diagnose.md) | `unknown` | `CPU_TOPIC` | 10 | Agentic Error Fix (diagnose) |
| [2026-05-09_mcp-tools-list-bisect.md](../next_steps/active/2026-05-09_mcp-tools-list-bisect.md) | `✅ **ROOT CAUSE FOUND AND` | `CPU_TOPIC` | 10 | Runbook — bisect the TRACE MCP `tools/list` `_zod` crash |
| [2026-05-30_PHASE_19B_UNIFIED_PIPELINE_READY.md](../next_steps/active/2026-05-30_PHASE_19B_UNIFIED_PIPELINE_READY.md) | `✅ **PRODUCTION READY** (` | `GOVERNANCE_TOPIC` | 10 | Phase 19B Unified Pipeline — COMPLETE & OPERATIONAL |
| [PRODUCTION_CONSOLIDATION_PLAN.md](../next_steps/archive/PRODUCTION_CONSOLIDATION_PLAN.md) | `ARCHIVE` | `CPU_TOPIC` | 10 | PRODUCTION_CONSOLIDATION_PLAN.md |
| [audio-to-knowledge-pipeline.md](../next_steps/completed/audio-to-knowledge-pipeline.md) | `DESIGN COMPLETE ✅` | `GPU_TOPIC` | 10 | audio-to-knowledge-pipeline.md |
| [2026-05-09_session-end-handoff.md](../sveltekit-frontend/next_steps/active/2026-05-09_session-end-handoff.md) | `ACTIVE` | `CPU_TOPIC` | 10 | Session-end handoff — 2026-05-09 (late) |
| [codebase-semantic-index-tasks.md](../sveltekit-frontend/next_steps/active/codebase-semantic-index-tasks.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 10 | codebase-semantic-index-tasks.md |
| [typescripterror.md](../sveltekit-frontend/next_steps/typescripterror.md) | `ACTIVE` | `GOVERNANCE_TOPIC` | 10 | TypeScript 7 Error Synthesis — Karpathy Autoresearch Log |

### <a id="test"></a>🧪 Test (`DOM_TEST_VERIFICATION` | Byte: 14 | Hex: `0x2B`) — 14 Docs

| Document | Status | Topic hint | Comm* | Title |
|---|---|---|:---:|---|
| [4_9_26_inference_tracks_cpu_fallback.md](../next_steps/4_9_26_inference_tracks_cpu_fallback.md) | `4 files patched ✓` | `GPU_TOPIC` | 21 | 4_9_26_inference_tracks_cpu_fallback.md |
| [README.md](../next_steps/README.md) | `ACTIVE` | `GPU_TOPIC` | 1 | Next Steps Index |
| [2026-07-09_ground-truth-mcp-audit.md](../next_steps/active/2026-07-09_ground-truth-mcp-audit.md) | `Phase 1 Router Wired + R` | `GOVERNANCE_TOPIC` | 10 | Ground Truth Collection + MCP Tool Audit + Retrieval Readiness |
| [ARCHITECTURE_SMOKE_TEST_PLAN.md](../next_steps/active/ARCHITECTURE_SMOKE_TEST_PLAN.md) | `ACTIVE` | `GPU_TOPIC` | 10 | Architecture Smoke Test Plan |
| [playwright-todo-prompt.md](../next_steps/active/playwright_todos/20260514_175850/playwright-todo-prompt.md) | `ACTIVE` | `GPU_TOPIC` | 10 | Playwright Todo Prompt |
| [VLM_QUICK_TEST_GUIDE.md](../next_steps/canonical/VLM_QUICK_TEST_GUIDE.md) | `CANONICAL` | `GPU_TOPIC` | 10 | VLM_QUICK_TEST_GUIDE.md |
| [ENHANCED_UX_PLAYWRIGHT_TESTING.md](../next_steps/completed/ENHANCED_UX_PLAYWRIGHT_TESTING.md) | `✅ COMPLETE — All items d` | `GPU_TOPIC` | 10 | Enhanced UX Playwright Testing |
| [hermes-workstation-kanban.md](../next_steps/hermes-workstation-kanban.md) | `ACTIVE` | `GPU_TOPIC` | 10 | Hermes Workstation Kanban |
| [langgraph-eval-plan.md](../next_steps/langgraph-eval-plan.md) | `IN PROGRESS` | `CPU_TOPIC` | 10 | langgraph-eval-plan.md |
| [12-full-codebase-audit-march2026.md](../sveltekit-frontend/next_steps/12-full-codebase-audit-march2026.md) | `COMPLETE — Tiers 0-3 ALL` | `GOVERNANCE_TOPIC` | 10 | 12-full-codebase-audit-march2026.md |
| [2026-05-08_atlas-signal-quality-todo.md](../sveltekit-frontend/next_steps/active/2026-05-08_atlas-signal-quality-todo.md) | `ACTIVE · 2026-05-08` | `GOVERNANCE_TOPIC` | 10 | Atlas Signal Quality — TODO |
| [2026-05-08_mcp-trace-hardening-session.md](../sveltekit-frontend/next_steps/active/2026-05-08_mcp-trace-hardening-session.md) | `ACTIVE — code-level gaps` | `GPU_TOPIC` | 10 | MCP/TRACE/Pgvector Hardening — Session 2026-05-08 |
| [2026-05-08_pipeline-driven-next-actions.md](../sveltekit-frontend/next_steps/active/2026-05-08_pipeline-driven-next-actions.md) | `ACTIVE` | `GPU_TOPIC` | 10 | Pipeline-Driven Next Actions — 2026-05-08 |
| [mau5_grep_stream_analysis (1).md](../sveltekit-frontend/next_steps/plans/mau5_grep_stream_analysis (1).md) | `PLANNING` | `CPU_TOPIC` | 10 | mau5-grep-stream-analysis.md — Atlas Smoke Review + Grep Stream Diagnostics |
