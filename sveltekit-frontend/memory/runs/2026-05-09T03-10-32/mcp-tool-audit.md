# TRACE MCP Tool Audit — 2026-05-09T03-10-32

**Endpoint**: `http://127.0.0.1:8788/mcp`
**Tools discovered**: 51

## Summary

- ✅ PASS: 51
- ⚠️ SKIP (operator-gated or expected empty): 0
- ❌ FAIL: 0

## Results

| Tool | Status | Latency | Detail |
|------|--------|---------|--------|
| `graph.expand_neighborhood` | PASS | 42ms | {"content":[{"type":"text","text":"{\n  \"center\": \"file:src/lib/server/ace/co |
| `graph.shortest_path` | PASS | 16ms | {"content":[{"type":"text","text":"{\n  \"path\": null,\n  \"hops\": null,\n  \" |
| `graph.community_for_node` | PASS | 89ms | {"content":[{"type":"text","text":"{\n  \"stableKey\": \"file:src/lib/server/ace |
| `graph.pagerank_top` | PASS | 65ms | {"content":[{"type":"text","text":"[\n  {\n    \"stableKey\": \"src/lib/server/d |
| `graph.topological_sort` | PASS | 2ms | {"content":[{"type":"text","text":"MCP error -32602: Input validation error: Inv |
| `graph.materialize_pathway` | PASS | 1ms | {"content":[{"type":"text","text":"MCP error -32602: Input validation error: Inv |
| `topology.search_near` | PASS | 931ms | {"content":[{"type":"text","text":"{\n  \"ok\": true,\n  \"query\": \"redis cach |
| `topology.same_som_cluster` | PASS | 68ms | {"content":[{"type":"text","text":"{\"error\":\"Node not found in Postgres index |
| `topology.search_4d` | PASS | 4ms | {"content":[{"type":"text","text":"{\n  \"ok\": false,\n  \"source\": \"topology |
| `clusters.get_members` | PASS | 413ms | {"content":[{"type":"text","text":"{\n  \"clusterKey\": \"gpu:92\",\n  \"count\" |
| `trace.kag_search` | PASS | 135ms | {"content":[{"type":"text","text":"{\n  \"success\": true,\n  \"data\": [],\n  \ |
| `trace.explain_retrieval` | PASS | 4ms | {"content":[{"type":"text","text":"{\"error\":\"ReferenceError: require is not d |
| `search.postgres_fts` | PASS | 6ms | {"content":[{"type":"text","text":"{\n  \"results\": [],\n  \"count\": 0,\n  \"m |
| `search.hybrid` | PASS | 16ms | {"content":[{"type":"text","text":"{\n  \"results\": [],\n  \"count\": 0,\n  \"m |
| `search.go_hybrid` | PASS | 408ms | {"content":[{"type":"text","text":"{\n  \"ok\": true,\n  \"source\": \"go-search |
| `context.build_kv_packet` | PASS | 2ms | {"content":[{"type":"text","text":"{\"error\":\"ReferenceError: require is not d |
| `context.get_compressed_card` | PASS | 4ms | {"content":[{"type":"text","text":"{\"error\":\"ReferenceError: require is not d |
| `context.explain_compression` | PASS | 3ms | {"content":[{"type":"text","text":"{\"error\":\"ReferenceError: require is not d |
| `context.refresh_task_toc` | PASS | 2ms | {"content":[{"type":"text","text":"{\"error\":\"ReferenceError: require is not d |
| `search.dev_context` | PASS | 7ms | {"content":[{"type":"text","text":"{\n  \"success\": true,\n  \"data\": [],\n  \ |
| `kag.record_agent_run` | PASS | 6ms | {"content":[{"type":"text","text":"{\n  \"success\": true,\n  \"taskId\": \"smok |
| `kag.ingest_memory_directory` | PASS | 8ms | {"content":[{"type":"text","text":"{\n  \"ok\": true,\n  \"dryRun\": true,\n  \" |
| `kag.ingest_error` | PASS | 14ms | {"content":[{"type":"text","text":"{\n  \"errorHash\": \"4e5ba67a5efe86f2\",\n   |
| `kag.multi_lane_search` | PASS | 2417ms | {"content":[{"type":"text","text":"{\n  \"queryHash\": \"1619ea78ab79\",\n  \"la |
| `taxonomy.children` | PASS | 4ms | {"content":[{"type":"text","text":"MCP error -32602: Input validation error: Inv |
| `taxonomy.path` | PASS | 3ms | {"content":[{"type":"text","text":"MCP error -32602: Input validation error: Inv |
| `agents_md.peers_via_relations` | PASS | 2ms | {"content":[{"type":"text","text":"MCP error -32602: Input validation error: Inv |
| `agents_md.coverage_chain` | PASS | 4ms | {"content":[{"type":"text","text":"MCP error -32602: Input validation error: Inv |
| `clusters.get_summary_lenses` | PASS | 45ms | {"content":[{"type":"text","text":"{\"clusterId\":92,\"keyFiles\":[],\"kagNotes\ |
| `trace.validate_ace_hit` | PASS | 116ms | {"content":[{"type":"text","text":"{\n  \"filePath\": \"src/lib/server/ace/conte |
| `ops.propose_patch` | PASS | 4ms | {"content":[{"type":"text","text":"{\n  \"ok\": true,\n  \"file_path\": \"src/li |
| `ops.run_targeted_test` | PASS | 8ms | {"content":[{"type":"text","text":"{\n  \"ok\": false,\n  \"test_file\": \"tests |
| `ops.record_fix_attempt` | PASS | 9ms | {"content":[{"type":"text","text":"{\"ok\":true,\"fix_attempt_id\":\"18\",\"fix_ |
| `ops.run_quality_gate` | PASS | 6ms | {"content":[{"type":"text","text":"{\n  \"ok\": false,\n  \"gate\": \"tsc\",\n   |
| `hypergraph.search` | PASS | 3ms | {"content":[{"type":"text","text":"{\"ok\":false,\"error\":\"TypeError: fetch fa |
| `hypergraph.get_edge` | PASS | 3ms | {"content":[{"type":"text","text":"{\"ok\":false,\"error\":\"TypeError: fetch fa |
| `hypergraph.explain_activation` | PASS | 22ms | {"content":[{"type":"text","text":"{\n  \"edge\": null,\n  \"activatedByTerms\": |
| `hypergraph.expand_members` | PASS | 4ms | {"content":[{"type":"text","text":"{\"ok\":false,\"error\":\"TypeError: fetch fa |
| `knowledge.get_minified_map` | PASS | 3ms | {"content":[{"type":"text","text":"{\"ok\":false,\"error\":\"TypeError: fetch fa |
| `tools.batch_call` | PASS | 8ms | {"content":[{"type":"text","text":"{\n  \"ok\": 2,\n  \"total\": 2,\n  \"totalMs |
| `codebase.context_for_file` | PASS | 94ms | {"content":[{"type":"text","text":"{\n  \"filePath\": \"src/lib/server/ace/conte |
| `agents_md.context_for_file` | PASS | 8ms | {"content":[{"type":"text","text":"{\n  \"filePath\": \"src/lib/server/ace/conte |
| `agents_md.peers_for_dir` | PASS | 7ms | {"content":[{"type":"text","text":"{\n  \"found\": true,\n  \"key\": \"ace:atlas |
| `agents_md.coverage` | PASS | 19ms | {"content":[{"type":"text","text":"{\n  \"filePath\": \"src/lib/server/ace/conte |
| `agents_md.shares_tags` | PASS | 2ms | {"content":[{"type":"text","text":"MCP error -32602: Input validation error: Inv |
| `agents_md.binding_chain` | PASS | 3ms | {"content":[{"type":"text","text":"MCP error -32602: Input validation error: Inv |
| `hypergraph.semantic_path_synthesis` | PASS | 4ms | {"content":[{"type":"text","text":"MCP error -32602: Input validation error: Inv |
| `hypergraph.materialize_pathway` | PASS | 3ms | {"content":[{"type":"text","text":"MCP error -32602: Input validation error: Inv |
| `graph.search_pathway_cards` | PASS | 5ms | {"content":[{"type":"text","text":"[]"}]} |
| `kb.search_notecards` | PASS | 2ms | {"content":[{"type":"text","text":"MCP error -32602: Input validation error: Inv |
| `kb.explain_context_pack` | PASS | 2ms | {"content":[{"type":"text","text":"MCP error -32602: Input validation error: Inv |