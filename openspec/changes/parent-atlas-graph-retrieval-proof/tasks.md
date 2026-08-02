# OpenSpec: Parent Atlas Graph Retrieval Proof Tasks

## GS1.9 - Inventory identity fields

- [x] Inventory identity fields across `atlas_tree_nodes`, `atlas_packets`, `graphify_files`, `graphify_symbols`, `graphify_edges`, and the topology tables.
- [ ] Record which fields are stable keys, which are version-bound occurrences, and which are derived projections.
- [ ] Verify the live join semantics for packet-to-tree and packet-to-symbol links.
- [ ] Validation commands:
  - `node scripts/atlas/audit-tree-nodes.mjs --verbose`
  - `node scripts/atlas/backfill-tree-nodes.mjs --dry-run --limit=100`
  - `node scripts/atlas/phase1-tree-node-derivation.mjs --dry-run --limit=5000`

## GS1.10 - Separate identity contracts

- [ ] Define separate contracts for `parse_node_id`, `symbol_id`, `symbol_version_id`, `chunk_id`, `packet_key`, `concept_id`, and `graph_node_key`.
- [ ] Keep `tree_node_id` as a provisional structural field until the separate contracts are proven live.
- [ ] Do not relax `atlas_graph_nodes_v2_tree_node_unique` until the split identity model is implemented and tested.
- [ ] Current evidence:
  - `packages/parent-atlas/src/adapters/neo4j.ts` still writes `tree_node_id` into Neo4j packet nodes.
  - `packages/parent-atlas/src/adapters/qdrant.ts` still writes `tree_node_id` into Qdrant payloads.
  - `packages/parent-atlas/src/pipelines/backfill-topology-index.ts` still consumes `tree_node_id` for topology rows.
  - No live `symbol_version_id` or `parse_node_id` contract was found in the package scan.
- [ ] Inventory snapshot:
  - `graphify_files`: source identity candidate keyed by `file_id` and revision-scoped by `workspace_id + source_ref + source_revision`.
  - `graphify_symbols`: stable symbol candidate keyed by `symbol_id` and `stable_symbol_key`.
  - `graphify_edges`: edge row identity keyed by `edge_id`; endpoint stability still depends on symbol identity proof.
  - `atlas_packets`: canonical packet row keyed by `packet_key`.
  - `atlas_tree_nodes`: provisional structural inventory keyed by `node_id`, not canonical graph identity.
  - `codebase_chunk_index`: retrieval chunk mirror keyed by `id` / `chunk_id` / `source_ref`.
  - `atlas_packet_registry`: hot packet registry / projection keyed by `packet_key`.
  - `atlas_representation_records`: representation lineage ledger keyed by `packet_id + representation_id + representation_revision`.
  - `atlas_topology_index`: topology projection keyed by `packet_key`.
- [ ] Identity status labels:
  - `GRAPHIFY_FILE_IDENTITY` `PARTIAL`
  - `CROSS_REVISION_FILE_ID` `NOT_PROVEN`
  - `GRAPHIFY_SYMBOL_ID_EXISTS` `PASS`
  - `GRAPHIFY_SYMBOL_ID_CROSS_REVISION` `NOT_PROVEN`
  - `STABLE_SYMBOL_KEY_FORMULA` `NOT_PROVEN`
  - `GRAPHIFY_EDGE_ROW_IDENTITY` `PASS`
  - `GRAPHIFY_EDGE_ENDPOINT_STABILITY` `NOT_PROVEN`
  - `TREE_NODE_VERSION_IDENTITY` `PROVEN`
  - `PACKET_TREE_LINK_SEMANTICS` `PARTIAL_PROVEN`
  - `IDENTITY_DERIVATION_PROOF` `IN_PROGRESS`
  - `IDENTITY_OWNER_ASSIGNMENT` `IN_PROGRESS`
  - `IDENTITY_SURFACE_INVENTORY` `PARTIAL`
- [ ] Validation commands:
  - `rg -n "parse_node_id|symbol_version_id|tree_node_id" parent-atlas-workstation-todo.md openspec/changes/parent-atlas-graph-retrieval-proof`
  - `rg -n "tree_node_id" packages/parent-atlas drizzle/manual scripts/atlas`

## GS1.11 - Parser manifest vs runtime proof

- [ ] Inventory the parser manifest claims against the runtime extraction implementation.
- [ ] Mark the runtime as `REGEX_HEURISTIC` if the current executable still relies on regex or heuristic extraction.
- [ ] Add proof gates for `PARSER_MANIFEST_ALIGNMENT`, `TREE_NODE_ID_STABILITY`, and `SYMBOL_VERSION_IDENTITY`.
- [ ] Current evidence:
  - `scripts/atlas/stage2-structural-extraction.mjs` explicitly says Tree-sitter is a placeholder and uses `ast-grep` plus simplified heuristic extraction.
  - `src/lib/server/classification/document-classifier.ts` describes the AST lane as `tree-sitter/ast-grep` and falls back to heuristic classification when AST input is missing.
  - The package scan did not surface a separate live `parse_node_id` / `symbol_version_id` runtime contract.
- [ ] Validation commands:
  - `rg -n "tree-sitter|regex|heuristic|ast-grep" scripts/atlas`
  - `rg -n "PARSER_MANIFEST_ALIGNMENT|TREE_NODE_ID_STABILITY|SYMBOL_VERSION_IDENTITY" parent-atlas-workstation-todo.md openspec/changes/parent-atlas-graph-retrieval-proof`

## GS1.12 - Read-only identity derivation audit

