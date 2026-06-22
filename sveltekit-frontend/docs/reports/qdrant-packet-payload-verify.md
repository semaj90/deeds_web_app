# Qdrant Packet Payload Verify

Generated: 2026-06-21T22:17:48.878Z
Qdrant: http://127.0.0.1:6333
Collection: codebase_chunks_768
Sample limit: 25

## Summary

- Sample rows: 125
- Qdrant points found: 30
- Agreements: 0
- Mismatches: 30
- Missing points: 95
- Contradictions: 0
- Agreement pct: 0
- Point found pct: 24
- postgres_qdrant_no_contradictions: PASS

## Field Coverage

- source_ref: 22/125 (17.6%)
- feature_id: 23/125 (18.4%)
- feature_label: 13/125 (10.4%)
- qdrant_tag_id: 0/125 (0%)
- cluster_id: 2/125 (1.6%)
- community_id: 2/125 (1.6%)
- som_cluster: 0/125 (0%)
- domain_class: 8/125 (6.4%)
- domain: 0/125 (0%)
- neo4j_node: 0/125 (0%)
- metadata: 0/125 (0%)

## Sample

- src/mcp/tools/repair_tools.ts#sveltekit_import_boundary_check | point=n/a | matched=0/6
- src/mcp/server.ts#graph.index | point=n/a | matched=0/6
- src/mcp/server.ts#citations:search | point=n/a | matched=0/6
- src/mcp/server.ts#llm_synthesis.log_event | point=n/a | matched=0/6
- src/mcp/server.ts#agents_md | point=n/a | matched=0/6
- src/mcp/server.ts#codebase:search | point=n/a | matched=0/6
- src/mcp/server.ts#codebase:rg_search | point=n/a | matched=0/6
- src/mcp/server.ts#ace.wiki | point=n/a | matched=0/6
- src/lib/server/ai/llama-tool-definitions.ts#graph__community_for_node | point=n/a | matched=0/6
- src/mcp/server.ts#evidence:analyze | point=n/a | matched=0/6

## Contradictions

- none