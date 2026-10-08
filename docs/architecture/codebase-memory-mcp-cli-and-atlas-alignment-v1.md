# Codebase-Memory MCP CLI and Atlas Alignment

Updated: 2026-10-05

## Purpose and authority

This is an operator command reference and integration proposal for the installed
Codebase-Memory executable. It does not make Codebase-Memory an Atlas owner.
Its SQLite graph, repository IDs, node IDs, embeddings, and tool results are
local derived observations. PostgreSQL/Parent Atlas remains canonical for
packet identity, source/workspace revisions, admission, and evidence. Graphify
remains a distinct structural snapshot/authority path. Codebase-Memory output
must resolve to exact source paths, source revisions, and byte spans before it
can support an Atlas evidence claim. Until then it is diagnostic-only and
`canonicalAuthority=false`.

The executable was found at:

```text
C:\Users\james\Tools\codebase-memory-mcp\dist\codebase-memory-mcp.exe
```

Observed version: `0.11.0`. The following inventory comes from that binary's
`--help`; behavior and argument schemas for individual tools are not assumed.

## Command families

### Inspect/help

```powershell
$exe = 'C:\Users\james\Tools\codebase-memory-mcp\dist\codebase-memory-mcp.exe'
& $exe --help
& $exe --version
& $exe cli --help
& $exe config list
```

These were the only completed executable probes in this pass. `config list`
reported `auto_index=false`, `auto_watch=false`, `watcher_enabled=false`,
`ui_enabled=false`, and `ui_port=9749`. Configuration is machine-local and may
change; re-read it before any future operation.

### MCP server / client registration

```powershell
& $exe
& $exe install --dry-run --skip-config
& $exe install --skip-config
& $exe uninstall --dry-run
& $exe update --dry-run
```

The bare invocation runs the MCP server on stdio. Install/uninstall/update are
environment mutations; even dry-run behavior should be verified for the
installed version before use. Do not run install/update/uninstall as part of a
retrieval benchmark, and do not let an installer rewrite shared agent configs.
The executable advertises 45 possible client surfaces, which is not a reason
to enable them globally. Keep the normal Ornith surface small; expose this
challenger only to a bounded specialist after parity and identity gates pass.

### Single-tool CLI

General form from `--help`:

```powershell
& $exe cli [--quiet|--progress|--verbose] [--json] <tool> [args]
```

The binary advertised these tool names:

```text
index_repository       search_graph          query_graph
trace_path             get_code_snippet      get_file_outline
get_graph_schema       compare_graphs        get_architecture
search_code            list_projects         delete_project
index_status           check_index_coverage  detect_changes
manage_adr             ingest_traces
```

Initial risk grouping (not a substitute for per-tool schema/implementation
review):

| Group | Commands | Atlas treatment |
|---|---|---|
| Candidate read/inspection | `list_projects`, `index_status`, `check_index_coverage`, `get_graph_schema`, `get_architecture`, `get_file_outline`, `get_code_snippet`, `search_code`, `search_graph`, `trace_path`, `compare_graphs` | Candidate diagnostics only; confirm tool schemas, bounds, and whether the call initializes or updates local state before benchmarking |
| Query surface requiring guard | `query_graph` | Treat as potentially mutation-capable until its query language and read-only enforcement are verified; do not pass model-generated arbitrary queries |
| Local index/state mutation | `index_repository`, `detect_changes`, `manage_adr`, `ingest_traces` | Hold behind explicit disposable-worktree/test-data authorization; these can change local indexed state or retained observations |
| Destructive | `delete_project` | Do not use in the Atlas evaluation |
| Machine configuration / installation | `config set/reset`, `--ui` toggles, `install`, `uninstall`, `update` | Do not use without separate operator authorization and a captured before/after config receipt |

Read-only status is a hypothesis until the installed tool schema and
implementation confirm it. A command returning a result does not prove it had
no local side effects.

## Command execution log for this pass

Commands executed against the binary, in order:

1. `& $exe --help 2>&1 | Select-Object -First 80` — completed; printed version
   `0.11.0`, invocation forms, option families, 45 client surfaces, and the 17
   tool names listed above.
