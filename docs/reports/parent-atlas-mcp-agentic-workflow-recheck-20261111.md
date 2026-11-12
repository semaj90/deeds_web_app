# Parent Atlas MCP and Evidence Recheck

**Date:** 2026-11-11
**Mode:** static source review + isolated contract tests
**MCP use:** read-only Atlas context/inspection only (`writesPerformed: false`); no TRACE `ops.*` calls or write-capable MCP tools. No database, cache, service, Kanban, or live VRAM-request writes. The contract test writes only to temporary fixture directories.

## Ledger Reconciliation

- `2c` is the operator-token authentication test result; it does not define the VRAM request schema.
- `2d` records option 1: production records include `requestId`, `actorContext`, `operation`, and `targetScope`; `testOnly` is emitted only by an explicitly test-configured handler writing to a disposable sink.
- Current test command: `cd sveltekit-frontend && node --test scripts/mcp/atlas-tools-mcp.vram-request-contract.test.mjs` — **8/8 passed**.
- Current request module SHA-256: `2d3fc6b0f59a276a8767a032a368818d20d48db46504a626f9808948dbc0c28a`.
- Current test source SHA-256: `251dc4008f337a91b83c83710759696f87b4f2d520db40af27be587f9e6d6b3b`.
- The 2026-11-09 test receipt remains historical because its recorded test-source hash differs. No live request canary was run. Idempotency is process-local: identical retries return the stored record; reuse with a changed operation, reason, demand, or scope fails closed.

## Bounded Evidence Score

The available five-factor report is a dated 2026-11-09 snapshot, not a current completion authority. Its weights are 30/25/20/15/10 for acceptance, source binding, independent verification, reproducibility/recency, and dependency closure. Across 62 task rows, 0 have admitted proof receipts, 0 are `PROVEN`, acceptance is unscorable for all 62, and evidence-verified completion is 0%. Its 35/100 maximum is evidence support only; missing criteria/evidence mappings must remain unscorable, not be imputed. An extractor may propose evidence claims, but deterministic source/revision checks and canonical Kanban execution, verification, and receipt gates control completion. The new isolated 8/8 contract test is not a task-bound receipt, so it does not raise task completion.

The WFU-09 source-binding audit reports 4,077/4,077 task blocks bound with zero binding failures. Its dependency scan found 18 references: 7 unique, 2 ambiguous, and 9 unresolved. These are review cues only; no edges are inferred and scheduler admission remains closed.

## Web Search Provider

Current source does not use Ollama as a web-search provider. The shared `webSearch` adapter tries configured SearXNG, then DuckDuckGo; `/api/websearch`, `/api/web/search`, and the agent web-search tool use that adapter. The LDR client uses SearXNG for search and its separate acquisition path can fall back to the evidence sidecar, crawler, Firecrawl, or native fetch. This is a source-level finding, not a live provider-health check or proof of when the implementation changed. Ollama remains present in other AI and embedding paths.

