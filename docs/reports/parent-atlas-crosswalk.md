# Parent Atlas Overlay Crosswalk

Generated: 2026-06-06T17:27:04.702Z

## Summary

- External root entries: **18**
- App registry entries: **4209**
- Root entries with ≥1 app match: **18**
- Root entries with zero app match: **0**

## Root → App Crosswalk

Each root lane mapped to the best-matching app features (score ≥ 0.15).

### retrieval_spine
- status: implemented
- storage_lane: redis-hot + qdrant + postgres
- retrieval_lane: hybrid-ace
- nextAction: Reconcile against the live codebase atlas and keep labels normalized.
- App matches (top 8):
  - [0.38] `subgraph_instruction_programming_kag_ace_topology__overview` (implemented) — Overview
  - [0.38] `subgraph_instruction_programming_kag_ace_topology_todo__goal` (implemented) — Goal
  - [0.38] `the_4_layer_retrieval_stack` (implemented) — The 4-Layer Retrieval Stack:
  - [0.36] `codebase_atlas_index` (implemented) — codebase atlas index
  - [0.35] `system_boundary` (implemented) — System Boundary

### turbovec_prefilter
- status: implemented
- storage_lane: redis-hot + qdrant
- retrieval_lane: cluster-prefilter
- nextAction: Keep this as a non-blocking narrowing stage before semantic recall.
- App matches (top 8):
  - [0.36] `the_4_layer_retrieval_stack` (implemented) — The 4-Layer Retrieval Stack:
  - [0.33] `package_map` (implemented) — package map
  - [0.32] `qdrant_search_contract__root` (implemented) — qdrant-search-contract
  - [0.32] `integration_features_to_look_for` (implemented) — Integration features to look for
  - [0.31] `directory_role_map` (implemented) — Directory Role Map

### karpathy_authority_overlay
- status: implemented
- storage_lane: redis-hot + json artifact
- retrieval_lane: authority-boost
- nextAction: Feed the authority snapshot into the feature-gap diff as a routing prior.
- App matches (top 8):
  - [0.33] `1_retrieval_stages` (implemented) — 1. Retrieval Stages
  - [0.31] `query_routing_evaluation_phase_18` (implemented) — Query Routing Evaluation — Phase 18
  - [0.31] `where_each_technology_fits` (implemented) — Where each technology fits
  - [0.31] `3_query_routing_results` (implemented) — 3. Query Routing Results
  - [0.31] `the_4_layer_retrieval_stack` (implemented) — The 4-Layer Retrieval Stack:

### karpathy_redis_hot_lane
- status: implemented
- storage_lane: redis-hot
- retrieval_lane: authority-overlay
- nextAction: Keep this as the current low-latency hot path; do not replace it with Redis Agent Memory Server unless evaluation proves a gain.
- App matches (top 8):
  - [0.38] `where_each_technology_fits` (implemented) — Where each technology fits
  - [0.36] `q2_2026_current` (implemented) — Q2 2026 (Current)
  - [0.33] `1_retrieval_stages` (implemented) — 1. Retrieval Stages
  - [0.31] `simd_bridge_memory_vram_safety_audit` (implemented) — SIMD Bridge Memory & VRAM Safety Audit
  - [0.31] `2_implementation_strategy` (implemented) — 2. Implementation Strategy

### ace_context_pack_cache
- status: implemented
- storage_lane: redis-hot + postgres + file snapshot
- retrieval_lane: ace-context-pack
- nextAction: Use this as the durable hot-pointer layer for the registry diff summary.
- App matches (top 8):
  - [0.36] `findings` (implemented) — Findings
  - [0.36] `where_each_technology_fits` (implemented) — Where each technology fits
  - [0.36] `integration_features_to_look_for` (implemented) — Integration features to look for
  - [0.36] `feature_checklist` (implemented) — Feature checklist
  - [0.36] `drizzle_postgres_contract_report` (implemented) — Drizzle ↔ Postgres Contract Report

### intent_synthesis
- status: implemented
- storage_lane: postgres + redis-hot
- retrieval_lane: grpo-lite
- nextAction: Use the reward loop to tag missing feature surfaces and duplicates.
- App matches (top 8):
  - [0.36] `findings` (implemented) — Findings
  - [0.36] `drizzle_postgres_contract_report` (implemented) — Drizzle ↔ Postgres Contract Report
  - [0.33] `high_1` (implemented) — HIGH (1)
  - [0.31] `simd_bridge_memory_vram_safety_audit` (implemented) — SIMD Bridge Memory & VRAM Safety Audit
  - [0.30] `restores_a_specific_snapshot_folder` (implemented) — Restores a specific snapshot folder

