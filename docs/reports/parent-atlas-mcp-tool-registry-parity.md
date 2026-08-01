# Parent Atlas — MCP Tool Registry Parity Audit

Method: TypeScript compiler API AST parse of each target file. Not regex-based. Identifier-based dispatch conditions (e.g. name === SOME_CONST.name) resolved one import-hop where possible; unresolved ones are reported explicitly, not guessed.

## sveltekit-frontend/src/lib/server/mcp/server.ts (array-literal + if-chain)

| Metric | Count |
|---|---|
| arrayLiteralToolsListed | 85 |
| uniqueListedNames | 85 |
| switchCaseDispatch | 89 |
| ifChainDispatch | 18 |
| registerToolCalls | 0 |
| uniqueRegisterToolNames | 0 |

### HANDLER_WITHOUT_LISTING (21)
- `identity:quarantine`
- `identity:recover`
- `envelope:validate`
- `mirror:sync_qdrant`
- `mirror:sync_neo4j`
- `graph:expand`
- `retrieval:rerank`
- `answer:synthesize`
- `escalation:route`
- `atlas.discover`
- `atlas.retrieve`
- `atlas.build_context`
- `atlas.inspect_runtime`
- `atlas.apply_change`
- `atlas.validate_change`
- `atlas.delegate`
- `phase109a_archive_signal`
- `phase109a_supersede_signal`
- `phase109a_promote_recommendation`
- `phase109a_query_signal_history`
- `phase109a_validate_state_transition`

### UNRESOLVED dispatch conditions — needs manual/deeper trace (1)
- `LDR_RESEARCH_TOOL.name` at line 5735

## sveltekit-frontend/src/mcp/server.ts (array-literal + switch)

| Metric | Count |
|---|---|
| arrayLiteralToolsListed | 85 |
| uniqueListedNames | 85 |
| switchCaseDispatch | 89 |
| ifChainDispatch | 18 |
| registerToolCalls | 0 |
| uniqueRegisterToolNames | 0 |

### HANDLER_WITHOUT_LISTING (22)
- `identity:quarantine`
- `identity:recover`
- `envelope:validate`
- `mirror:sync_qdrant`
- `mirror:sync_neo4j`
- `graph:expand`
- `retrieval:rerank`
- `answer:synthesize`
- `escalation:route`
- `atlas.discover`
- `atlas.retrieve`
- `atlas.build_context`
- `atlas.inspect_runtime`
- `atlas.apply_change`
- `atlas.validate_change`
- `atlas.delegate`
- `phase109a_archive_signal`
- `phase109a_supersede_signal`
- `phase109a_promote_recommendation`
- `phase109a_query_signal_history`
- `phase109a_validate_state_transition`
- `ldr_research`

## sveltekit-frontend/src/mcp/trace-mcp-server.ts (registerTool() calls)

| Metric | Count |
|---|---|
| arrayLiteralToolsListed | 0 |
| uniqueListedNames | 0 |
| switchCaseDispatch | 0 |
| ifChainDispatch | 0 |
| registerToolCalls | 117 |
| uniqueRegisterToolNames | 117 |

