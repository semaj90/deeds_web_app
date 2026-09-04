# MCP Tool Ontology

**Generated**: 2026-09-03T18:40:40.865Z  
**Source**: http://127.0.0.1:8788/mcp  
**Total tools**: 173  

## Retrieval Layer Routing Table

This is the canonical routing table for OpenCode. Use the layer that matches the query shape.

### IDENTITY

- `atlas.query`
- `atlas.source_refs`
- `kag.feature_lookup`
- `atlas.packet_search`

### MEMORY

- `engram.chat_memory_store`
- `engram.chat_memory_recent`
- `kag.recall_similar_fix`

### CACHE

- `legal.transcribe_video`
- `legal.check_services`
- `engram.ace_packet_inject`
- `atlas_get_active_context`
- `engram.chat_memory_store`
- `engram.redis_health`
- `atlas.embedding_keywords`
- `atlas.embedding_cluster_tags`
- `wiki.status`
- `wiki.search`
- `ops.update_LLMS.md`
- `ops.verify_write`
- `ops.fixer_semantic_recall`
- `evidence.image_feedback`
- `ops.gpu_attention`
- `ace.compact_search`
- `karpathy.attention_rank_files`
- `karpathy.som_topology_stats`
- `context.build_ace_packet`

### LEXICAL

- `legal.find_similar_opinions`
- `search.postgres_fts`
- `search.hybrid`
- `search.go_hybrid`
- `kag.recall_similar_fix`
- `kag.multi_lane_search`
- `ace.compact_search`

### DENSE

- `legal.batch_ingest`
- `legal.cross_reference_evidence`
- `legal.find_similar_opinions`
- `legal.transcribe_video`
- `legal.check_services`
- `atlas.embedding_keywords`
- `atlas.embedding_cluster_tags`
- `atlas.embedding_neighbors`
- `atlas.embedding_all_tags`
- `ldr_research`
- `wiki.status`
- `wiki.search`
- `wiki.explain_page`
- `search.go_hybrid`
- `ops.trust_audit`
- `ops.fixer_semantic_recall`
- `ops.fixer_pattern_store`
- `evidence.search_by_image`
- `evidence.image_feedback`
- `image.search_by_text`
- `image.caption`
- `image.enrich_tags`
- `atlas.prefilter`
- `ace.compact_search`
- `atlas.packet_search`
- `atlas.coverage`
- `karpathy.attention_rank_files`
- `topology.language_distribution`

### GRAPH

- `context.prefetch_feature_context`
- `atlas.compact_context`
- `atlas.explain_trace`
- `legal.check_services`
- `library.registry_lookup`
- `library.registry_fetch_tier`
- `wiki.status`
- `wiki.search`
- `wiki.refresh_directory`
- `wiki.explain_page`
- `graph.expand_neighborhood`
- `graph.shortest_path`
- `graph.semantic_path_synthesis`
- `graph.community_for_node`
- `graph.pagerank_top`
- `topology.search_som_neighborhood`
- `graph.materialize_pathway`
- `kb.search_pathways`
- `hypergraph.semantic_path_synthesis`
- `trace.graphrag_search`
- `kag.feature_lookup`
- `taxonomy.path`
- `clusters.som_cell_lookup`
- `hypergraph.search`
- `hypergraph.get_edge`
- `hypergraph.explain_activation`
- `hypergraph.expand_members`
- `evidence.link_image_graph`
- `image.enrich_tags`
- `ops.gpu_pagerank`
- `runtime.sse_probe`
- `ace.compact_search`
- `atlas.packet_search`
- `atlas.graph.pagerank`
- `atlas.build_taxonomy_topology_packet`
- `karpathy.attention_rank_files`
- `karpathy.som_topology_stats`
- `research.playbook_lookup_by_language`
- `context.build_indexed_source_packet`

### RERANK

- `turbovec.rank_chunks`
- `search.rerank`
- `trace.graphrag_search`
- `search.go_hybrid`
- `ops.gpu_attention`
- `atlas.prefilter`
- `atlas.coverage`

### SYNTHESIS

