# TRACE MCP Tool Audit — 2026-05-07T23-33-32

**Endpoint**: `http://127.0.0.1:8788/mcp`
**Tools discovered**: 33

## Summary

- ✅ PASS: 33
- ⚠️ SKIP (operator-gated or expected empty): 0
- ❌ FAIL: 0

## Results

| Tool | Status | Latency | Detail |
|------|--------|---------|--------|
| `graph.expand_neighborhood` | PASS | 469ms | {"content":[{"type":"text","text":"{\n  \"nodes\": [],\n  \"edges\": [],\n  \"to |
| `graph.shortest_path` | PASS | 354ms | {"content":[{"type":"text","text":"{\n  \"path\": null,\n  \"hops\": null,\n  \" |
| `graph.community_for_node` | PASS | 30ms | {"content":[{"type":"text","text":"{\n  \"stableKey\": \"file:src/lib/server/ace |
| `graph.pagerank_top` | PASS | 105ms | {"content":[{"type":"text","text":"[]"}]} |
| `topology.search_near` | PASS | 503ms | {"content":[{"type":"text","text":"{\n  \"ok\": true,\n  \"query\": \"redis cach |
| `topology.same_som_cluster` | PASS | 23ms | {"content":[{"type":"text","text":"{\"error\":\"Node not found in Postgres index |
| `topology.search_4d` | PASS | 4ms | {"content":[{"type":"text","text":"{\n  \"ok\": false,\n  \"source\": \"topology |
| `clusters.get_members` | PASS | 10ms | {"content":[{"type":"text","text":"{\n  \"clusterKey\": \"gpu:92\",\n  \"count\" |
| `trace.kag_search` | PASS | 9ms | {"content":[{"type":"text","text":"{\n  \"success\": true,\n  \"data\": [],\n  \ |
| `trace.explain_retrieval` | PASS | 10ms | {"content":[{"type":"text","text":"{\"message\":\"No cached retrieval trace foun |
| `search.postgres_fts` | PASS | 84ms | {"content":[{"type":"text","text":"{\n  \"results\": [],\n  \"count\": 0,\n  \"m |
| `search.hybrid` | PASS | 719ms | {"content":[{"type":"text","text":"{\n  \"results\": [],\n  \"count\": 0,\n  \"m |
| `search.go_hybrid` | PASS | 285ms | {"content":[{"type":"text","text":"{\n  \"ok\": true,\n  \"source\": \"go-search |
| `context.build_kv_packet` | PASS | 27ms | {"content":[{"type":"text","text":"{\n  \"taskId\": \"smoke_test_task_001\",\n   |
| `context.get_compressed_card` | PASS | 6ms | {"content":[{"type":"text","text":"{\n  \"stableKey\": \"file:src/lib/server/ace |
| `context.explain_compression` | PASS | 7ms | {"content":[{"type":"text","text":"{\n  \"taskId\": \"smoke_test_task_001\",\n   |
| `context.refresh_task_toc` | PASS | 7ms | {"content":[{"type":"text","text":"{\n  \"taskId\": \"smoke_test_task_001\",\n   |
| `search.dev_context` | PASS | 8ms | {"content":[{"type":"text","text":"{\n  \"success\": true,\n  \"data\": [],\n  \ |
| `kag.record_agent_run` | PASS | 5ms | {"content":[{"type":"text","text":"{\n  \"success\": true,\n  \"taskId\": \"smok |
| `kag.ingest_memory_directory` | PASS | 9ms | {"content":[{"type":"text","text":"{\n  \"ok\": true,\n  \"dryRun\": true,\n  \" |
| `kag.ingest_error` | PASS | 10ms | {"content":[{"type":"text","text":"{\n  \"errorHash\": \"4e5ba67a5efe86f2\",\n   |
| `kag.multi_lane_search` | PASS | 2690ms | {"content":[{"type":"text","text":"{\n  \"queryHash\": \"1619ea78ab79\",\n  \"la |
| `clusters.get_summary_lenses` | PASS | 34ms | {"content":[{"type":"text","text":"{\"clusterId\":92,\"keyFiles\":[],\"kagNotes\ |
| `trace.validate_ace_hit` | PASS | 31ms | {"content":[{"type":"text","text":"{\n  \"filePath\": \"src/lib/server/ace/conte |
| `ops.propose_patch` | PASS | 3ms | {"content":[{"type":"text","text":"{\n  \"ok\": true,\n  \"file_path\": \"src/li |
| `ops.run_targeted_test` | PASS | 10ms | {"content":[{"type":"text","text":"{\n  \"ok\": false,\n  \"test_file\": \"tests |
| `ops.record_fix_attempt` | PASS | 4ms | {"content":[{"type":"text","text":"{\"ok\":true,\"fix_attempt_id\":\"3\",\"fix_t |
| `ops.run_quality_gate` | PASS | 7ms | {"content":[{"type":"text","text":"{\n  \"ok\": false,\n  \"gate\": \"tsc\",\n   |
| `hypergraph.search` | PASS | 156ms | {"content":[{"type":"text","text":"{\n  \"results\": [],\n  \"totalMatched\": 0, |
| `hypergraph.get_edge` | PASS | 10ms | {"content":[{"type":"text","text":"{\"ok\":false,\"error\":\"edge not found\",\" |
| `hypergraph.explain_activation` | PASS | 18ms | {"content":[{"type":"text","text":"{\n  \"edge\": null,\n  \"activatedByTerms\": |
| `hypergraph.expand_members` | PASS | 31ms | {"content":[{"type":"text","text":"{\"ok\":false,\"error\":\"edge not found\"}"} |
| `knowledge.get_minified_map` | PASS | 35ms | {"content":[{"type":"text","text":"{\n  \"directory\": \"src/lib/server/ace\",\n |