## Cross-file DUPLICATE_TOOL_NAME (85)
- `cases:load` in: lib-server-mcp, mcp-server
- `rag:search` in: lib-server-mcp, mcp-server
- `rag:index_page` in: lib-server-mcp, mcp-server
- `memory:prior_answer_lookup` in: lib-server-mcp, mcp-server
- `playwright:browser_action` in: lib-server-mcp, mcp-server
- `transcribe_audio` in: lib-server-mcp, mcp-server
- `evidence:analyze` in: lib-server-mcp, mcp-server
- `evidence:analyze_multimodal` in: lib-server-mcp, mcp-server
- `evidence:detect_objects` in: lib-server-mcp, mcp-server
- `evidence:transcribe_gpu` in: lib-server-mcp, mcp-server
- `evidence:search_similar` in: lib-server-mcp, mcp-server
- `cases:create` in: lib-server-mcp, mcp-server
- `cases:update` in: lib-server-mcp, mcp-server
- `cases:delete` in: lib-server-mcp, mcp-server
- `citations:search` in: lib-server-mcp, mcp-server
- `citations:list_by_case` in: lib-server-mcp, mcp-server
- `citations:add_to_case` in: lib-server-mcp, mcp-server
- `reports:list` in: lib-server-mcp, mcp-server
- `reports:create` in: lib-server-mcp, mcp-server
- `reports:generate_from_template` in: lib-server-mcp, mcp-server
- `reports:update` in: lib-server-mcp, mcp-server
- `reports:delete` in: lib-server-mcp, mcp-server
- `reports:export` in: lib-server-mcp, mcp-server
- `embedding:generate` in: lib-server-mcp, mcp-server
- `gpu:similarity` in: lib-server-mcp, mcp-server
- `inference:route` in: lib-server-mcp, mcp-server
- `startup:briefing` in: lib-server-mcp, mcp-server
- `atlas.packet_search` in: lib-server-mcp, mcp-server, trace-mcp-server
- `atlas.coverage` in: lib-server-mcp, mcp-server, trace-mcp-server
- `schema-dependents:find` in: lib-server-mcp, mcp-server
- `LLMS.md` in: lib-server-mcp, mcp-server
- `codebase:search` in: lib-server-mcp, mcp-server
- `codebase:ace_context` in: lib-server-mcp, mcp-server
- `phase18_reranker` in: lib-server-mcp, mcp-server
- `atlas.identity_audit` in: lib-server-mcp, mcp-server
- `atlas.cross_store_proof` in: lib-server-mcp, mcp-server
- `codebase:explain_cluster` in: lib-server-mcp, mcp-server
- `codebase:get_buffer` in: lib-server-mcp, mcp-server
- `langextract:legal` in: lib-server-mcp, mcp-server
- `langextract:evidence` in: lib-server-mcp, mcp-server
- `langextract:file` in: lib-server-mcp, mcp-server
- `langextract:custom` in: lib-server-mcp, mcp-server
- `compose:pipeline` in: lib-server-mcp, mcp-server
- `codebase:file_intel` in: lib-server-mcp, mcp-server
- `codebase:graph_neighbors` in: lib-server-mcp, mcp-server
- `codebase:graph_traverse` in: lib-server-mcp, mcp-server
- `topology_search` in: lib-server-mcp, mcp-server
- `analytics:deep_research` in: lib-server-mcp, mcp-server
- `analytics:research_topics` in: lib-server-mcp, mcp-server
- `codebase:rg_search` in: lib-server-mcp, mcp-server
- `analytics:mapreduce_matrix` in: lib-server-mcp, mcp-server
- `analytics:unified_research` in: lib-server-mcp, mcp-server
- `analytics:codebase_research` in: lib-server-mcp, mcp-server
- `codebase:concurrent_research` in: lib-server-mcp, mcp-server
- `analytics:web_research` in: lib-server-mcp, mcp-server
- `face:identify` in: lib-server-mcp, mcp-server
- `poi:face_synth` in: lib-server-mcp, mcp-server
- `codeintel.health` in: lib-server-mcp, mcp-server
- `cluster.summary.get` in: lib-server-mcp, mcp-server
- `cluster.summary.refresh` in: lib-server-mcp, mcp-server
- `clusters.get_summary_lenses` in: lib-server-mcp, mcp-server, trace-mcp-server
- `chunk.lookup` in: lib-server-mcp, mcp-server
- `codebase:export_bundle` in: lib-server-mcp, mcp-server
- `codeintel.fix_recommend` in: lib-server-mcp, mcp-server
- `codeintel.ace.context` in: lib-server-mcp, mcp-server
- `graph.index` in: lib-server-mcp, mcp-server
- `graph.status` in: lib-server-mcp, mcp-server
- `ace.wiki` in: lib-server-mcp, mcp-server
- `research:github_search` in: lib-server-mcp, mcp-server
- `research:reddit_search` in: lib-server-mcp, mcp-server
- `research:search_chunks` in: lib-server-mcp, mcp-server
- `kb.search_cards` in: lib-server-mcp, mcp-server
- `kb.search_schema_contract` in: lib-server-mcp, mcp-server
- `kb.get_card` in: lib-server-mcp, mcp-server
- `kb.expand_neighbors` in: lib-server-mcp, mcp-server
- `kb.explain_retrieval` in: lib-server-mcp, mcp-server
- `kb.rg_atlas_search` in: lib-server-mcp, mcp-server
- `ast:cross_language` in: lib-server-mcp, mcp-server
- `wiki.status` in: lib-server-mcp, mcp-server, trace-mcp-server
- `wiki.search` in: lib-server-mcp, mcp-server, trace-mcp-server
- `wiki.explain_page` in: lib-server-mcp, mcp-server, trace-mcp-server
- `wiki.refresh_directory` in: lib-server-mcp, mcp-server, trace-mcp-server
- `vlm:switch_mode` in: lib-server-mcp, mcp-server
- `llm_synthesis.log_event` in: lib-server-mcp, mcp-server
- `agents_md` in: lib-server-mcp, mcp-server

## NOTE on registerTool()-based servers
`src/mcp/trace-mcp-server.ts` uses the MCP SDK high-level `registerTool(name, options, handler)` API, where listing and dispatch are the same call — LISTED_WITHOUT_HANDLER / HANDLER_WITHOUT_LISTING cannot occur for these entries by construction. The relevant risk classes for this file instead are: duplicate registrations (later one silently wins), a non-function handler argument, and unresolved (non-literal) tool names — all reported above where found.
