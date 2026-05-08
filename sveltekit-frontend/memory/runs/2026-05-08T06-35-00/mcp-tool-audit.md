# TRACE MCP Tool Audit — 2026-05-08T06-35-00

**Endpoint**: `http://127.0.0.1:8788/mcp`
**Tools discovered**: 44

## Summary

- ✅ PASS: 44
- ⚠️ SKIP (operator-gated or expected empty): 0
- ❌ FAIL: 0

## Results

| Tool | Status | Latency | Detail |
|------|--------|---------|--------|
| `graph.expand_neighborhood` | PASS | 72ms | {"content":[{"type":"text","text":"{\n  \"nodes\": [],\n  \"edges\": [],\n  \"to |
| `graph.shortest_path` | PASS | 237ms | {"content":[{"type":"text","text":"{\n  \"path\": null,\n  \"hops\": null,\n  \" |
| `graph.community_for_node` | PASS | 175ms | {"content":[{"type":"text","text":"{\n  \"stableKey\": \"file:src/lib/server/ace |
| `graph.pagerank_top` | PASS | 73ms | {"content":[{"type":"text","text":"[\n  {\n    \"stableKey\": \"src/lib/server/d |
| `topology.search_near` | PASS | 534ms | {"content":[{"type":"text","text":"{\n  \"ok\": true,\n  \"query\": \"redis cach |
| `topology.same_som_cluster` | PASS | 35ms | {"content":[{"type":"text","text":"{\"error\":\"Node not found in Postgres index |
| `topology.search_4d` | PASS | 5ms | {"content":[{"type":"text","text":"{\n  \"ok\": false,\n  \"source\": \"topology |
| `clusters.get_members` | PASS | 96ms | {"content":[{"type":"text","text":"{\n  \"clusterKey\": \"gpu:92\",\n  \"count\" |
| `trace.kag_search` | PASS | 132ms | {"content":[{"type":"text","text":"{\n  \"success\": true,\n  \"data\": [],\n  \ |
| `trace.explain_retrieval` | PASS | 21ms | {"content":[{"type":"text","text":"{\"message\":\"No cached retrieval trace foun |
| `search.postgres_fts` | PASS | 75ms | {"content":[{"type":"text","text":"{\n  \"results\": [],\n  \"count\": 0,\n  \"m |
| `search.hybrid` | PASS | 844ms | {"content":[{"type":"text","text":"{\n  \"results\": [],\n  \"count\": 0,\n  \"m |
| `search.go_hybrid` | PASS | 143ms | {"content":[{"type":"text","text":"{\n  \"ok\": true,\n  \"source\": \"go-search |
| `context.build_kv_packet` | PASS | 36ms | {"content":[{"type":"text","text":"{\n  \"taskId\": \"smoke_test_task_001\",\n   |
| `context.get_compressed_card` | PASS | 9ms | {"content":[{"type":"text","text":"{\n  \"stableKey\": \"file:src/lib/server/ace |
| `context.explain_compression` | PASS | 9ms | {"content":[{"type":"text","text":"{\n  \"taskId\": \"smoke_test_task_001\",\n   |
| `context.refresh_task_toc` | PASS | 13ms | {"content":[{"type":"text","text":"{\n  \"taskId\": \"smoke_test_task_001\",\n   |
| `search.dev_context` | PASS | 14ms | {"content":[{"type":"text","text":"{\n  \"success\": true,\n  \"data\": [],\n  \ |
| `kag.record_agent_run` | PASS | 8ms | {"content":[{"type":"text","text":"{\n  \"success\": true,\n  \"taskId\": \"smok |
| `kag.ingest_memory_directory` | PASS | 10ms | {"content":[{"type":"text","text":"{\n  \"ok\": true,\n  \"dryRun\": true,\n  \" |
| `kag.ingest_error` | PASS | 15ms | {"content":[{"type":"text","text":"{\n  \"errorHash\": \"4e5ba67a5efe86f2\",\n   |
| `kag.multi_lane_search` | PASS | 2421ms | {"content":[{"type":"text","text":"{\n  \"queryHash\": \"1619ea78ab79\",\n  \"la |
| `taxonomy.children` | PASS | 4ms | {"content":[{"type":"text","text":"MCP error -32602: Input validation error: Inv |
| `taxonomy.path` | PASS | 3ms | {"content":[{"type":"text","text":"MCP error -32602: Input validation error: Inv |
| `agents_md.peers_via_relations` | PASS | 2ms | {"content":[{"type":"text","text":"MCP error -32602: Input validation error: Inv |
| `agents_md.coverage_chain` | PASS | 1ms | {"content":[{"type":"text","text":"MCP error -32602: Input validation error: Inv |
| `clusters.get_summary_lenses` | PASS | 33ms | {"content":[{"type":"text","text":"{\"clusterId\":92,\"keyFiles\":[],\"kagNotes\ |
| `trace.validate_ace_hit` | PASS | 108ms | {"content":[{"type":"text","text":"{\n  \"filePath\": \"src/lib/server/ace/conte |
| `ops.propose_patch` | PASS | 3ms | {"content":[{"type":"text","text":"{\n  \"ok\": true,\n  \"file_path\": \"src/li |
| `ops.run_targeted_test` | PASS | 10ms | {"content":[{"type":"text","text":"{\n  \"ok\": false,\n  \"test_file\": \"tests |
| `ops.record_fix_attempt` | PASS | 6ms | {"content":[{"type":"text","text":"{\"ok\":true,\"fix_attempt_id\":\"10\",\"fix_ |
| `ops.run_quality_gate` | PASS | 6ms | {"content":[{"type":"text","text":"{\n  \"ok\": false,\n  \"gate\": \"tsc\",\n   |
| `hypergraph.search` | PASS | 84ms | {"content":[{"type":"text","text":"{\n  \"results\": [],\n  \"totalMatched\": 0, |
| `hypergraph.get_edge` | PASS | 140ms | {"content":[{"type":"text","text":"{\"ok\":false,\"error\":\"edge not found\",\" |
| `hypergraph.explain_activation` | PASS | 23ms | {"content":[{"type":"text","text":"{\n  \"edge\": null,\n  \"activatedByTerms\": |
| `hypergraph.expand_members` | PASS | 28ms | {"content":[{"type":"text","text":"{\"ok\":false,\"error\":\"edge not found\"}"} |
| `knowledge.get_minified_map` | PASS | 81ms | {"content":[{"type":"text","text":"{\n  \"directory\": \"src/lib/server/ace\",\n |
| `tools.batch_call` | PASS | 12ms | {"content":[{"type":"text","text":"{\n  \"ok\": 2,\n  \"total\": 2,\n  \"totalMs |
| `codebase.context_for_file` | PASS | 81ms | {"content":[{"type":"text","text":"{\n  \"filePath\": \"src/lib/server/ace/conte |
| `agents_md.context_for_file` | PASS | 8ms | {"content":[{"type":"text","text":"{\n  \"filePath\": \"src/lib/server/ace/conte |
| `agents_md.peers_for_dir` | PASS | 7ms | {"content":[{"type":"text","text":"{\n  \"found\": true,\n  \"key\": \"ace:atlas |
| `agents_md.coverage` | PASS | 18ms | {"content":[{"type":"text","text":"{\n  \"filePath\": \"src/lib/server/ace/conte |
| `agents_md.shares_tags` | PASS | 2ms | {"content":[{"type":"text","text":"MCP error -32602: Input validation error: Inv |
| `agents_md.binding_chain` | PASS | 1ms | {"content":[{"type":"text","text":"MCP error -32602: Input validation error: Inv |