- [ ] Prove the `graphify_files` derivation formula by scanning every writer and extracting the exact `file_id` inputs.
- [ ] Prove the `graphify_symbols` derivation formula by scanning every writer and extracting the exact `symbol_id` / `stable_symbol_key` inputs.
- [ ] Capture the current `atlas_tree_nodes.node_id` formula as a revision-bound parse-occurrence identity.
- [ ] Measure packet-to-tree linkage reuse, fanout, and unresolved rows without mutating any table.
- [ ] Record the audit as read-only evidence before any contract or schema change.
- [ ] Validation commands:
  - `rg -n "INSERT INTO graphify_files|file_id|source_revision" drizzle packages scripts`
  - `rg -n "stable_symbol_key|symbol_id|graphify_symbols" drizzle packages scripts`
  - `rg -n "tree_node_id" scripts/atlas/phase1-tree-node-derivation.mjs scripts/atlas/backfill-tree-nodes.mjs`
  - `rg -n "tree_node_id" parent-atlas-workstation-todo.md openspec/changes/parent-atlas-graph-retrieval-proof`

## GS1.13 - Evidence-based audit contract

- [ ] Replace grep-only findings with evidence-backed findings.
- [ ] Require each audit finding to cite at least one of: AST analysis, runtime test, SQL/database verification, HTTP integration test, or end-to-end proof.
- [ ] Classify grep output as candidate discovery only.
- [ ] Add explicit evidence type labels to findings: `AST`, `RUNTIME`, `SQL`, `HTTP`, `E2E`.
- [ ] Prove route auth, env fallbacks, and syntax migrations with runtime or AST evidence rather than pattern matching alone.
- [ ] Keep this audit contract separate from schema or writer changes.

## GS1.14 - Central evidence pipeline

- [ ] Define `trace_dynamic_context` as the single evidence assembly tool for bounded proof bundles.
- [ ] Support static discovery lanes (`rg`, `ast-grep`, `ts-morph`, `Tree-sitter`) without treating them as proof by themselves.
- [ ] Support retrieval lanes (`Qdrant`, `TurboVec`, `cuVS`) only as projection evidence with canonical join-back.
- [ ] Support runtime lanes (`HTTP`, `MCP`, `Playwright`, service health) as proof sources.
- [ ] Keep patch generation and patch validation separate (`trace_prepare_patch`, `trace_validate_patch`, `trace_record_validation`).
- [ ] First slice:
  - input: `question`, `workspaceRevision`, optional `filePath` or `symbolId`
  - lanes: `rg`, `ts-morph`, `Tree-sitter`, `Qdrant`, `Postgres`
  - output: bounded evidence bundle with canonical IDs, revision markers, and proof status
- [ ] Exclusions for the first slice:
  - Mastra orchestration
  - A2A / ACP session control
  - cuVS / cuGraph / KMeans / SOM / PageRank automation
  - automatic code edits

## GS1.15 - Implementation scaffold

- [x] Create the central evidence orchestrator as a new bounded module, not an audit monolith.
- [x] Use existing repo seams for adapters instead of inventing new transport layers.
- [ ] Target files for the first slice:
  - `packages/atlas-core/src/evidence/trace-dynamic-context.ts`
  - `packages/atlas-core/src/evidence/trace-dynamic-context.types.ts`
  - `packages/atlas-core/src/evidence/lanes/static-rg.ts`
  - `packages/atlas-core/src/evidence/lanes/ts-morph.ts`
  - `packages/atlas-core/src/evidence/lanes/tree-sitter.ts`
  - `packages/atlas-core/src/evidence/lanes/qdrant.ts`
  - `packages/atlas-core/src/evidence/lanes/postgres.ts`
  - `packages/atlas-core/src/evidence/lanes/http.ts`
  - `packages/atlas-core/src/evidence/lanes/playwright.ts`
  - `packages/atlas-core/src/evidence/lanes/graph.ts`
  - `packages/atlas-core/src/evidence/lanes/telemetry.ts`
  - `packages/atlas-core/src/validation/workflow-trace-logger.ts`
- [ ] Integrate the tool boundary only after the orchestrator returns bounded evidence bundles.
- [x] Keep patch creation and validation in separate follow-up tools.
- [x] First implementation tests:
  - request/response schema validation
  - bounded lane selection
  - canonical join-back enforced for retrieval hits
  - no patch output from the evidence tool
  - trace ledger write through validation logger
- [ ] Reuse existing integration seams where possible:
  - `packages/atlas-core/src/langgraph/worker.ts`
  - `packages/atlas-core/src/tools/acp-tool-contracts.ts`
  - `packages/parent-atlas-client/src/mcp/client.ts`

## GS1.16 - Proof ladder runner and formatter

- [x] Keep the integration proof as a bounded gate-by-gate ladder instead of a single all-green run.
- [x] Add a small evidence report formatter for route, symbol, packet, and runtime questions.
- [x] Wire the first adapter pair into `trace_dynamic_context` with static discovery plus Postgres join-back only.
- [x] Hook the evidence tool boundary into the existing MCP/validation trace path only after the first adapter pair is live.
- [ ] Validation commands:
  - `node scripts/atlas/audit-env-contract.mjs --dry-run`
  - `node scripts/validate-parent-atlas-integration-proof.mjs gate env`
  - `node scripts/validate-parent-atlas-integration-proof.mjs gate identity`
  - `node scripts/validate-parent-atlas-integration-proof.mjs gate mcp`
- [x] Live MCP proof completed: `trace_dynamic_context` is registered, `tools/list` sees it, and `tools/call` returns bounded evidence after fixing repo-root file resolution plus the join-back schema drift.

### ENV audit table

The bulk ENV addition is mechanically present but still semantically unverified. Keep this as a bounded audit table rather than a blanket "all green" claim.