### feature_label_registry
- status: partial
- storage_lane: contract-doc + planned registry
- retrieval_lane: label-normalization
- nextAction: Promote the contract into a generated registry once live atlas inputs exist.
- App matches (top 8):
  - [0.29] `llm_todos` (implemented) — llm todos
  - [0.26] `8_action_tracker` (implemented) — 8. Action Tracker
  - [0.25] `feature_parity_audit_2026_05_10` (implemented) — Feature Parity Audit - 2026-05-10
  - [0.23] `repo_qdrant_payload_atlas__top_entries` (implemented) — Top Entries
  - [0.22] `feature_parity_2026_05_10__summary` (implemented) — Summary

### pgvector_multi_table_lane
- status: implemented
- storage_lane: postgres pgvector
- retrieval_lane: vector-recall
- nextAction: Keep dimension drift frozen until the live 384d/768d reconciliation is explicit.
- App matches (top 8):
  - [0.31] `db_schema_drift_audit_2026_05_10` (implemented) — DB Schema Drift Audit - 2026-05-10
  - [0.29] `layer_1_cold_tier_ground_truth_768d` (implemented) — Layer 1: Cold Tier — Ground Truth 768d
  - [0.29] `3_high_performance_pgvector_hnsw_indexing` (implemented) — 3. High-Performance pgvector HNSW Indexing
  - [0.29] `pgvector_hnsw_index_plan_phase_6e` (implemented) — pgvector HNSW Index Plan (Phase 6E)
  - [0.29] `vector_dimension_policy_operator_gate_no_code_change_yet` (implemented) — Vector Dimension Policy (operator gate — no code change yet)

### redis_agent_memory_server_eval
- status: missing
- storage_lane: evaluation-only
- retrieval_lane: mcp-memory-lane
- nextAction: Evaluate in an isolated redis:8 container and compare against ACE Context Pack Cache.
- App matches (top 8):
  - [0.38] `redis_bitfrost_lane` (implemented) — Redis/BitFrost Lane
  - [0.33] `6_aggregate_and_cache_active_feature_context_cards_in_redis` (implemented) — 6. Aggregate and cache active feature context cards in Redis
  - [0.31] `repo_redis_ace_cards__top_entries` (implemented) — Top Entries
  - [0.29] `subgraph_instruction_programming_kag_ace_topology_todo` (implemented) — Subgraph Instruction Programming + KAG/ACE Topology TODO
  - [0.27] `q2_2026_current` (implemented) — Q2 2026 (Current)

### claude_mem_opencode_reference
- status: partial
- storage_lane: reference-only
- retrieval_lane: open-code-memory-pattern
- nextAction: Use as a pattern reference only; keep durable memory Postgres-first.
- App matches (top 8):
  - [0.33] `1_retrieval_stages` (implemented) — 1. Retrieval Stages
  - [0.33] `error_analysis_architecture` (implemented) — Error Analysis Architecture
  - [0.33] `postgres17_reference` (implemented) — postgres17-reference
  - [0.30] `pathway_cards_spec__root` (implemented) — pathway-cards-spec
  - [0.30] `rabbitmq_workflow_fabric` (implemented) — RabbitMQ Workflow Fabric

### feature_gap_registry
- status: partial
- storage_lane: postgres + docs bootstrap
- retrieval_lane: agentic-audit
- nextAction: Replace bootstrap rows with a live codebase atlas scan when the app workspace is mounted.
- App matches (top 8):
  - [0.38] `feature_parity_audit_2026_05_10` (implemented) — Feature Parity Audit - 2026-05-10
  - [0.36] `codebase_atlas_index` (implemented) — codebase atlas index
  - [0.33] `1_retrieval_stages` (implemented) — 1. Retrieval Stages
  - [0.33] `native_bridge_verification_audit_2026_05_12` (implemented) — Native Bridge Verification Audit — 2026-05-12
  - [0.33] `codebase_atlas` (implemented) — codebase atlas

### codebase_semantic_index
- status: implemented
- storage_lane: qdrant + pgvector + redis-hot
- retrieval_lane: codebase-semantic-search
- nextAction: Use live codebase atlas outputs to replace bootstrap assumptions with source-derived coverage.
- App matches (top 8):
  - [0.36] `codebase_atlas_index` (implemented) — codebase atlas index
  - [0.33] `canonical_source` (implemented) — Canonical source
  - [0.31] `feature_parity_audit_2026_05_10` (implemented) — Feature Parity Audit - 2026-05-10
  - [0.29] `phase_15b_adaptive_retrieval_lane_routing_evaluator` (implemented) — Phase 15B — Adaptive Retrieval Lane-Routing Evaluator
  - [0.29] `1_architectural_principles` (implemented) — 1. Architectural Principles

