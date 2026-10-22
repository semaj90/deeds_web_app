# Atlas MCP Tools and Directory Analysis

Reviewed 2026-10-20. A live, read-only TRACE `tools/list` request returned **199 tools**. A static scan initially found 124 literal registrations in `src/mcp/trace-mcp-server.ts`; after this change it finds **125**, with no duplicate names. Optional registries and aliases contribute to the live catalog, so the two counts describe different scopes. Tool listing proves registration and transport response; it does not exercise each dependency or admit its output.

The current Codex tool inventory does not expose Atlas-specific tools directly. This review inspected their source and used the existing TRACE HTTP endpoint to list them.

## Relevant Live Tools

| Tools confirmed by live tools/list | Use | Limit |
|---|---|---|
| `ops.search_tools`, `tools.batch_call` | Discover and compose registered tools. | Calling multiple tools does not provide a source/workspace evidence join. |
| `db.schema_overview`, `db.table_inspect` | Inspect database schema and tables. | Schema inspection does not qualify source or embedding provenance. |
| `wiki.status`, `wiki.search`, `wiki.explain_page` | Inspect and retrieve existing wiki/card information. | Derived summaries require their original evidence and revision checks before admission. |
| `wiki.refresh_directory` | Prepare or refresh one directory card; defaults to dry run. | Does not invoke the exact indexed-source AST/LSP/NLP diagnostic. Non-dry-run refresh can write. |
| `atlas.packet_dense_search` | Retrieve vector candidates and join packet data. | Coverage and per-hit lineage still determine eligibility. |
| `graph.dependencies`, `graph.expand_neighborhood`, `graph.shortest_path`, `graph.community_for_node`, `graph.pagerank_top` | Inspect derived structure and metrics. | A listed graph tool does not prove a current, qualified graph cohort. |
| `hypergraph.search`, `hypergraph.get_edge`, `hypergraph.explain_activation`, `hypergraph.expand_members` | Inspect hypergraph candidates and derived relationships. | Unresolved or ungrounded tuples remain ineligible evidence. |
| `miniforge.health`, `miniforge.analyze`, `miniforge.extract` | Access the existing NLP sidecar. | Availability and proposal output are separate from original-source span verification and evidence admission. |
| `context.build_indexed_source_packet` | Build/cache an indexed-source context packet. | This is a separate packet/cache path, not proof of an admitted ContextManifest from the new diagnostic. |
| `service_workers.status`, `service_workers.result` | Inspect existing local background jobs. | Queue state is process-local and is lost on restart. |

The live server did **not** list the newly added `analysis.indexed_source_batch` during this review. Its registration is present in the edited source; a controlled TRACE reload and a subsequent tools/list/call check are needed to verify the runtime handoff.

## Implemented Directory Diagnostic

`analysis.indexed_source_batch` submits work through the existing TRACE service-job runner. It accepts:

| Input | Contract |
|---|---|
| `directory` | Exact repository-relative directory, preserving case and prefixes; traversal, absolute paths, locators, and empty segments are rejected. |
| `workspaceRevision` | An existing `sha256:<64 lowercase hex>` workspace revision; shape validation alone does not prove admission. |
| `limit` | Default 8, maximum 16 rows per diagnostic page. |
| `afterSourceRef` | Optional exact cursor from the previous report's `nextSourceRef`; keep directory and workspace fixed. |

The tool returns a job ID. Poll `service_workers.result` for the report. A job's completion means the diagnostic returned; assess the report's own status, per-source results, provider skips/failures, and truncation separately.

The implementation:

1. Selects a bounded page from the existing exact `atlas_workspace_source_bindings` and `graphify_files` join under a PostgreSQL READ ONLY transaction. The directory prefix and cursor are SQL parameters, with a directory-separator boundary and deterministic ordering.
2. Rolls back and releases the connection before analysis. Ambiguous bindings and missing source/workspace revisions are excluded explicitly.
3. Reuses `audit-indexed-source-providers-v1.mjs`, which reads source bytes and independently compares them with the selected source revision before dispatching providers.
4. Reads each generated local provider receipt back from `.tmp/atlas`, verifies its checksum, source/workspace identity, provider statuses, and zero canonical-write fields, then includes it in the batch report.
5. Preserves failed, skipped, partial, and truncated outcomes. Skipped providers and NLP passes without matching source revisions no longer become completed diagnostics in the single-source summary.