| KEY | CURRENT TYPE | EXPECTED TYPE | DEFAULT POLICY | REQUIRED / OPTIONAL | SECRET | CONSUMER GUARD STATUS |
| --- | --- | --- | --- | --- | --- | --- |
| `CODEBASE_INDEX_URL` | string \| undefined | string \| url | pass-through in canonical `ENV`; any dev fallback must stay downstream | required for codebase index lanes | no | guarded by codebase-index routes |
| `EXT7_MCP_URL` | not present | string \| url | none | optional / not yet proven | no | unresolved note; no canonical env surface entry found |
| `TRACE_MCP_URL` | string \| undefined | string \| url | none | required for trace / MCP proof lanes | no | guarded by MCP clients and proof runner |
| `SEARXNG_URL` | string \| undefined | string \| url | none | optional for search lanes | no | guarded by search adapters with downstream degradation |
| `HFORF_MODEL_PATH` | string \| undefined | filesystem path string | none in canonical `ENV`; downstream pages may choose a local fallback | optional for admin/model routing | no | guarded by admin atlas page fallback chain |

## Acceptance criteria

- `tree_node_id` is documented as provisional/version-bound, not canonical stable identity.
- `symbol_id` and `symbol_version_id` are distinguished in the spec.
- The OpenSpec task file no longer implies the graph snapshot is canonical before identity separation is proven.
- The workstation todo and this change agree on the same identity model and proof gates.
- The live package scan explicitly shows where `tree_node_id` is still written and where the missing `symbol_version_id` / `parse_node_id` contracts are absent.
- The parser/runtime classification is explicitly `REGEX_HEURISTIC` until a real parser-backed implementation is proven.
- The read-only derivation audit produces separate evidence for `graphify_files`, `graphify_symbols`, and `atlas_tree_nodes` without schema mutations.
- The audit framework requires at least one concrete proof source per finding.
- The evidence pipeline is a bounded aggregator, not a monolithic audit tool or patcher.
- The implementation scaffold names the concrete new modules and keeps patching outside the evidence path.
- The env proof ladder includes a bounded audit table for current type, expected type, default policy, required/optional, secret, and consumer guard status before any broader Graphify or identity work resumes.
- The proof runner emits dependency-blocked gates explicitly and writes both JSON and Markdown ladder reports.

## GS1.17 - Library registry + atlas_ast_nodes revision gap (session 2026-08-02, parallel thread)

Built concurrently with GS1.14-16 in a separate session context. Not yet cross-verified against the `trace_dynamic_context`/proof-ladder work above — do that first before extending either.