- `kb.archive_synthesis`
- `legal.cross_examine`
- `legal.build_timeline`
- `legal.issue_spotter`
- `legal.mock_trial`
- `engram.ace_packet_inject`
- `library.registry_fetch_tier`
- `ldr_research`
- `graph.semantic_path_synthesis`
- `kb.explain_context_pack`
- `hypergraph.semantic_path_synthesis`
- `kag.recall_similar_fix`
- `kag.multi_lane_search`
- `kag.web_search`
- `LLMS.md.peers_via_relations`
- `LLMS.md.coverage_chain`
- `clusters.get_summary_lenses`
- `LLMS.md.context_for_file`
- `LLMS.md.peers_for_dir`
- `LLMS.md.coverage`
- `LLMS.md.shares_tags`
- `LLMS.md.binding_chain`
- `ops.update_LLMS.md`
- `ops.fixer_semantic_recall`
- `image.search_by_text`
- `image.caption`
- `image.enrich_tags`
- `atlas.populate_feature_documents`
- `karpathy.attention_rank_files`
- `shell.run`

### OPS

- `ops.execute_graphify`
- `ops.trust_audit`
- `ops.propose_patch`
- `ops.run_targeted_test`
- `ops.record_fix_attempt`
- `ops.run_quality_gate`
- `ops.update_LLMS.md`
- `ops.search_tools`
- `ops.inspect_tool_contract`
- `ops.validate_tool_call`
- `ops.audit_tool_result`
- `ops.verify_write`
- `ops.validate_claims`
- `ops.fixer_semantic_recall`
- `ops.fixer_pattern_store`
- `ops.gpu_attention`
- `ops.gpu_pagerank`
- `ops.gpu_topk`
- `ops.gpu_pipeline_stats`

### READ

- `kb.wiki_note_lookup`
- `atlas.explain_trace`
- `atlas.get_chunk`
- `db.schema_overview`
- `db.table_inspect`
- `file.read_window`
- `wiki.status`
- `wiki.search`
- `wiki.refresh_directory`
- `wiki.explain_page`

### UNKNOWN

- `kb.organize_messy_text`
- `kb.extract_citations`
- `kb.trace_search`
- `atlas.suggest_files`
- `ui.analyze_view`
- `skills.list`
- `skills.run_mission`
- `legal.get_transcript`
- `legal.find_precedents`
- `legal.search_recordings`
- `legal.score_case`
- `legal.similar_cases`
- `legal.write_obsidian_note`
- `topology.hydration_status`
- `topology.recompute_manifold_plan`
- `library.registry_search`
- `library.registry_rescan`
- `phase109a_archive_signal`
- `phase109a_supersede_signal`
- `phase109a_supersede_recommendation`
- `phase109a_promote_recommendation`
- `phase109a_query_signal_history`
- `phase109a_validate_state_transition`
- `topology.search_near`
- `topology.same_som_cluster`
- `kb.hybrid_search`
- `kb.search_summary_tree`
- `kb.search_notecards`
- `trace.system_health`
- `topology.search_4d`
- `clusters.get_members`
- `trace.explain_retrieval`
- `trace_dynamic_context`
- `trace.kag_search`
- `context.build_kv_packet`
- `context.get_compressed_card`
- `context.explain_compression`
- `context.refresh_task_toc`
- `search.dev_context`
- `kag.record_agent_run`
- `kag.ingest_memory_directory`
- `kag.ingest_error`
- `kag.panel_context`
- `taxonomy.children`
- `clusters.kmeans_members`
- `trace.validate_ace_hit`
- `knowledge.get_minified_map`
- `tools.batch_call`
- `codebase.context_for_file`
- `runtime.simdjson_status`
- `runtime.quic_status`
- `atlas.workstation_status`
- `atlas.feature_document_status`
- `atlas.feature_document_ingestion_plan`
- `atlas.feature_document_enrichment_plan`
- `atlas.materialize_feature_evidence_tuples`
- `atlas.pos_concept_tagging`
- `service_workers.status`
- `service_workers.result`
- `miniforge.health`
- `miniforge.analyze`
- `domain.classify`
- `miniforge.extract`

## Full Tool Inventory

