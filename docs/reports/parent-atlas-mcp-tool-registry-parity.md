# Parent Atlas — MCP Tool Registry Parity Audit

Method: TypeScript compiler API AST parse of each target file. Not regex-based. Identifier-based dispatch conditions (e.g. name === SOME_CONST.name) resolved one import-hop where possible; unresolved ones are reported explicitly, not guessed.

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
| registerToolCalls | 119 |
| uniqueRegisterToolNames | 119 |

## Cross-file DUPLICATE_TOOL_NAME (7)
- `atlas.packet_search` in: mcp-server, trace-mcp-server
- `atlas.coverage` in: mcp-server, trace-mcp-server
- `clusters.get_summary_lenses` in: mcp-server, trace-mcp-server
- `wiki.status` in: mcp-server, trace-mcp-server
- `wiki.search` in: mcp-server, trace-mcp-server
- `wiki.explain_page` in: mcp-server, trace-mcp-server
- `wiki.refresh_directory` in: mcp-server, trace-mcp-server

## NOTE on registerTool()-based servers
`src/mcp/trace-mcp-server.ts` uses the MCP SDK high-level `registerTool(name, options, handler)` API, where listing and dispatch are the same call — LISTED_WITHOUT_HANDLER / HANDLER_WITHOUT_LISTING cannot occur for these entries by construction. The relevant risk classes for this file instead are: duplicate registrations (later one silently wins), a non-function handler argument, and unresolved (non-literal) tool names — all reported above where found.