### semantic_cache_policy
- status: partial
- storage_lane: redis exact + redis semantic + bifrost prefix + ace packet
- retrieval_lane: cache-policy-contract
- nextAction: Normalize one exact-cache key contract, one semantic-cache compatibility contract, and one invalidation rule.
- App matches (top 8):
  - [0.45] `findings` (implemented) — Findings
  - [0.42] `ace_packet_integration_smoke_report` (implemented) — ACE Packet Integration Smoke Report
  - [0.38] `3_3_redis_bitfrost_hot_cache` (implemented) — 3.3 Redis / BitFrost Hot Cache
  - [0.38] `feature_checklist` (implemented) — Feature checklist
  - [0.34] `where_each_technology_fits` (implemented) — Where each technology fits

### memory_address_registry
- status: missing
- storage_lane: postgres-first
- retrieval_lane: durable-memory-addressing
- nextAction: Promote the registry contract into durable tables when the live app workspace is mounted.
- App matches (top 8):
  - [0.36] `findings` (implemented) — Findings
  - [0.36] `drizzle_postgres_contract_report` (implemented) — Drizzle ↔ Postgres Contract Report
  - [0.33] `high_1` (implemented) — HIGH (1)
  - [0.31] `db_schema_drift_audit_2026_05_10` (implemented) — DB Schema Drift Audit - 2026-05-10
  - [0.31] `simd_bridge_memory_vram_safety_audit` (implemented) — SIMD Bridge Memory & VRAM Safety Audit

### ace_packet_flow
- status: implemented
- storage_lane: redis-hot + ace packet cache
- retrieval_lane: packet-reuse
- nextAction: Keep packet reuse observation-first until the live atlas scan proves compatibility.
- App matches (top 8):
  - [0.33] `ace_packet_injection` (implemented) — ACE Packet Injection
  - [0.33] `ace_packet_integration_smoke_report` (implemented) — ACE Packet Integration Smoke Report
  - [0.32] `integration_features_to_look_for` (implemented) — Integration features to look for
  - [0.31] `redis_bitfrost_lane` (implemented) — Redis/BitFrost Lane
  - [0.29] `drizzle_postgres_contract_report` (implemented) — Drizzle ↔ Postgres Contract Report

### cluster_card_flow
- status: partial
- storage_lane: postgres + qdrant + redis-hot
- retrieval_lane: cluster-card-synthesis
- nextAction: Promote the cluster-card contract into generated outputs after the live feature registry is replaced.
- App matches (top 8):
  - [0.45] `findings` (implemented) — Findings
  - [0.44] `postgres17_reference` (implemented) — postgres17-reference
  - [0.43] `drizzle_postgres_contract_report` (implemented) — Drizzle ↔ Postgres Contract Report
  - [0.38] `directory_role_map` (implemented) — Directory Role Map
  - [0.38] `cuda_reference` (implemented) — cuda-reference

### feature_labeling_pipeline
- status: partial
- storage_lane: redis + qdrant + docs
- retrieval_lane: label-normalization
- nextAction: Replace contract-only labels with source-derived labels from the live codebase atlas scan.
- App matches (top 8):
  - [0.38] `repo_qdrant_payload_atlas__top_entries` (implemented) — Top Entries
  - [0.38] `feature_parity_audit_2026_05_10` (implemented) — Feature Parity Audit - 2026-05-10
  - [0.36] `codebase_atlas_index` (implemented) — codebase atlas index
  - [0.36] `findings` (implemented) — Findings
  - [0.36] `language_counts` (implemented) — language counts

### duckdb_analytics_lane
- status: missing
- storage_lane: duckdb analytical only
- retrieval_lane: offline-rollups
- nextAction: Keep DuckDB as an analytical consumer until the export-manifest and live atlas scan are stable.
- App matches (top 8):
  - [0.29] `model_artifact_inventory_phase_9c` (implemented) — Model Artifact Inventory (Phase 9C)
  - [0.29] `workstation_parent_atlas_observability_dashboard` (implemented) — Workstation Parent Atlas Observability Dashboard
  - [0.28] `deepseek_engram_architecture_search` (implemented) — DeepSeek Engram Architecture Search
  - [0.27] `codebase_atlas_index` (implemented) — codebase atlas index
  - [0.26] `parent_atlas_karpathy_pipeline` (implemented) — Parent Atlas Karpathy Pipeline

## Unmatched Root Entries (need app registry rows)

None — all root lanes have app coverage.

## Recommended Actions

1. For each unmatched root lane, create a corresponding app registry entry with the root's `feature_id` as `featureKey`, `storage_lane`/`retrieval_lane` in `summary`, and `sourceRefs` linking the owner file.
2. For matched lanes with `status: partial` or `status: missing` in the root, verify the linked app entries are also `partial` — sync status where they diverge.
3. Re-run `audit-parent-atlas-overlay-sync.mjs` after promoting the unmatched entries to confirm `SCHEMA_AND_SQL_ALIGNED`.