2. `& $exe --version 2>&1` — completed; printed `codebase-memory-mcp 0.11.0`.
3. `& $exe config list 2>&1` — completed; printed the local configuration
   values recorded above.
4. `& $exe cli --json list_projects` — issued in a combined read probe but
   produced no project payload before that probe timed out; later commands in
   that combined probe were not counted as proven executions.
5. `& $exe cli --help 2>&1` — completed; confirmed single-tool CLI syntax and
   emitted an allocator warning. No tool arguments were executed by this help
   invocation.
6. `& $exe cli --json list_projects '{}'` — did not return within the bounded
   wait and was interrupted. It emitted a deprecation warning about raw JSON
   arguments. Treat direct CLI calls as potentially initializing local state;
   do not retry until the current index operation is understood.

No explicit `index_repository`, `delete_project`, install, update, config
mutation, or project-index command was intentionally issued in this pass.
However, a process census observed this separate process tree:

```text
timeout.exe 900 /c/Users/james/Tools/codebase-memory-mcp/dist/codebase-memory-mcp.exe cli --progress index_repository
  └─ codebase-memory-mcp.exe --cbm-daemon-internal
      └─ codebase-memory-mcp.exe cli --index-worker ... index_repository {"repo_path":"C:/Users/james/Videos/deeds-web-app"}
```

The timeout parent was not this documentation command; its initiating owner
was not established. The process was not stopped or modified. This is evidence
that an index operation was active against the worktree at the time of the
census, not evidence that indexing completed, that its output is safe, or that
the operation was launched by this pass. Do not start another index job. The
index result and local SQLite readback remain `NOT_VERIFIED`.

A later process census at 18:27 local time observed another timeout-owned
`cli --progress index_repository` tree whose worker argument targeted
`C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/src`. It was also not
stopped or modified. The two observed repo roots differ; do not merge their
results or assume either is the intended project root. The current initiating
owner and completion/readback status remain `NOT_VERIFIED`.

Follow-up read-only check of
`C:\Users\james\.cache\codebase-memory-mcp\logs\cbm-daemon.log` found three
`daemon.index.worker_budget` records for the repo root and two SvelteKit
scopes, but no indexed-job terminal state or cancellation cause in the
matched log output. A subsequent process census found no active
`codebase-memory-mcp.exe` process. Therefore an abort/completion occurred, but
who initiated it and whether it ended by caller cancellation, wrapper timeout,
or normal completion are `NOT_VERIFIED` from available evidence.

## Web documentation analysis (2026-10-05)

Official upstream documentation was searched and reviewed to interpret the
observed process behavior; this is external documentation analysis, not a
workstation execution receipt:

- [Codebase-Memory CLI and indexing documentation](https://github.com/DeusData/codebase-memory-mcp)
  says `index_repository` is an explicit indexing tool, synchronous by default;
  if a caller cancels/disconnects and no other client is waiting, the daemon may
  cancel the index. Its one-shot CLI starts a temporary worker for indexing.
- [Codebase-Memory configuration documentation](https://github.com/DeusData/codebase-memory-mcp/blob/main/docs/CONFIGURATION.md)
  defines `auto_index=false` as disabling automatic indexing of new projects on
  MCP session start. It does not disable explicit `index_repository` calls.
  `auto_watch` and `watcher_enabled` govern watcher registration/startup, not
  manual indexing.
- This supports caller cancellation/timeout as a plausible explanation for
  the observed job ending, but does not identify the caller or prove whether
  cancellation, wrapper timeout, or normal completion occurred. Keep the cause
  `NOT_VERIFIED` until a terminal receipt/log entry is obtained.
- The upstream documentation and linked paper PDF were reviewed in-browser;
  no external source files or PDF were downloaded into the repository by this
  analysis.

## Alignment for agentic dense search and error fixing

### Why evaluate this executable

It is worth a bounded challenger test because its native C executable combines
Tree-sitter extraction, a local SQLite structural graph, and MCP/CLI query
surfaces in one low-dependency process. That can be nimble for questions with
explicit code structure—definitions, callers/callees, call paths, and impact—
where repeated lexical file reads are costly. The upstream speed/token claims
are vendor-reported and are not evidence that it is faster, more correct, or
cheaper on this Windows workspace. Do not adopt it merely because it is C or
ships as an `.exe`; retain it only if a frozen local comparison demonstrates
useful quality/cost tradeoffs and its results resolve to Atlas source evidence.

Upstream describes the implementation as C, with MCP JSON-RPC over stdio and
an optional one-shot CLI; its shipped native binary is a separate process, not
a Node addon. Therefore **do not add N-API as the integration seam**. Prefer
the existing MCP/helper registry boundary. A future TypeScript adapter may
invoke the MCP stdio server through the repository's existing transport owner.
Use an N-API bridge only if profiling later proves serialization/process
overhead material and a stable in-process ABI is specified; it would still not
make Codebase-Memory identity canonical. See upstream's
[repository architecture](https://github.com/DeusData/codebase-memory-mcp) and
[contributor/source layout](https://github.com/DeusData/codebase-memory-mcp/blob/main/CONTRIBUTING.md).

### Embedding and pgvector boundary

Upstream currently documents `search_graph.semantic_query` as using bundled
`nomic-embed-code` vectors (768-dimensional int8), compiled into the
executable, with local SQLite-backed graph/vector storage. This is not
EmbeddingGemma/Ollama, not Atlas `content_embedding_768`, and not a
PostgreSQL/Drizzle `vector(768)` read/write path. Matching dimensionality does
not establish model, tokenizer, pooling, normalization, quantization, input
policy, or representation-revision parity. Do not merge its scores with Atlas
`semantic_768`, import its vectors into pgvector, or use its results as
canonical evidence. For benchmarking, compare CBM's semantic query as a
separate challenger lane and resolve candidate files/symbols to Atlas identity
and exact source evidence.

The installed executable's help confirmed that `search_graph` exists, but the
semantic model name/recipe still comes from upstream documentation, not a
local model receipt. A local read-only SQLite probe (Python stdlib SQLite URI
`mode=ro`) confirmed the storage shape and current local index contents:

| Local project root | Nodes | Edges | Node vectors | Token vectors | Stored vector byte lengths |
|---|---:|---:|---:|---:|---|
| `.../sveltekit-frontend/src` | 74,735 | 250,913 | 22,896 | 13,962 | 768 bytes for every stored row |
| `.../sveltekit-frontend/src/lib/server/atlas/workflow` | 139 | 373 | 54 | 365 | 768 bytes for every stored row |
| `.../sveltekit-frontend/src::missed` | 225 | 224 | 0 | 0 | no vectors |

Both vector tables store only `(node_id, project, vector)` or
`(id, project, token, vector, idf)`; `store_meta` contains `db_uid`, mutation
generation, and a coverage fingerprint, but no model ID, model digest,
tokenizer, pooling, normalization, or representation revision. The 768-byte
payload length is consistent with the upstream 768-value int8 description,
but length alone does not prove numeric encoding or model identity. No
`content_embedding_768` values were read, copied, or compared. Current Drizzle
code declares Atlas `content_embedding_768` as `vector(768)` and a separate
`content_embedding` as `halfvec(768)`; these are different storage/retrieval
owners, and neither is aligned to CBM merely by dimension.

At probe time no CBM process was active. The cache contains two indexed source
scopes and a `::missed` scope, not a proven full-worktree index. These local
readbacks prove vector rows exist, not that the observed index jobs completed
successfully or that semantic search ranks correctly. Atlas/CBM representation
parity is therefore `NOT_PROVEN`; keep score fusion, vector import, and
evidence promotion disabled.

### Worktree tournament: fair comparison protocol

“Tournament” means a controlled same-input challenger comparison, not parallel
agents writing or indexing the live checkout:

1. Wait until the currently observed indexing attempts are terminal and their
   project names/generations are read back. Do not combine the root and
   `sveltekit-frontend/src` indexes; choose one explicit scope.
2. Freeze one clean disposable worktree/copy at a recorded commit plus a
   deterministic uncommitted-diff checksum if dirty-state support is required.
   Never index the active developer worktree for the benchmark.
3. Give the challenger an isolated `CBM_CACHE_DIR` and constrain it with
   `CBM_ALLOWED_ROOT` to that disposable copy. Keep auto-index/watch off; any
   config setup is confined to the isolated cache. Set explicit file/byte caps
   before indexing. Index exactly once; do not run concurrent index workers.
4. Freeze and independently label the same query cohort for Atlas and CBM:
   exact symbol lookup, definition, callers/callees, bounded call path, and
   change-impact/error-localization cases. Include expected file/symbol/span
   evidence and queries where lexical search should win.
5. Run lanes separately: Atlas exact/AST; Atlas canonical `semantic_768`;
   CBM structural search/traversal; optional CBM semantic search as its own
   noncanonical challenger. Do not merge scores or give CBM an extra fusion
   vote. Keep agent/model/prompt/tool schemas and result budgets fixed.
6. Compare answer correctness, expected-evidence recall/rank, exact source-span
   resolution, revision/freshness qualification, latency, tool calls, and input/
   output tokens. A result that cannot resolve to Atlas identity is a
   diagnostic hit, not a successful evidence hit.
7. Re-run the same cohort against a second frozen snapshot only as a separate
   staleness test. Do not turn auto-watch on until stale-index detection and
   rebuild behavior are measured and separately authorized.

The tournament passes only as a **usefulness challenger** when it improves a
predeclared quality/cost measure without weakening evidence qualification.
It does not pass canonical Graphify incidence, semantic representation
lineage, or repair authorization.

```text
user request / error / log observation
  ↓
QueryAnalysisV1 + bounded RetrievalParameterPlanV1
  ├─ exact text/location: existing rg / Atlas lexical lane
  ├─ canonical dense retrieval: Atlas semantic_768 / PostgreSQL owner
  ├─ structural challenger: Codebase-Memory search/trace/outline
  └─ admitted graph: Graphify/HyperRAG only when revision-qualified
  ↓
identity and revision resolver
  ↓
bounded evidence set / ContextManifest candidate
  ↓
repair proposal → independent validator → authorized bounded execution
```

Rules for a future comparison:

- Freeze the same query set, worktree revision, filters, and time budget for
  Atlas helpers and Codebase-Memory. Report correctness, latency, tool calls,
  and tokens separately; upstream/vendor token claims are not local results.
- Do not treat Codebase-Memory's local graph or bundled semantic search as a
  second canonical dense lane or an independent RRF vote. Atlas
  `semantic_768` remains the dense identity/evidence owner; Codebase-Memory is
  a challenger until parity, freshness, and canonical resolution are proven.
- For a returned node, preserve tool name/arguments, project/index revision,
  path, symbol, relation, depth, byte span, and content checksum when supplied.
  Missing source/workspace revision or an inexact span means
  `DIAGNOSTIC_ONLY`, not evidence promotion.
- For repair work, route structural hits into a bounded `ContextDagPlan` or
  `NextActionProposalV1`; never let graph traversal directly edit files, change
  OpenSpec task state, write Atlas stores, or authorize a repair.
- Logs and ingested traces are untrusted observations. Bind service, time,
  request/trace ID, and log checksum; resolve referenced code before proposing
  a fix. Do not persist raw logs as canonical memory.
- Keep automatic index/watch disabled until the current run is reconciled,
  disposable-root isolation is proven, and stale-index behavior is measured.

## Safe next sequence

1. Observe the already-running `index_repository` operation through its owning
   terminal/operator; do not launch a duplicate or kill it blindly.
2. After it exits, capture `index_status` and local index metadata in a
   disposable repo copy, then verify the indexed root and exclusions.
3. Freeze five structural questions and their expected source locations.
4. Compare against Atlas `rg`/AST/semantic owners; treat output as a challenger
   until exact source identity/revision/span mapping succeeds.
5. Only then propose a thin existing-helper-registry adapter and error-fixing
   workflow gate. Keep watch, default-agent exposure, and persistent admission
   separate decisions.

`writesPerformed` for this documentation pass: no Atlas/Postgres/Qdrant/Neo4j/
Valkey writes were attempted. A Codebase-Memory index process was observed,
but its provenance and outcome are unresolved; no clean zero-local-write claim
is made for the entire workstation interval.