TRACE runs one source child per batch job and shares its existing service-job concurrency. The standalone CLI allows one or two source children. The new tool rejects requests when the existing pending queue already has 32 jobs. This is bounded diagnostic orchestration; it does not replace the application's shared ComputePool or implement a durable RabbitMQ consumer.

Standalone invocation:

```powershell
node scripts/atlas/audit-indexed-source-batch-v1.mjs <directory> <workspace-revision> [limit] [concurrency] [after-source-ref]
```

Canonical source paths are passed unchanged to exact database joins. The single-source runner previously used a lossy normalizer that lowercased paths and removed the SvelteKit prefix; that precheck now validates the literal path instead. Existing workspace/source joins and physical-path containment checks still decide whether the source is usable.

## Live Replay and Remaining Work

Two one-source diagnostic pages were run against the existing admitted workspace beginning `sha256:e24bb971...`, in `scripts/api-cleanup`. The first selected `LLMS.md`; the resumed page selected `PRODUCTION_ROUTE_STRATEGY.md`. Both verified the source bytes against their PostgreSQL binding, independently checked the provider receipt, and returned `PARTIAL_DIAGNOSTIC_NOT_ADMITTED`. Both scans were truncated and therefore do not establish directory-wide coverage.

- The code AST diagnostic rejected Markdown paths. Markdown needs the existing document-analysis owner rather than being treated as a TypeScript file.
- LSP correctly reported unsupported language.
- The existing NLP helper received HTTP 500 from 8095. This review did not diagnose the sidecar's internal exception or mark NLP analysis successful.
- No evidence, canonical identity, graph, cache, or GPU writes occurred. Local diagnostic JSON files were produced.

Reports:

- `.tmp/atlas/indexed-source-batch-1792534092547.json` — initial bounded page, before cursor fields were added.
- `.tmp/atlas/indexed-source-batch-1792534166728.json` — resumed page with `afterSourceRef` and `nextSourceRef`.
- `.tmp/atlas/trace-mcp-tool-inventory-v1.json` — static registration inventory after the new tool was added.

The remaining integration work is:

1. Resolve the sidecar's observed HTTP 500 and dispatch Markdown/config files through their appropriate document providers.
2. Generalize the existing Svelte splitter/rune cross-check into all-script TypeScript/JavaScript and comment analysis; connect Svelte-aware LSP/NLP through the current owners.
3. Add a caller from an eligible post-index batch event through the existing durable job/RabbitMQ owner, with idempotency, cancellation, retry limits, and durable receipt references. The process-local MCP queue does not supply those guarantees.
4. Persist eligible observations through the existing evidence owner and independently read them back before wiki regeneration or ACE ContextManifest admission.
5. Reload TRACE, verify the new tool appears, then call one bounded source batch through MCP. Source registration and the live CLI replay do not prove this runtime MCP edge.

## Validation and Scope

Nineteen focused Node tests passed across the batch runner, indexed-source providers, PostgreSQL subhelpers, and Svelte path resolver. They cover limits/concurrency, deterministic ordering, paging, duplicate/missing revisions, failed providers, receipt tampering, read-only SQL lifecycle, and resource cleanup. JavaScript syntax checks and TypeScript syntax transpilation of the MCP server passed. Full application type-check/build and runtime invocation of the new MCP registration were not performed.

`likely_cause`: Tool surfaces and analysis helpers exist, while automatic directory scheduling, provider coverage, and evidence admission still need explicit callers and runtime proof.

`evidence`: MCP tools/list; the live local reports above; `scripts/atlas/audit-indexed-source-batch-v1.mjs`; `scripts/atlas/lib/indexed-source-batch-v1.mjs`; `sveltekit-frontend/src/mcp/trace-mcp-server.ts`.

`patch_targets`: Batch runner/helper/tests, single-source diagnostic, MCP registration, and the repo-analysis pages.

`safe_next_command`: Inspect the failed provider receipt and 8095 logs for the HTTP 500 before further NLP batches.

`smoke_command`: `node --test scripts/atlas/lib/indexed-source-batch-v1.test.mjs scripts/atlas/lib/indexed-source-provider-subhelpers-v1.test.mjs scripts/atlas/lib/pg18-indexed-file-subhelpers-v1.test.mjs scripts/atlas/lib/resolve-svelte-source-file-v1.test.mjs`.

`report_path`: `docs/repo-analysis/mcp-tools.md`.
