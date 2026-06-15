# MCP Tool Ontology

**Generated**: 2026-06-15T21:17:41.878Z  
**Source**: http://127.0.0.1:8788/mcp  
**Total tools**: 128  

## Retrieval Layer Routing Table

This is the canonical routing table for OpenCode. Use the layer that matches the query shape.

### IDENTITY

- `atlas.query`
- `atlas.source_refs`
- `kag.feature_lookup`
- `atlas.packet_search`
- `atlas:packet_search`

### MEMORY

- `engram.chat_memory_store`
- `engram.chat_memory_recent`
- `kag.recall_similar_fix`

### CACHE

- `legal.transcribe_video`
- `legal.check_services`
- `engram.ace_packet_inject`
- `engram.chat_memory_store`
- `engram.redis_health`
- `wiki.status`
- `wiki.search`
- `ops.update_LLMS.md`
- `ops.fixer_semantic_recall`
- `evidence.image_feedback`
- `ops.gpu_attention`
- `ace.compact_search`

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
- `atlas:packet_search`
- `atlas.coverage`
- `atlas:verify_coverage`

### GRAPH

- `context.prefetch_feature_context`
- `atlas.compact_context`
- `atlas.explain_trace`
- `legal.check_services`
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
- `atlas:packet_search`

### RERANK

- `turbovec.rank_chunks`
- `search.rerank`
- `trace.graphrag_search`
- `search.go_hybrid`
- `ops.gpu_attention`
- `atlas.prefilter`
- `atlas.coverage`
- `atlas:verify_coverage`

### SYNTHESIS

- `kb.archive_synthesis`
- `legal.cross_examine`
- `legal.build_timeline`
- `legal.issue_spotter`
- `legal.mock_trial`
- `engram.ace_packet_inject`
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

### OPS

- `ops.execute_graphify`
- `ops.trust_audit`
- `ops.propose_patch`
- `ops.run_targeted_test`
- `ops.record_fix_attempt`
- `ops.run_quality_gate`
- `ops.update_LLMS.md`
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
- `topology.search_near`
- `topology.same_som_cluster`
- `kb.hybrid_search`
- `kb.search_summary_tree`
- `kb.search_notecards`
- `trace.system_health`
- `topology.search_4d`
- `clusters.get_members`
- `trace.explain_retrieval`
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
- `trace.validate_ace_hit`
- `knowledge.get_minified_map`
- `tools.batch_call`
- `codebase.context_for_file`
- `runtime.simdjson_status`
- `runtime.quic_status`

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
| `engram.chat_memory_store` | engram | cache, memory | — | engram | read_write |
| `engram.redis_health` | engram | cache | — | redis | read_write |
| `topology.hydration_status` | topology | unknown | — | — | read_only |
| `topology.recompute_manifold_plan` | topology | unknown | — | — | read_only |
| `db.schema_overview` | db | read | — | postgres | read_write |
| `db.table_inspect` | db | read | — | postgres | read_write |
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
| `atlas:packet_search` | atlas | dense, graph, identity | feature_id, source_ref | — | read_only |
| `atlas.coverage` | atlas | dense, rerank | feature_id, source_ref | postgres | read_write |
| `atlas:verify_coverage` | atlas | dense, rerank | feature_id, source_ref | — | read_only |

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