- [Shared SearXNG/DuckDuckGo adapter](../../sveltekit-frontend/src/lib/server/retrieval/web-search.ts#L21)
- [Web-search API route](../../sveltekit-frontend/src/routes/api/websearch/+server.ts#L6)
- [Agent web-search tool](../../sveltekit-frontend/src/lib/server/agent/tools/web-search.ts#L1)
- [LDR search and acquisition client](../../sveltekit-frontend/src/lib/server/ldr/web-search-client.ts#L31)

## Source-Qualified Tool Inventory

Classifications below distinguish handler behavior from whole TRACE invocation behavior. `trace-mcp-server.ts` SHA-256 at this recheck: `a6604ba993039a8b8c06405e9f3479efd52c1947d88148d6f022ba42cb12b370`.

| Tool(s) | Handler classification | Actual source effects / disposition | Source |
|---|---|---|---|
| `ops.search_tools`, `ops.inspect_tool_contract`, `ops.validate_tool_call` | READ | Search in-memory catalog, inspect contracts, or preflight arguments. TRACE's registration wrapper records successful and failed invocations to Engram, so calls have an additional persistence side effect. Not invoked. | [registrations](../../sveltekit-frontend/src/mcp/trace-mcp-server.ts#L7286), [invocation wrapper](../../sveltekit-frontend/src/mcp/trace-mcp-server.ts#L1183) |
| `ops.propose_patch` | Operator-gated READ preview | Reads source and returns a preview; does not apply the patch. Invocation telemetry persists. | [handler and contract](../../sveltekit-frontend/src/mcp/trace-mcp-server.ts#L5850) |
| `ops.record_fix_attempt` | Operator-gated WRITE | Persists fix-attempt metadata to PostgreSQL; registration wrapper also records Engram telemetry. Not invoked. | [handler](../../sveltekit-frontend/src/mcp/trace-mcp-server.ts#L6018), [invocation wrapper](../../sveltekit-frontend/src/mcp/trace-mcp-server.ts#L1183) |
| `ops.run_targeted_test`, `ops.run_quality_gate` | Operator-gated EXEC | Starts a process; test code may itself have effects; registration wrapper also records Engram telemetry. Not invoked. | [targeted-test handler](../../sveltekit-frontend/src/mcp/trace-mcp-server.ts#L5918), [formal contract](../../sveltekit-frontend/src/mcp/trace-mcp-server.ts#L7176), [invocation wrapper](../../sveltekit-frontend/src/mcp/trace-mcp-server.ts#L1183) |
| `ops.fixer_semantic_recall` | READ handler | Reads fixer memory through Redis/PostgreSQL/Qdrant; TRACE invocation telemetry persists. Not invoked. | [handler](../../sveltekit-frontend/src/mcp/trace-mcp-server.ts#L7877), [invocation wrapper](../../sveltekit-frontend/src/mcp/trace-mcp-server.ts#L1183) |
| `ops.fixer_pattern_store` | Operator-gated WRITE | Writes PostgreSQL and Redis fixer memory; may update Qdrant; registration wrapper also records Engram telemetry. Not invoked. | [TRACE handler](../../sveltekit-frontend/src/mcp/trace-mcp-server.ts#L7943), [registry entry](mcp-tool-registry-index.json), [Postgres write](../../sveltekit-frontend/src/lib/server/fixer/fixer-memory.ts#L200) |
| `ops.gpu_attention`, `ops.gpu_pagerank`, `ops.gpu_topk` | Operator-gated, persistence-capable compute | Formal contract marks WRITE; GPU/resource telemetry is persisted. Telemetry does not prove CUDA execution. Not invoked. | [formal contracts](../../sveltekit-frontend/src/mcp/trace-mcp-server.ts#L7224), [attention handler](../../sveltekit-frontend/src/mcp/trace-mcp-server.ts#L9043), [telemetry audit](parent-atlas-mcp-agentic-workflow-review-v1.json) |
| `atlas.materialize_feature_evidence_tuples` | READ handler | Bounded canonical-source reads and `writesPerformed: false`; TRACE invocation telemetry still persists. Not invoked. | [handler](../../sveltekit-frontend/src/mcp/trace-mcp-server.ts#L10608), [invocation wrapper](../../sveltekit-frontend/src/mcp/trace-mcp-server.ts#L1183) |
| `atlas.graph.pagerank` | READ handler | Reads a graph projection; ranks do not establish canonical identity. TRACE invocation telemetry persists. | [handler](../../sveltekit-frontend/src/mcp/trace-mcp-server.ts#L10311) |
| `gpu_vram_status` | READ | Reads `nvidia-smi` and llama-server `/slots`; no lifecycle action. | [handler](../../sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs#L380) |
| `gpu_request_vram_release` | Local WRITE, request-only | Appends an idempotent request record; does not stop a process. Human-operated lifecycle remains required. | [handler](../../sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs#L455), [contract tests](../../sveltekit-frontend/scripts/mcp/atlas-tools-mcp.vram-request-contract.test.mjs#L77) |
| Viterbi routing | Not found as callable registration | Challenger only until evaluation and dispatch contracts are proven. | [prior bounded audit](parent-atlas-mcp-agentic-workflow-review-v1.json) |

The live session did not expose callable `ops.search_tools` or `ops.inspect_tool_contract` handles. The `mcporter` executable and root/app `node_modules/.bin` entries are also absent, so no alternate MCP client was available. They were therefore not called; no client was installed and no direct HTTP bypass was attempted. The inventory above is source-only, not a live `tools/list` or process-revision proof. The prior v1 static report's TRACE-source hash (`4a9bfa17503ae51d7253f23852b3af9b464f09b13e41cabcaa5163dfff11a116`) is stale; its hardcoded output path was not overwritten.

## Post-review correction (2026-11-11)

The three requested TRACE tools now declare MCP annotations with `readOnlyHint: false`. The existing ontology input and generated registry were corrected: `ops.run_targeted_test` = PROCESS + Engram; `ops.record_fix_attempt` = PostgreSQL + Engram; `ops.fixer_pattern_store` = PostgreSQL + Redis + Qdrant + Engram. The index builder ran with its local-model base deliberately pointed at a closed loopback port, so it used deterministic summaries and did not contact `:8090`. `npm run check:fast` passed after the annotation edits; the existing VRAM request contract suite passed 8/8. This proves source/type consistency and the unrelated request contract, not generated `tools/list` schema exchange.

**Evidence states:** `SOURCE_EXISTS=YES`; `SCHEMA_VALID=SOURCE_TYPED_ONLY` (no live/generated MCP `tools/list` snapshot); `DISPATCH_ENFORCED=NOT_PROVEN` (direct registrations do not share one verified authoritative dispatcher); `TEST_PROVEN=NO` for invocation behavior (no TRACE tool calls); `LIVE_PROVEN=NO`. The global wrapper's Engram write means handler-level READ is not whole-invocation read-only. Do not use registry hints as an authorization boundary.

Source SHA-256 after correction: `sveltekit-frontend/src/mcp/trace-mcp-server.ts` `c1df829d6a0180723bcded54ef06dea1e40601367fbe564764518c5f552afdbd`; `docs/reports/mcp-tool-ontology.json` `5670d7e61041bad07b68d35054e1d1ed906a117922ddd55120de9ca1793ba829`; generated `docs/reports/mcp-tool-registry-index.json` `68bfe8a369781af6c0c9c353641d40383775e1dcee50b7b5e9f1c3fb84750cdf`.

## Evidence References

- [TRACE MCP registrations, contracts, and dispatch](../../sveltekit-frontend/src/mcp/trace-mcp-server.ts#L1183)
- [VRAM request implementation](../../sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs#L380)
- [VRAM request contract tests](../../sveltekit-frontend/scripts/mcp/atlas-tools-mcp.vram-request-contract.test.mjs#L1)
- [Current task ledger](../../sveltekit-frontend/openspec/changes/parent-atlas-gpu-compute-lanes-consolidation/tasks.md#L82)
- [Prior static inventory and evidence audit](parent-atlas-mcp-agentic-workflow-review-v1.json)
- [Prior bounded five-factor score snapshot](../../.tmp/atlas/five-factor-task-evidence-20261109.json)
- [WFU-09 dependency-cue report](wfu09-ns9-actionable-dependency-candidates-v1.json)
