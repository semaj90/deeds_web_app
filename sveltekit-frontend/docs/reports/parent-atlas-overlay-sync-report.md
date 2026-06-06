# Parent Atlas Overlay Sync

- **classification**: OVERLAY_MISMATCH
- **rootRegistryRows**: 18
- **appRegistryRows**: 4209
- **rootMatchedInApp**: 0
- **rootMissingInApp**: 18
- **appMissingInRoot**: 4209

## Root Registry Samples

- retrieval_spine | implemented | redis-hot + qdrant + postgres | hybrid-ace
- turbovec_prefilter | implemented | redis-hot + qdrant | cluster-prefilter
- karpathy_authority_overlay | implemented | redis-hot + json artifact | authority-boost
- karpathy_redis_hot_lane | implemented | redis-hot | authority-overlay
- ace_context_pack_cache | implemented | redis-hot + postgres + file snapshot | ace-context-pack

## App Registry Samples

- opencode_mcp_atlas__root | implemented | n/a | n/a
- yorha_legal_ai_agentic_progress_log | implemented | n/a | n/a
- 2026_05_22t20_15_00_000z_cache_trace_failed | implemented | n/a | n/a
- 2026_05_22t20_16_00_000z_toon_packet_shape_partial | implemented | n/a | n/a
- 2026_05_22t20_17_00_000z_qdrant_payload_parity_partial | implemented | n/a | n/a

## Missing In App

- retrieval_spine | implemented | docs/reports/retrieval-truth-2026-05-20.md
- turbovec_prefilter | implemented | docs/reports/retrieval-truth-2026-05-20.md
- karpathy_authority_overlay | implemented | docs/reports/retrieval-truth-2026-05-20.md
- karpathy_redis_hot_lane | implemented | docs/reports/retrieval-truth-2026-05-20.md
- ace_context_pack_cache | implemented | docs/reports/memory-registry-schema-contract-2026-05-20.md
- intent_synthesis | implemented | docs/reports/memory-registry-schema-contract-2026-05-20.md
- feature_label_registry | partial | CONTRACT-feature-label-registry-2026-05-19.md
- pgvector_multi_table_lane | implemented | docs/reports/pgvector-inventory-2026-05-20.md
- redis_agent_memory_server_eval | missing | MASTER-FEATURE-TODO-2026-05-20.md
- claude_mem_opencode_reference | partial | MASTER-FEATURE-TODO-2026-05-20.md
- feature_gap_registry | partial | MASTER-FEATURE-TODO-2026-05-20.md
- codebase_semantic_index | implemented | docs/reports/retrieval-truth-2026-05-20.md
- semantic_cache_policy | partial | docs/reports/engram-sidecar-gap-map-2026-05-20.md
- memory_address_registry | missing | docs/reports/memory-registry-schema-contract-2026-05-20.md
- ace_packet_flow | implemented | docs/reports/did-you-mean-intent-scorer-contract-2026-05-20.md
- cluster_card_flow | partial | reference/REF-storage-synthesis-and-publish-2026-05-20.md
- feature_labeling_pipeline | partial | CONTRACT-feature-label-registry-2026-05-19.md
- duckdb_analytics_lane | missing | docs/reports/pgvector-inventory-2026-05-20.md

## App Only

- opencode_mcp_atlas__root | implemented | n/a
- yorha_legal_ai_agentic_progress_log | implemented | n/a
- 2026_05_22t20_15_00_000z_cache_trace_failed | implemented | n/a
- 2026_05_22t20_16_00_000z_toon_packet_shape_partial | implemented | n/a
- 2026_05_22t20_17_00_000z_qdrant_payload_parity_partial | implemented | n/a
- 2026_05_22t20_18_00_000z_bifrost_cards_smoke_solved | implemented | n/a
- 2026_05_22t20_19_00_000z_check_script_blocked | implemented | n/a
- 2026_05_22t20_20_00_000z_atlas_build_partial | implemented | n/a
- 2026_05_23t03_28_26_412z_unknown_partial | implemented | n/a
- 2026_05_23t03_29_33_989z_type_check_chat_stream_solved | implemented | n/a
- couchdb_mapreduce_atlas_ingestion__root | implemented | n/a
- couchdb_mapreduce_atlas_ingestion | implemented | n/a
- doc_types | implemented | n/a
- views | implemented | n/a
- deepseek_engram_architecture_search__root | implemented | n/a
- deepseek_engram_architecture_search | implemented | n/a
- inputs | implemented | n/a
- candidate_roles | implemented | n/a
- search_questions | implemented | n/a
- code_anchors_verified | implemented | n/a