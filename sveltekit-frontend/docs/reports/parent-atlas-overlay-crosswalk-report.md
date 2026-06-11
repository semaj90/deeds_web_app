# Parent Atlas Overlay Crosswalk

Generated: 2026-06-11T05:19:10.950Z

## Summary

- canonical root rows: 18
- app inventory rows: 4209
- MAPPED_EXACT: 0
- MAPPED_HEURISTIC: 12
- ROOT_CONTRACT_ONLY: 6
- MISSING_APP_OVERLAY: 0
- APP_CODEBASE_INVENTORY: 4170
- CANDIDATE_CANONICAL_FEATURE: 0

## Root Feature Mapping

- retrieval_spine: MAPPED_HEURISTIC
  - subgraph_instruction_programming_kag_ace_topology__overview (18) - label/description fuzzy overlap (6)
  - the_4_layer_retrieval_stack (18) - label/description fuzzy overlap (6)
  - retrieval_and_graph_layer (15) - label/description fuzzy overlap (5)
- turbovec_prefilter: MAPPED_HEURISTIC
  - the_4_layer_retrieval_stack (15) - label/description fuzzy overlap (5)
  - inputs (12) - label/description fuzzy overlap (4)
  - pipeline_fit (12) - label/description fuzzy overlap (4)
- karpathy_authority_overlay: MAPPED_HEURISTIC
  - where_each_technology_fits (12) - label/description fuzzy overlap (4)
- karpathy_redis_hot_lane: MAPPED_HEURISTIC
  - karpathy_llmwiki__ace_kag_retrieval (12) - label/description fuzzy overlap (4)
- ace_context_pack_cache: MAPPED_HEURISTIC
  - where_each_technology_fits (21) - label/description fuzzy overlap (7)
  - resilience__2_aof_redis_persistence_hardening (18) - label/description fuzzy overlap (6)
  - feature_checklist (18) - label/description fuzzy overlap (6)
- intent_synthesis: ROOT_CONTRACT_ONLY
- feature_label_registry: ROOT_CONTRACT_ONLY
- pgvector_multi_table_lane: MAPPED_HEURISTIC
  - layer_1_cold_tier_ground_truth_768d (15) - label/description fuzzy overlap (5)
  - 3_high_performance_pgvector_hnsw_indexing (15) - label/description fuzzy overlap (5)
  - 2_relational_vector_db_architecture (12) - label/description fuzzy overlap (4)
- redis_agent_memory_server_eval: MAPPED_HEURISTIC
  - diagnostic_explanation_of_self_learning_benefit (15) - label/description fuzzy overlap (5)
  - 3_5_jsonl_append_only_log (12) - label/description fuzzy overlap (4)
  - 3_state_management_cross_boundary_rules (12) - label/description fuzzy overlap (4)
- claude_mem_opencode_reference: ROOT_CONTRACT_ONLY
- feature_gap_registry: ROOT_CONTRACT_ONLY
- codebase_semantic_index: MAPPED_HEURISTIC
  - trace_karpathy_runtime_split (15) - label/description fuzzy overlap (5)
  - 2_storage_caching_matrix (15) - label/description fuzzy overlap (5)
  - critical_environment_matrix (15) - label/description fuzzy overlap (5)
- semantic_cache_policy: MAPPED_HEURISTIC
  - 3_3_redis_bitfrost_hot_cache (21) - label/description fuzzy overlap (7)
  - where_each_technology_fits (21) - label/description fuzzy overlap (7)
  - feature_checklist (21) - label/description fuzzy overlap (7)
- memory_address_registry: ROOT_CONTRACT_ONLY
- ace_packet_flow: MAPPED_HEURISTIC
  - where_each_technology_fits (18) - label/description fuzzy overlap (6)
  - 3_3_redis_bitfrost_hot_cache (15) - label/description fuzzy overlap (5)
  - feature_checklist (15) - label/description fuzzy overlap (5)
- cluster_card_flow: MAPPED_HEURISTIC
  - layer_3_hot_tier_redis (15) - label/description fuzzy overlap (5)
  - feature_checklist (15) - label/description fuzzy overlap (5)
  - the_4_layer_retrieval_stack (15) - label/description fuzzy overlap (5)
- feature_labeling_pipeline: MAPPED_HEURISTIC
  - pipeline_fit (15) - label/description fuzzy overlap (5)
  - cluster_breakdown (12) - label/description fuzzy overlap (4)
  - updated_pipeline (12) - label/description fuzzy overlap (4)
- duckdb_analytics_lane: ROOT_CONTRACT_ONLY

## Decision Rule

- If most root features map heuristically, keep both registries and store this crosswalk.
- If root features are truly absent, add root feature IDs as canonical labels into the app overlay.
- If app rows are inventory rows, do not treat them as registry drift.