| Tool | Namespace | Layer(s) | Identity Fields | Writes To | Permissions |
|------|-----------|----------|-----------------|-----------|-------------|
| `kb.organize_messy_text` | kb | unknown | — | — | read_only |
| `kb.extract_citations` | kb | unknown | — | — | read_only |
| `kb.trace_search` | kb | unknown | — | — | read_only |
| `atlas.query` | atlas | identity | — | — | read_only |
| `kb.wiki_note_lookup` | kb | read | — | — | read_only |
| `kb.archive_synthesis` | kb | synthesis | — | — | read_only |
| `context.prefetch_feature_context` | context | graph | — | — | read_only |
| `atlas.compact_context` | atlas | graph | — | — | read_only |
| `atlas.source_refs` | atlas | identity | source_ref | — | read_only |
| `atlas.suggest_files` | atlas | unknown | — | — | read_only |
| `atlas.explain_trace` | atlas | graph, read | — | — | read_only |
| `atlas.get_chunk` | atlas | read | — | — | read_only |
| `ui.analyze_view` | ui | unknown | — | — | read_only |
| `ops.execute_graphify` | ops | ops | — | — | read_only |
| `skills.list` | skills | unknown | — | — | read_only |
| `skills.run_mission` | skills | unknown | — | — | read_only |
| `legal.get_transcript` | legal | unknown | — | — | read_only |
| `legal.find_precedents` | legal | unknown | — | — | read_only |
| `legal.search_recordings` | legal | unknown | — | — | read_only |
| `legal.cross_examine` | legal | synthesis | — | — | read_only |
| `legal.score_case` | legal | unknown | — | — | read_only |
| `legal.similar_cases` | legal | unknown | — | — | read_only |
| `legal.batch_ingest` | legal | dense | — | — | read_only |
| `legal.build_timeline` | legal | synthesis | — | — | read_only |
| `legal.cross_reference_evidence` | legal | dense | — | — | read_only |
| `legal.issue_spotter` | legal | synthesis | — | — | read_only |
| `legal.find_similar_opinions` | legal | lexical, dense | — | — | read_only |
| `legal.transcribe_video` | legal | cache, dense | — | — | read_only |
| `legal.write_obsidian_note` | legal | unknown | — | — | read_only |
| `legal.mock_trial` | legal | synthesis | — | — | read_only |
| `legal.check_services` | legal | cache, dense, graph | — | — | read_only |
| `engram.ace_packet_inject` | engram | cache, synthesis | — | engram | read_write |
| `atlas_get_active_context` | misc | cache | — | — | read_only |
| `engram.chat_memory_store` | engram | cache, memory | — | engram | read_write |
| `engram.redis_health` | engram | cache | — | redis | read_write |
| `atlas.embedding_keywords` | atlas | cache, dense | — | — | read_only |
| `atlas.embedding_cluster_tags` | atlas | cache, dense | — | — | read_only |
| `atlas.embedding_neighbors` | atlas | dense | — | — | read_only |
| `atlas.embedding_all_tags` | atlas | dense | — | — | read_only |
| `topology.hydration_status` | topology | unknown | — | — | read_only |
| `topology.recompute_manifold_plan` | topology | unknown | — | — | read_only |
| `db.schema_overview` | db | read | — | postgres | read_write |
| `db.table_inspect` | db | read | — | postgres | read_write |
| `library.registry_lookup` | library | graph | — | — | read_only |
| `library.registry_search` | library | unknown | — | — | read_only |
| `library.registry_fetch_tier` | library | graph, synthesis | — | — | read_only |
| `library.registry_rescan` | library | unknown | — | — | read_only |
| `ldr_research` | misc | dense, synthesis | — | — | read_only |
| `phase109a_archive_signal` | misc | unknown | — | — | read_only |
| `phase109a_supersede_signal` | misc | unknown | — | — | read_only |
| `phase109a_supersede_recommendation` | misc | unknown | — | — | read_only |
| `phase109a_promote_recommendation` | misc | unknown | — | — | read_only |
| `phase109a_query_signal_history` | misc | unknown | — | — | read_only |
| `phase109a_validate_state_transition` | misc | unknown | — | — | read_only |
| `file.read_window` | file | read | — | — | read_only |
| `wiki.status` | wiki | cache, dense, graph, read | — | — | read_only |
| `wiki.search` | wiki | cache, dense, graph, read | — | — | read_only |
| `wiki.refresh_directory` | wiki | graph, read | — | — | read_only |
| `wiki.explain_page` | wiki | dense, graph, read | — | — | read_only |
| `graph.expand_neighborhood` | graph | graph | — | neo4j | read_write |
| `turbovec.rank_chunks` | turbovec | rerank | — | — | read_only |
| `engram.chat_memory_recent` | engram | memory | — | — | read_only |
| `graph.shortest_path` | graph | graph | — | neo4j | read_write |
| `graph.semantic_path_synthesis` | graph | graph, synthesis | — | — | read_only |
| `graph.community_for_node` | graph | graph | — | neo4j | read_write |
| `graph.pagerank_top` | graph | graph | — | — | read_only |
| `topology.search_near` | topology | unknown | — | — | read_only |
| `topology.same_som_cluster` | topology | unknown | — | — | read_only |
| `topology.search_som_neighborhood` | topology | graph | — | — | read_only |
| `kb.hybrid_search` | kb | unknown | — | — | read_only |
| `graph.materialize_pathway` | graph | graph | — | — | read_only |
| `kb.search_pathways` | kb | graph | — | — | read_only |
| `kb.search_summary_tree` | kb | unknown | — | — | read_only |
| `kb.search_notecards` | kb | unknown | — | — | read_only |
| `kb.explain_context_pack` | kb | synthesis | — | — | read_only |
| `trace.system_health` | trace | unknown | — | — | read_only |
| `search.rerank` | search | rerank | — | — | read_only |
| `hypergraph.semantic_path_synthesis` | hypergraph | graph, synthesis | — | — | read_only |
| `topology.search_4d` | topology | unknown | — | — | read_only |
| `clusters.get_members` | clusters | unknown | — | — | read_only |
| `trace.explain_retrieval` | trace | unknown | — | — | read_only |
| `trace_dynamic_context` | misc | unknown | — | — | read_only |
| `search.postgres_fts` | search | lexical | — | — | read_only |
| `search.hybrid` | search | lexical | — | — | read_only |
| `trace.kag_search` | trace | unknown | — | — | read_only |
| `trace.graphrag_search` | trace | graph, rerank | — | — | read_only |
| `search.go_hybrid` | search | lexical, dense, rerank | — | — | read_only |
| `context.build_kv_packet` | context | unknown | — | — | read_only |
| `context.get_compressed_card` | context | unknown | — | — | read_only |
| `context.explain_compression` | context | unknown | — | — | read_only |
| `context.refresh_task_toc` | context | unknown | — | — | read_only |
| `search.dev_context` | search | unknown | — | — | read_only |
| `kag.record_agent_run` | kag | unknown | — | — | read_only |
| `kag.ingest_memory_directory` | kag | unknown | — | — | read_only |
| `kag.ingest_error` | kag | unknown | — | — | read_only |
| `kag.recall_similar_fix` | kag | lexical, synthesis, memory | — | — | read_only |
| `kag.multi_lane_search` | kag | lexical, synthesis | — | — | read_only |
| `kag.web_search` | kag | synthesis | — | — | read_only |
| `kag.feature_lookup` | kag | graph, identity | — | — | read_only |
| `kag.panel_context` | kag | unknown | — | — | read_only |
| `ops.trust_audit` | ops | dense, ops | — | — | read_only |
| `taxonomy.children` | taxonomy | unknown | — | — | read_only |
| `taxonomy.path` | taxonomy | graph | — | — | read_only |
| `LLMS.md.peers_via_relations` | LLMS | synthesis | — | — | read_only |
| `LLMS.md.coverage_chain` | LLMS | synthesis | — | — | read_only |
| `clusters.get_summary_lenses` | clusters | synthesis | — | — | read_only |
| `clusters.som_cell_lookup` | clusters | graph | source_ref, packet_key | — | read_only |
| `clusters.kmeans_members` | clusters | unknown | — | — | read_only |
| `trace.validate_ace_hit` | trace | unknown | — | — | read_only |
| `ops.propose_patch` | ops | ops | — | postgres, kanban | read_write |
| `ops.run_targeted_test` | ops | ops | — | postgres | read_write |
| `ops.record_fix_attempt` | ops | ops | — | postgres, kanban | read_write |
| `ops.run_quality_gate` | ops | ops | — | postgres | read_write |
| `hypergraph.search` | hypergraph | graph | — | — | read_only |
| `hypergraph.get_edge` | hypergraph | graph | — | — | read_only |
| `hypergraph.explain_activation` | hypergraph | graph | — | — | read_only |
| `hypergraph.expand_members` | hypergraph | graph | — | neo4j | read_write |
| `knowledge.get_minified_map` | knowledge | unknown | — | — | read_only |
| `tools.batch_call` | tools | unknown | — | — | read_only |
| `codebase.context_for_file` | codebase | unknown | — | — | read_only |
| `LLMS.md.context_for_file` | LLMS | synthesis | — | — | read_only |
| `LLMS.md.peers_for_dir` | LLMS | synthesis | — | — | read_only |
| `LLMS.md.coverage` | LLMS | synthesis | — | — | read_only |
| `LLMS.md.shares_tags` | LLMS | synthesis | — | — | read_only |
| `LLMS.md.binding_chain` | LLMS | synthesis | — | — | read_only |
| `ops.update_LLMS.md` | ops | cache, synthesis, ops | — | — | read_only |
| `ops.search_tools` | ops | ops | — | — | read_only |
| `ops.inspect_tool_contract` | ops | ops | — | — | read_only |
| `ops.validate_tool_call` | ops | ops | — | — | read_only |
| `ops.audit_tool_result` | ops | ops | — | — | read_only |
| `ops.verify_write` | ops | cache, ops | — | — | read_only |
| `ops.validate_claims` | ops | ops | — | — | read_only |
| `ops.fixer_semantic_recall` | ops | cache, dense, synthesis, ops | — | — | read_only |
| `ops.fixer_pattern_store` | ops | dense, ops | — | — | read_only |
| `evidence.search_by_image` | evidence | dense | — | — | read_only |
| `evidence.image_feedback` | evidence | cache, dense | — | — | read_only |
| `evidence.link_image_graph` | evidence | graph | — | qdrant | read_write |
| `image.search_by_text` | image | dense, synthesis | — | — | read_only |
| `image.caption` | image | dense, synthesis | — | — | read_only |
| `image.enrich_tags` | image | dense, graph, synthesis | — | — | read_only |
| `ops.gpu_attention` | ops | cache, rerank, ops | — | — | read_only |
| `ops.gpu_pagerank` | ops | graph, ops | — | — | read_only |
| `ops.gpu_topk` | ops | ops | — | — | read_only |
| `ops.gpu_pipeline_stats` | ops | ops | — | — | read_only |
| `runtime.simdjson_status` | runtime | unknown | — | — | read_only |
| `runtime.sse_probe` | runtime | graph | — | — | read_only |
| `runtime.quic_status` | runtime | unknown | — | — | read_only |
| `atlas.prefilter` | atlas | dense, rerank | — | — | read_only |
| `ace.compact_search` | ace | cache, lexical, dense, graph | — | — | read_only |
| `atlas.packet_search` | atlas | dense, graph, identity | feature_id, source_ref | — | read_only |
| `atlas.coverage` | atlas | dense, rerank | feature_id, source_ref | postgres | read_write |
| `atlas.graph.pagerank` | atlas | graph | packet_key | — | read_only |
| `atlas.workstation_status` | atlas | unknown | — | — | read_only |
| `atlas.feature_document_status` | atlas | unknown | feature_id | — | read_only |
| `atlas.populate_feature_documents` | atlas | synthesis | feature_id | — | read_only |
| `atlas.feature_document_ingestion_plan` | atlas | unknown | — | — | read_only |
| `atlas.feature_document_enrichment_plan` | atlas | unknown | source_ref | — | read_only |
| `atlas.materialize_feature_evidence_tuples` | atlas | unknown | source_ref, packet_key | — | read_only |
| `atlas.pos_concept_tagging` | atlas | unknown | — | — | read_only |
| `atlas.build_taxonomy_topology_packet` | atlas | graph | — | — | read_only |
| `karpathy.attention_rank_files` | karpathy | cache, dense, graph, synthesis | — | — | read_only |
| `karpathy.som_topology_stats` | karpathy | cache, graph | — | — | read_only |
| `topology.language_distribution` | topology | dense | — | — | read_only |
| `research.playbook_lookup_by_language` | research | graph | — | — | read_only |
| `context.build_ace_packet` | context | cache | — | — | read_only |
| `context.build_indexed_source_packet` | context | graph | source_ref | — | read_only |
| `service_workers.status` | service_workers | unknown | — | — | read_only |
| `service_workers.result` | service_workers | unknown | — | — | read_only |
| `miniforge.health` | miniforge | unknown | — | — | read_only |
| `miniforge.analyze` | miniforge | unknown | — | — | read_only |
| `domain.classify` | domain | unknown | — | — | read_only |
| `miniforge.extract` | miniforge | unknown | — | — | read_only |
| `shell.run` | shell | synthesis | — | — | read_only |

## Agent Decision Matrix

Use this matrix to route a query to the right tools without asking Gemma4 to decide.

| Query Shape | Start With | Then |
|-------------|-----------|------|
| "what is X?" | `atlas.source_refs`, `kag.feature_lookup` | `atlas.packet_search` |
| "fix X" | L1 rg + `atlas.packet_search` | `engram.chat_memory_recent`, `turbovec.rank_chunks` |
| "find files related to X" | `kag.multi_lane_search` | `ace.compact_search`, `graph.expand_neighborhood` |
| "have we done X before?" | `engram.chat_memory_recent` | `kag.recall_similar_fix` |
| "who depends on X?" | `graph.expand_neighborhood` | `graph.community_for_node`, `graph.pagerank_top` |
| "summarize X" | `atlas.packet_search` | `atlas.get_chunk`, then Gemma4 |
| "patch X" | Full pipeline (`/parent-atlas-patch`) | — |