- [x] `library_identities` Postgres table (npm + pip package identity registry), addressed as `npm:pkg@version` / `pip:pkg@version`. Manual migration `drizzle/manual/20260802_library_identities.sql` (kept out of `drizzle-kit generate` — bundled in unrelated pre-existing drift when generated normally; excluded via `tablesFilter`).
- [x] `scripts/atlas/library-registry-scan.mjs` — npm lockfile scan (root + sveltekit-frontend, handles `lockfileVersion: 3`'s workspace-package-without-`node_modules/`-prefix shape) + pip site-packages scan (miniforge sidecar interpreter, actually plain `C:\Python313\python.exe`, not conda). Tier 1 (name/version/exports/types) for all; Tier 2 (declaration paths) for an allow-list only.
- [x] `sveltekit-frontend/src/lib/server/library-registry/{types,resolve-library-identity,fetch-tier-content}.ts` — resolver + Tier 3/4 on-demand fetch with exclude-by-default (dist/sourcemaps/minified/binary/nested-node_modules/caches).
- [x] MCP tools `library.registry_{lookup,search,fetch_tier,rescan}` wired into `trace-mcp-server.ts`, live-verified (`tools/list` shows all 4, `registry_lookup`/`fetch_tier` tested against real data, exclusion filter confirmed working).
- [x] Ported into `packages/parent-atlas`: `src/pipelines/library-registry-scan.ts` (spawnSync wrapper matching `runIngest`'s shape) + `atlas library registry-scan` CLI subcommand + package.json script. Package builds clean (`node ../../node_modules/typescript/bin/tsc -p tsconfig.json` — do NOT use `npm run build`/`npx tsc`, root `.npmrc` has `workspaces=false` which breaks npm-mediated invocation with a `--no-workspaces`/`--workspace` conflict).
- [ ] **Unresolved**: the CLI-triggered rescan (`atlas library registry-scan`, non-dry-run) did not confirm a fresh Postgres write in the one run attempted — `scanned_at` still shows only the original direct-script run's timestamps. CLI wiring itself is proven correct (dry-run resolves the right script + args). Re-run and confirm before relying on the CLI path for production rescans.
- [x] `atlas_ast_nodes` — added `source_revision`, `workspace_id`, `grammar_version` columns (nullable, manual migration `drizzle/manual/20260802_atlas_ast_nodes_revision.sql`, applied live). This is the concrete fix for GS1.10/GS1.12's `GRAPHIFY_SYMBOL_ID_CROSS_REVISION NOT_PROVEN` gap as it applies to `atlas_ast_nodes` specifically — the table had no revision axis at all before this, so cross-revision `tree_node_id`/`symbol_id` stability could not be tested against it. Existing 11,067 rows have `source_revision = NULL` until re-analyzed.
- [ ] **Not started** (deferred, from a separate long-form spec this session, do not confuse with GS1.10-13 above even though it overlaps): a canonical `AnalysisEnvelopeSchema` (Zod v4) unifying Tree-sitter/ast-grep/BeautifulSoup/Playwright/Python-NLP analyzer output; `atlas_analysis_runs` + `atlas_knowledge_facts` tables (versioned run ledger + key-value fact store, GIN-indexed); a Zod v3/v4 import-classification gate (`rg "from ['\"]zod/v[34]['\"]"` returned zero hits this session — the `as any` casts added to `library-registry-tools.ts`'s `registerTool` calls are a transitive `@modelcontextprotocol/sdk`-vs-`zod@4.4.3` resolution mismatch, not mixed imports; do not remove the casts until that dependency resolution is fixed repo-wide).
- [ ] `treesitter-chunker` (the PyPI package specifically, distinct from the already-installed `tree-sitter` + `tree-sitter-language-pack` primitives) is confirmed NOT installed on the miniforge sidecar. If adopted, it's a parser/chunking sidecar feeding identity — not a new DB owner, not inside the GPU inference process — per this session's design discussion.
- [ ] Validation commands:
  - `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT count(*), max(scanned_at) FROM library_identities;"`
  - `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\d atlas_ast_nodes"` (confirm `source_revision`/`workspace_id`/`grammar_version` present)
  - `cd packages/parent-atlas && node --experimental-vm-modules dist/cli.js library registry-scan` (re-run, non-dry-run, confirm Postgres write via the query above)

## GS1.18 - Crawl/LDR/source-validation runtime audit (concurrent session, verified via rg 2026-08-02)

Third thread from the same concurrent session as GS1.14-16, working the ingestion/crawl/source-validation lane instead of the evidence-pipeline lane. Captured here from a pasted session transcript and independently re-verified with `rg`/`Read` rather than trusted at face value, per GS1.13's evidence-type contract.

- [x] **RUNTIME** — `beautifulsoup4` 4.13.4 is installed on the Python 3.13 interpreter (`pip show beautifulsoup4`), but only as a *transitive* dependency of `docling`/`markdownify`/`markitdown`/`unstructured` — not a direct project requirement.
- [x] **AST** — zero live `BeautifulSoup`/`bs4` imports anywhere in `sveltekit-frontend/`, `scripts/`, or `packages/` (`rg` repo-wide, 7 total hits, all in generated indexes/tokenizer JSON/pip metadata, none in source). The crawl lane is regex/fetch-based, not BS4-based, confirming the concurrent session's live-code finding.
- [x] **SQL/RUNTIME** — the import-time CouchDB crash the concurrent session found is fixed in the live file: `sveltekit-frontend/src/lib/server/services/couchdb-client.ts:8-20` now wraps the module-scope `COUCHDB_URL` resolution in `stripCredentials()`, which try/catches `new URL(...)` and falls back to `''` instead of throwing when `ENV.COUCHDB_URL` is unset. `couchFetch()` throws only when actually called with no URL configured, not at import time.
- [x] **AST/RUNTIME** — `sveltekit-frontend/src/routes/api/kb/validate/+server.ts` already has its auth gate (`if (!locals.user?.id) return json({error:'Unauthorized'},{status:401})`, line 32) running *before* the dynamic `await import('$lib/server/services/couchdb-client.js')` (line 40) and before Zod validation. Combined with the prior finding, the crash-before-auth-gate failure mode the concurrent session was chasing is resolved as of this read — unauthenticated callers get a clean 401, never reach the CouchDB import.
- [x] **AST** — the LDR MCP tool (`src/mcp/tools/ldr-research.ts`, exports `LDR_RESEARCH_TOOL`/`executeLDRResearch`) is registered in the **older stdio `src/mcp/server.ts`** (line 23 import, line 5342 call site) but is **NOT** registered in the live Streamable-HTTP `trace-mcp-server.ts` (:8788) — zero hits for `ldr-research`/`ldrResearch`/`ldr_research` in that file. This confirms the concurrent session's "split across a tool registry and a separate MCP server" finding: LDR is reachable from one MCP surface, not the canonical one this repo's other tools (`library.registry_*`, `trace.kag_search`, etc.) live on.
- [x] **AST** — `sveltekit-frontend/src/lib/server/retrieval/web-ingest.ts` is a queue-message processor (`queueWebResultsForIngestion`, `processWebIngestMessage`), not a crawler itself — it consumes already-fetched web results rather than doing the fetch/parse. The actual crawl fetch logic lives upstream of this file (not yet located in this pass).
- [x] **Resolved (2026-08-02, operator clarification)**: LDR is deep *external* research — it fires only when the LLM lacks information that isn't in the repo, gathering outside context that feeds the Parent Atlas ingestion chain (embeddinggemma NLP → tensor analysis → schema-based indexing/ranking → go-retrieval → agentic background processing). This is a different job from `trace_dynamic_context`'s lanes (`rg`/`ts-morph`/`Tree-sitter`/`Qdrant`/`Postgres`/`HTTP`/`MCP`/`Playwright`), which are all *internal* code-evidence sources bounded to this repo's own state. **Do not merge LDR into `trace_dynamic_context`.** The open question is narrower than originally framed: LDR still needs a registration on the live `trace-mcp-server.ts` (:8788) surface (as its own tool, not folded into the evidence pipeline) so it's reachable from the same MCP boundary as everything else, rather than only the older stdio `server.ts`.
- [ ] Validation commands:
  - `C:\Python313\python.exe -m pip show beautifulsoup4`
  - `rg -n "BeautifulSoup|bs4" sveltekit-frontend/src scripts packages`
  - `rg -n "ldr-research|ldrResearch|ldr_research" sveltekit-frontend/src/mcp/trace-mcp-server.ts sveltekit-frontend/src/mcp/server.ts`
  - `curl -s -X POST http://127.0.0.1:8788/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | rg -i ldr`

## GS1.19 - LDR acquisition boundary + MCP transport alignment (2026-08-02)

Resolves GS1.18's open item. Operator clarified LDR's role: an *acquisition* adapter (deep external research when the LLM/repo lacks the answer), never a second canonical RAG platform. Canonical flow: `trace_dynamic_context` reports an evidence gap -> `research.deep_research` (LDR: SearXNG/web search + fetch/render) -> normalization (BeautifulSoup for static HTML / Playwright for dynamic) -> `sources.validate` -> Postgres canonical source+extraction rows -> chunk/embed (EmbeddingGemma) -> Qdrant/Neo4j projections -> `trace_dynamic_context` re-query -> llama-server synthesis (through its existing OpenAI-compatible endpoint — never hardcode a model id guessed from a `.gguf` filename; resolve it live via `GET /v1/models` or through Bifrost if Bifrost owns model routing).

**Wired this pass** (smallest safe patch — "move the registration, not the implementation"):
- [x] New `sveltekit-frontend/src/mcp/ldr-research-tools.ts` — `registerLdrResearchTools(server, pool)`, reusing the existing `executeLDRResearch`/`formatLDRResultForAgent` handler from `tools/ldr-research.ts` unchanged (zero duplicated research logic).
- [x] Wired into the canonical `trace-mcp-server.ts` (:8788) — import at the top import block, call site immediately after `registerLibraryRegistryTools(server, pool)`. The `ldr_research` tool name is unchanged for compatibility with the existing stdio `src/mcp/server.ts` registration (both may coexist during transition).
- [x] Verified no new type errors: `npx tsgo --noEmit` — 658 pre-existing baseline errors repo-wide, zero touching `ldr-research-tools.ts` or `trace-mcp-server.ts`.
- [x] **RUNTIME**, confirmed live 2026-08-02: restarted `trace-mcp-server.ts` and `tools/list` on :8788 now returns `ldr_research` alongside `library.registry_lookup`. Note: `ensure-mcp-server.mjs --spawn` is idempotent-when-healthy — it only respawns if its fixed `REQUIRED_TOOLS` allowlist (`kag.record_agent_run`, `trace.kag_search`, etc., not `ldr_research`) is missing, so a plain re-run silently no-op'd against the still-running old process. Had to manually stop the :8788 listener (`Get-NetTCPConnection -LocalPort 8788 -State Listen | Stop-Process -Force`) before `--spawn` would actually launch the new code. `tools/call` (an actual LDR research execution) was not exercised — registration proof only, not an end-to-end research run.
- [x] **RUNTIME, confirmed 2026-08-02**: real `tools/call` on `ldr_research` (`"What is the capital of France?"`, maxResults=3, maxDocs=2) — HTTP 200, `isError:false`, `success:true`, confidence 65%, 2 real sources (Wikipedia + Britannica), 22.7s. `LDR_TO_SOURCE_ACQUISITION` moves from `NOT_PROVEN` to `RUNTIME_SMOKE_PROVEN` for the search+fetch+synthesize leg specifically (still `NOT_PROVEN` for the Postgres/embedding/Qdrant persistence legs, which this tool doesn't touch).
- [x] **Fixed and re-verified live, 2026-08-02**: added `stripReasoningTags()` to `ldr-orchestrator.ts` (strips `<|think|>...</think>`, `<thinking>...</thinking>`, `<|channel|>...<|message|>`, `<start_of_turn>`/`<end_of_turn>`/`<|endthinking|>` — same contamination class the Phase 7 `sanitizeSummary()` sanitizer strips, extended to cover the `<|think|>` variant this endpoint actually emits), applied at both the non-streaming `callGemma4Synthesis` return and the streaming path's final `fullText`/`cleanText`. Re-ran the identical smoke query after restarting `trace-mcp-server.ts` — `success:true`, 0 occurrences of any think-tag marker, clean answer starting directly with the synthesized content.
- [x] **Separate finding, also fixed**: `ldr-orchestrator.ts` imported `callGemma4Stream` from `../ollama` but never called it (confirmed dead/unused via diagnostics) — a violation-shaped smell against the repo's hard rule ("Ollama is ONLY for embeddings; all chat/synthesis goes through llama-server.exe") even though the live call path was already correctly hitting `${llmUrl}/chat/completions` (llama-server `:8090/v1`) directly via raw `fetch()`. Removed the unused import; confirmed via `tsgo --noEmit` (no new errors) and a live re-test (server restarts clean, tool executes successfully) that nothing depended on it.

**Explicitly deferred, NOT built this pass** (correctly left `NOT_PROVEN`, not claimed done — this is a large multi-system spec, not a bounded patch):
- [ ] `research.deep_research` / `sources.acquire` / `sources.validate` as *separate* Zod-schema'd tools distinct from the raw `ldr_research` passthrough wired above (the spec's fuller MCP boundary — current wiring only exposes the existing tool as-is).
- [ ] Python BeautifulSoup normalizer (`html_normalizer.py`) + Pydantic `HtmlExtractionEnvelope` (schema_version, source_revision, html_digest, parser/extractor identity) — location TBD: `packages/parent-atlas/python/parent_atlas/acquisition/` vs. the existing NLP sidecar, whichever is the canonical Python runtime (unconfirmed which one that is).
- [ ] Postgres tables `atlas_web_sources` (canonical web source, unique on `final_url + source_revision`) and `atlas_web_extractions` (versioned extraction runs, unique on `web_source_id + extractor_name + extractor_version + parser_name + normalized_text_digest`), both with GIN indexes on jsonb columns — schema drafted in the operator's spec, not yet written as a manual migration.
- [ ] The 10-gate fixture-based proof ladder the operator specified (parser env sanity through end-to-end research→ingest→retrieval) — none of these gates have run. Current status per that ladder:
  - `COUCHDB_IMPORT_WITHOUT_URL` = `PROVEN_FIXED_REPORTED` (verified GS1.18)
  - `KB_VALIDATE_AUTH_GATE` = `PROVEN_REPORTED` (verified GS1.18)
  - `LDR_CANONICAL_MCP_REGISTRATION` = `WIRED` (this session, not yet `RUNTIME_SMOKE_PROVEN` — see restart-and-confirm item above)
  - Everything else in the ladder (`KB_VALIDATE_BACKEND_CALL`, `BS4_IMPORT_IN_SERVICE_RUNTIME`, `BS4_HTML_EXTRACTION`, `LDR_TO_SOURCE_ACQUISITION`, `SOURCE_TO_POSTGRES_LINEAGE`, `SOURCE_TO_EMBEDDING_QUEUE`, `SOURCE_TO_SEMANTIC_768`, `SOURCE_TO_QDRANT_JOIN_BACK`, `END_TO_END_RESEARCH_INGEST_RETRIEVAL`) = `NOT_PROVEN`, unstarted.
- [ ] `LDR_LLM_BASE_URL`/`LDR_LLM_MODEL` env-driven endpoint selection (vs. any hardcoded model id) — not yet audited against the live `ldr-orchestrator.ts` implementation to confirm it already does this correctly.
- [ ] Do **not** couple LDR/BeautifulSoup to the `models/hfor/hforf.gguf` filesystem path directly — that path belongs to the llama-server process launch config only; LDR must always call through the OpenAI-compatible HTTP endpoint (`:8090` or Bifrost). Not yet audited for violations of this rule.
- [ ] Per the operator's instruction: do not run `graphify:daily` just because the stale-map hook nags — the crawl/LDR lane does not depend on graph promotion. (Separately, the known unbounded-`Infinity`-scroll OOM risk in `backfill-latent-vectors.mjs` still applies if `graphify:full`/GPU path is ever run — see prior session note.)
- [ ] Validation commands (once the above is built):
  - `curl -s -X POST http://127.0.0.1:8788/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | rg -i ldr_research`
  - `curl.exe -s http://127.0.0.1:8090/v1/models` / `curl.exe -s http://127.0.0.1:8090/health` (prove live model identity before wiring `LDR_LLM_MODEL`)
  - `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "\d atlas_web_sources"` (once the migration exists)

## GS1.20 - Acquisition plane MVP: Postgres + outbox + Valkey Streams (2026-08-02)

Implements ACQ1-ACQ5 of the operator's Parent Atlas Acquisition Network/Cache/OTel spec. ACQ6-ACQ12 (cache validators, raw storage, extraction-sidecar wiring, sources.get_status, OTel spans, fixture proof) remain, tracked below. Full spec text is in this session's transcript, not duplicated here.

**Concurrency guard**: `scripts/validate-parent-atlas-integration-proof.mjs` recorded (mtime `1785706469`, sha256 `0e0fec2d47...`) and not touched.

**ACQ1 — corrects prior audit conclusions (GS1.18)**:
- BeautifulSoup IS in the live acquisition path — via `python/langextract_service.py:521` (`POST /extract/web`, real `BeautifulSoup(html, "html.parser")` call), reached over HTTP from `web-crawl.ts:crawlViaBeautifulSoup()`. GS1.18's "no BS4 in the live path" was correct for TypeScript source only — it never crossed the HTTP boundary into Python.
- Port 8095 / `/extract/web` belongs to `langextract_service.py`, not `miniforge_nlp_sidecar.py` (a separate, text-analysis-only service with no URL-fetching route at all) — corrects the operator's own spec assumption.
- Real topology: `web-search-client.ts:fetchAndExtractText` → `web-crawl.ts:extractWebDocument` (SSRF-validated via `url-validator.ts`, CANONICAL) → `crawlViaLangextract` → `crawlViaBeautifulSoup` → `crawlFallback` (regex, LEGACY last-resort). `/api/web/crawl/+server.ts` is the one real HTTP entrypoint (auth-gated, Zod-validated).
- `src/lib/server/agent/tools/web-search.ts` found but not yet classified — flagged, not resolved.

**ACQ2/ACQ3 — schema + contracts (built, type-checked, migration applied live)**:
- `schema/atlas-acquisition.ts` — `atlas_research_runs` → `atlas_fetches` → `atlas_fetch_attempts` (+ `atlas_source_revisions` → `atlas_extractions`), identities kept separate per the spec's non-negotiable boundary rule (a source_revision can have multiple extractions; a 304 reuses a source_revision under a new fetch_attempt). `workflowRunId` is a nullable external-correlation field only — no separate workflow-run owner system exists yet (A2A/orchestrator explicitly deferred).
- Migration `drizzle/manual/20260802_atlas_acquisition.sql` applied live (5 tables, 8 indexes). Added to `tablesFilter` (same isolation-from-drift reasoning as `library_identities` in GS1.17).
- `atlas/acquisition/contracts.ts` — Zod `AcquisitionRequestV1`/`ResultV1`/`ExtractionRequestV1`/`ResultV1`.

**ACQ4 — transactional outbox (reused existing infrastructure, did not duplicate)**:
- Found `outbox_events` already exists and is already proven in production via `action-writer.ts`/`outbox-worker.ts` (agent-run fanout to Redis/Qdrant, `SELECT ... FOR UPDATE SKIP LOCKED` claim pattern). Reused it (`aggregateType: 'atlas_fetch'`) instead of creating a parallel `atlas_outbox_events` table.
- `atlas/acquisition/acquisition-writer.ts` — `requestAcquisition()`: one `db.transaction()` creates/reuses the research run, dedupes the fetch row on `(research_run_id, normalized_url)`, writes the fetch-attempt row **before** any network I/O, commits the outbox row atomically.
- Extended `outbox_events` with generic nullable `stream_name`/`stream_entry_id`/`publish_attempts`/`last_publish_error` columns (migration `drizzle/manual/20260802_outbox_events_stream_publish.sql`) — additive, doesn't affect existing agent-run rows.
- Added `handleAcquisitionStreamPublish` to `outbox-worker.ts`'s existing `HANDLERS` registry; extended `Handler`'s return type to optionally report `{streamEntryId}` (backward-compatible with the existing centroid/ace/qdrant handlers, which still return `void`).

**ACQ5 — Valkey Streams (new; `redis-streams.ts` was ruled out — it's a single-reader XADD/XREAD token-streaming helper with no XREADGROUP/XACK/consumer-group support at all)**:
- `atlas/acquisition/acquisition-stream.ts` — `atlas:acquisition:requested` stream, `atlas:acquisition:workers` consumer group, `atlas:dead_letter` DLQ. `publishAcquisitionRequested`, `ensureAcquisitionConsumerGroup`, `readAcquisitionBatch` (XREADGROUP), `ackAcquisitionEntry` (XACK), `reclaimStaleEntries` (XAUTOCLAIM), `deadLetter`.
- `atlas/acquisition/acquisition-worker.ts` — `runAcquisitionWorkerCycle()`: XREADGROUP → unconditional fetch via existing `extractWebDocument` (ACQ6 cache-awareness not yet layered in) → writes `atlas_fetch_attempts` completion + digest-deduped `atlas_source_revisions` + `atlas_fetches.status` → XACK only after the Postgres write commits (ack means "handled durably," not "workflow succeeded," per spec).
- **Bug found and fixed during live testing**: `XGROUP CREATE ... $ MKSTREAM` starts the group at the stream's *current tail*. Since the group was created (lazily, on first worker run) *after* its first message was already published, it silently missed that message. Fixed to start at `'0'` (process from the beginning) — correct behavior for a durable job queue on first creation.

**Live end-to-end proof** (`scripts/atlas/smoke-acquisition-mvp.mts`, real run against live Postgres + Valkey, not a fixture):
```
requestAcquisition → 1 research_run + 1 fetch + 1 fetch_attempt + 1 outbox row (all one transaction)
runOutboxCycle      → published:1, streamEntryId recorded on the outbox row
runAcquisitionWorkerCycle → processed:2 (incl. the earlier backlogged entry after the $/0 fix), fetched:2, failed:0, deadLettered:0
Postgres verified   → atlas_fetches.status='fetched'; atlas_fetch_attempts has httpStatus:200, contentDigest,
                      sourceRevisionId, cacheDecision='network_fetch'; atlas_source_revisions row exists, digest matches
```
- [x] ACQ1 STATICALLY_PROVEN + RUNTIME-corrected (see above)
- [x] ACQ2 RUNTIME_SMOKE_PROVEN (contracts type-check, used live by the writer)
- [x] ACQ3 APPLY_PROVEN (migration applied, tables live, writer inserts/reads real rows)
- [x] ACQ4 RUNTIME_SMOKE_PROVEN (transactional insert + outbox commit + existing worker's claim/publish cycle, live)
- [x] ACQ5 RUNTIME_SMOKE_PROVEN (XADD → XREADGROUP → XACK proven live end-to-end, including the $/0 bug fix)
**ACQ6/ACQ7 — cache-aware conditional fetch + raw-byte storage (built, live-proven; also fixed the empty-content finding from the ACQ1-5 report above)**:
- Root-caused the empty-content bug: `web-crawl.ts:crawlViaLangextract()` POSTs `{url, extract_text:true}` to `/extract`, but `/extract`'s native-TS short-circuit (`LANGEXTRACT_NATIVE='true'`, the current default) only reads `body.text`/`body.content` — never `body.url` — so it silently returns empty content and never falls through to the real BeautifulSoup path at `/extract/web`. This is a genuine, separate pre-existing bug in `web-crawl.ts`'s cascade ordering, tracked here but **not fixed in that file** — out of scope for the acquisition plane. `extractWebDocument()` also discards response headers entirely (no ETag/Last-Modified/Cache-Control access), which ACQ6 needs regardless of that bug.
- `atlas/acquisition/conditional-fetch.ts` (new) — does its own SSRF-validated fetch (via existing `validateExternalUrl`), independent of `web-crawl.ts`. Manually follows redirects (not `fetch`'s automatic redirect handling) so each hop is independently re-validated, closing the validate-then-connect TOCTOU gap. Sends `If-None-Match`/`If-Modified-Since` when a prior revision exists and cache mode allows it; `cache_only` never performs network I/O; bounds max redirects (5), request timeout (15s), and response size (10MB).
- `acquisition-worker.ts` rewritten to use `conditionalFetch` instead of `extractWebDocument`, and to store raw bytes via `uploadFile()` (bucket `atlas-web-sources`) **before** any extraction step — extraction (ACQ8) is a separate downstream step against these stored bytes, so a normalization failure can't destroy the raw artifact. Storage backend is **SeaweedFS**, not MinIO — `minio-client.ts` is a legacy filename; `getMinioClient()` (`minio-client.ts:43-44`) already resolves `ENV.SEAWEED_ENDPOINT`/`ENV.SEAWEED_S3_PORT` ahead of the `MINIO_*` fallback, and no MinIO container exists in this environment. Verified live: listed the `atlas-web-sources` bucket through the same client and confirmed the uploaded object (`e8a4b34c-....bin`, 559 bytes) is really there.
- **Live proof** (extended `smoke-acquisition-mvp.mts`, real HTTP against `https://example.com`, real SeaweedFS write, real Postgres):
  - Attempt 1: HTTP 200, `contentLength: 559` (real content — the routing-around-the-bug fix worked), raw bytes uploaded to `s3://atlas-web-sources/<sourceRevisionId>.bin`, `cache_decision: network_fetch`, `atlas_source_revisions` row created.
  - Attempt 2 (`cachePolicyMode: 'revalidate'`, same fetch, second call): sent `If-Modified-Since` (captured from attempt 1's response), got a **real HTTP 304** back, `cacheDecision: 'not_modified'`, **reused the exact same `sourceRevisionId`** from attempt 1 (no duplicate row — cross-research-run digest dedup on `(final_url, content_digest)` also confirmed working), `atlas_fetches.status` → `not_modified`, `contentDigest` correctly left null on the new attempt (no content rewrite).
  - `requestEtag`/`requestLastModified` correctly recorded on the fetch-attempt row (what was actually sent), not just the response validators.
- [x] ACQ6 RUNTIME_SMOKE_PROVEN (real 304 against a real server, correct source-revision reuse, correct fetch-attempt-ledger fields)
- [x] ACQ7 RUNTIME_SMOKE_PROVEN (raw bytes durably stored to SeaweedFS before extraction; `storageUri` populated on the source-revision row)
**`minio.ts`/`seaweed-client.ts` consolidation — audited 2026-08-02, corrects the plan above (the earlier "copy minio.ts to seaweedfs.ts" premise was wrong — read the real files before acting on it)**:

The consolidation this plan called for **already exists** — it just wasn't discovered before writing the plan above. Actual object-storage module map (6 files, not 2):

| File | Role | Status |
|---|---|---|
| `minio-client.ts` | Real implementation (`minio` npm package `Client`), already `ENV.SEAWEED_* ?? ENV.MINIO_*` internally | CANONICAL implementation |
| `minio.ts` | A **second**, separate real implementation (`MinIOService` class, own `Client` instance), also `SEAWEED_*`-first internally | Duplicate implementation, same SDK |
| `seaweed-client.ts` | Pure re-export barrel — every function from `minio-client.ts` (+ 2 from `minio.ts`) under a `...Seaweed...` alias. Doc comment: "canonical import path for new code" | CANONICAL import path (already established) |
| `seaweed-service.ts` | Pure re-export barrel — `MinIOService` (from `minio.ts`) as `SeaweedService` | Thin alias barrel |
| `storage/minio-service.ts` | Legacy shim — re-exports `SeaweedService` as `MinIOService` again | Thin alias barrel |
| `storage/seaweed.ts` | **Genuinely different, third implementation** — raw `@aws-sdk/client-s3` (`S3Client`/`PutObjectCommand`), own `putFileToSeaweed`/`deleteFileFromSeaweed` functions, no shared code with the other 5 files | Confirmed duplicate, 2 real consumers (`/api/files/+server.ts`, `/api/files/[id]/+server.ts`) |

- [x] Verified the app-wide migration to the canonical barrel is **already done**: 21 of 22 real consumers (`evidence/upload`, `evidence/[id]/download`, `evidence/[id]/vlm-analyze`, `persons-of-interest/[id]/photos`, `documents/upload`, `admin/ai-chat/upload`, `library/documents/[documentId]/pdf`, `indexing`, `constitution-fetcher`, `legal-search-init`, `ingestion-worker`, `constitution-pipeline`, `video-ingest-service`, `vision-service`, `unified/legal-ai-service`, `db/drizzle.ts`, `storage/seaweed-proxy.ts`, and others) already import from `$lib/server/seaweed-client.js`, not `minio-client.js` directly.
- [x] Found and fixed the **one** outlier: this session's own `acquisition-worker.ts` was the only consumer importing `minio-client.js` directly. Changed to `import { uploadSeaweedFile as uploadFile } from '$lib/server/seaweed-client.js'` — matches the established convention. Verified clean via `tsgo --noEmit`.
- [ ] **`storage/seaweed.ts` is a confirmed, separate duplicate** (different SDK entirely — `@aws-sdk/client-s3` vs the `minio` package) serving 2 real routes. Not touched this pass — merging it into the `minio-client.ts`/`seaweed-client.ts` lineage is a real decision (which SDK wins) affecting live upload/download routes, not a safe mechanical patch. Needs an explicit operator call before any consolidation, per this repo's own rule: "Patch — edit only duplicates with the same contract; never refactor working modules."
- [ ] Archiving `minio-client.ts`/`minio.ts` is **not actionable** as originally planned — they're not legacy-and-unused, they're the live implementations everything else (including the canonical `seaweed-client.ts` barrel) is built on. Nothing to archive here unless/until a decision is made to rewrite the barrel's re-exports into genuinely new SeaweedFS-native code (bigger, unscoped work, not requested).
- [ ] Validation commands:
  - `rg -n "from ['\"].*minio-client|from ['\"].*seaweed-client|from ['\"].*seaweed-service|from ['\"].*storage/seaweed['\"]|from ['\"].*storage/minio-service|from ['\"].*/minio\.js" sveltekit-frontend/src` (re-run to catch any new outliers introduced later)

- [ ] ACQ8 NOT_PROVEN — extraction (BS4/`/extract/web` on :8095) not yet wired against the stored raw bytes
- [ ] ACQ9 NOT_PROVEN — `sources.get_status` MCP tool not built
- [ ] ACQ10 NOT_PROVEN — no OTel spans added yet; bootstrap exists and is invoked from `hooks.server.ts` but nothing in the acquisition path emits manual spans
- [ ] ACQ11 PARTIAL — the live `example.com` run above proves ACQ6's core mechanics, but the operator's spec explicitly wants a *controlled* fixture server (deterministic ETag/malformed-page/redirect-loop/SSRF-target cases) — not yet built
- [ ] ACQ12 — this section is a partial concurrency report; no other file collisions detected this pass beyond the guarded file above
- [ ] Validation commands:
  - `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT status, count(*) FROM atlas_fetches GROUP BY status;"`
  - `docker exec legal-ai-valkey redis-cli -a redis XLEN atlas:acquisition:requested`
  - `docker exec legal-ai-valkey redis-cli -a redis XPENDING atlas:acquisition:requested atlas:acquisition:workers`
  - `npx tsx scripts/atlas/smoke-acquisition-mvp.mts` (from `sveltekit-frontend/`)

## Suggested execution order

1. Run GS1.9 inventory and capture the current join/report shape.
2. Confirm GS1.10 contract language in both the workstation todo and this OpenSpec change.
3. Run GS1.11 parser/runtime audit and classify the executable as `REGEX_HEURISTIC` or better.
4. Only then revisit snapshot promotion, uniqueness relaxation, or downstream enrichment work.
