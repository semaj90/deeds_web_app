# Parent Atlas — MCP Tool Registry Parity Audit

**Phase**: 1 of the Parent Atlas Workstation Integration audit (Phase 4 in the
originating spec — deliberately run first per that spec's own closing
instruction). Scope: MCP list↔handler↔import parity only. ACP/A2A/tRPC/
Mastra/LangGraph/Redis-centroid/384-dim/recommendation-Kanban phases are
**not** covered by this document — see "Not yet audited" at the bottom.

**Method**: real TypeScript compiler API AST parse (`scripts/atlas/validate-mcp-tool-registry-parity.mjs`),
not regex. Raw machine-readable output: `docs/reports/parent-atlas-mcp-tool-registry-parity.json` /
`.md`. Status vocabulary below follows the required set only:
PROVEN / PARTIAL_PROVEN / PRESENT_UNPROVEN / NOT_PROVEN / BLOCKED / STUB / LEGACY / DEAD_OR_UNREFERENCED.

## Executive finding

**Disconnected subsystems, not one coherent workflow.** This repo runs (at
minimum) three independent MCP servers with overlapping tool surfaces and no
evidence of a single canonical registry:

| Server | Shape | Tools listed | Tools dispatched | Status |
|---|---|---|---|---|
| `sveltekit-frontend/src/lib/server/mcp/server.ts` | array-literal + **switch (89 cases) + if-chain (18)** | 85 | ~107 unique across both mechanisms | PARTIAL_PROVEN |
| `sveltekit-frontend/src/mcp/server.ts` | array-literal + switch (89) + if-chain (18) | 85 | ~107 unique | PARTIAL_PROVEN |
| `sveltekit-frontend/src/mcp/trace-mcp-server.ts` | `registerTool()` calls (SDK high-level API) | 117 (self-contained) | 117 | PARTIAL_PROVEN |

**PARTIAL_PROVEN**, not PROVEN, on all three: static structure is real and
AST-confirmed (this is stronger than the previous "162 tools registered per
`tools/list`" claim, which only proved registration, not handler-runtime-service
wiring). No handler in any of the three was executed this pass — that's
Phase 4's own remaining half (runtime proof), not done here.

## Finding 1 — Two independently-maintained 85-tool registries

`src/lib/server/mcp/server.ts` and `src/mcp/server.ts` list **the exact same
85 tool names** (100% overlap, confirmed via cross-file name diff), yet
`diff` between the files shows 11,336 differing lines out of ~11,332 total —
essentially every line differs. These are not the same file re-exported;
they are two hand-maintained implementations of the same tool surface.

This means every one of these 85 tools potentially has **two independent,
divergent implementations** live in the repo simultaneously, with no
evidence of which one (if either) actually serves production traffic, or
whether both do (stdio vs. some other transport) and can drift silently.

- **Status**: PRESENT_UNPROVEN — which server(s) are actually invoked at
  runtime by which client (Claude Desktop / Continue / Cursor / the app
  itself) was not traced this pass.
- **Evidence**: `docs/reports/parent-atlas-mcp-tool-registry-parity.json`,
  cross-file duplicate list (85 entries, all `lib-server-mcp` ↔ `mcp-server`).

## Finding 2 — A second, undocumented dispatch mechanism inside `src/lib/server/mcp/server.ts`

The file has **two separate dispatch paths**, not one:

1. `_handleToolCallInner(name, args)` at line 2299 — a `switch (name) {`
   with 89 cases (line 2303), wrapped by `handleToolCall()` which adds
   telemetry (`withToolCallRecord`) and Redis caching (`withMcpCache`).
   This is the primary dispatcher for most of the 85 listed tools.
2. The `CallToolRequestSchema` handler at line 5726 — a **separate**
   if/else-if chain (18 branches) that intercepts specific tool names
   (`face:identify`, `poi:face_synth`, the LDR research tool, `phase18_reranker`,
   `atlas.identity_audit`, `atlas.cross_store_proof`, the 7 `atlas.*`
   semantic tools, and 5 `phase109a_*` signal-lifecycle tools) **before**
   presumably falling through to `handleToolCall()` for everything else.

Falling-through was not confirmed by reading past line 5786 this pass —
flagged as PRESENT_UNPROVEN, not assumed.

- **Status**: PRESENT_UNPROVEN (structure confirmed; fallthrough behavior
  and telemetry/cache wrapping correctness for the if-chain branch not
  traced).

## Finding 3 — 21 dispatchable tools that are never advertised via `tools/list`

`src/lib/server/mcp/server.ts` has 21 tool names reachable through dispatch
(the if-chain, line 5726+) that do **not** appear anywhere in the 85-entry
`tools:` array returned by the `ListToolsRequestSchema` handler:

```
identity:quarantine, identity:recover, envelope:validate,
mirror:sync_qdrant, mirror:sync_neo4j, graph:expand, retrieval:rerank,
answer:synthesize, escalation:route,
atlas.discover, atlas.retrieve, atlas.build_context, atlas.inspect_runtime,
atlas.apply_change, atlas.validate_change, atlas.delegate,
phase109a_archive_signal, phase109a_supersede_signal,
phase109a_promote_recommendation, phase109a_query_signal_history,
phase109a_validate_state_transition
```

`src/mcp/server.ts` has the same 21 plus `ldr_research` (22 total) — its LDR
branch compares against a different constant/string than the lib-server
variant.

A client that calls `tools/list` and only invokes what it sees will never
reach these 21-22 handlers. Conversely, a client (or another part of the
codebase) that already knows these names by other means (docs, a hardcoded
call, MCP `tools/call` without a prior `list`) can invoke them — this is
either dead code (if nothing calls them) or a hidden/undocumented capability
(if something does), and this pass did not determine which.

- **Status**: NOT_PROVEN for "dead" vs. "hidden-but-live" — needs a caller
  search (`rg` for each of these 21 names across `src/`) as the next step,
  not done in this pass to stay within Phase 4's own scope.
- **Note on `identity:*`, `envelope:validate`, `mirror:sync_*`**: these
  names correspond to imports already visible in the file header
  (`toolIdentityRecover`, `toolEnvelopeValidate`, `toolMirrorSyncQdrant`,
  `toolMirrorSyncNeo4j` from `../dispatch/mcp-tool-implementations.js`,
  per the file's own import block) — the import exists, the dispatch
  branch exists, but the listing doesn't. This is the exact
  "handler not exposed through MCP tools" failure mode named in the
  originating audit spec.

## Finding 4 — `trace-mcp-server.ts` structurally cannot have listing/handler gaps, but has its own risk class

117 `registerTool(name, options, handler)` calls, each self-contained (name +
handler in one call — the SDK's high-level API). By construction, listing
and dispatch can't drift apart the way they do in the other two servers.

- **Status**: PARTIAL_PROVEN. 0 duplicate names, 0 non-function handler
  arguments, 0 unresolved (non-literal) tool names — all clean by this
  pass's checks. Runtime execution of any of the 117 handlers was not
  proven this pass.
- **Open risk not covered here**: the file monkey-patches
  `server.registerTool` to also populate a separate `toolRegistry` Map for
  a `batch_call` feature (line 789-871) — whether that shadow registry
  stays in sync with the SDK's own internal registry across all 117 calls
  was not verified.

## Finding 5 — Cross-server duplicate tool names, including 3-way collisions

85 tool names exist in both `lib-server-mcp` and `mcp-server` (Finding 1).
5 of those names *also* exist in `trace-mcp-server.ts`'s independent
117-tool registry: `atlas.packet_search`, `atlas.coverage`,
`clusters.get_summary_lenses`, `wiki.status`, `wiki.search`,
`wiki.explain_page`, `wiki.refresh_directory` (7, not 5 — see raw report).
That means at least 7 tool names are implemented **three separate times**
across three servers.

- **Status**: PRESENT_UNPROVEN — no evidence found this pass of which
  implementation (if any) is authoritative for a 3-way name.

## Status summary (required vocabulary)

| Capability | Status |
|---|---|
| MCP tool listing structure (all 3 servers) | PROVEN (AST-confirmed, not runtime) |
| MCP tool dispatch structure (all 3 servers) | PROVEN (AST-confirmed, not runtime) |
| Any specific tool's runtime execution | NOT_PROVEN (zero tools invoked this pass) |
| `src/lib/server/mcp/server.ts` vs `src/mcp/server.ts` — which is canonical | NOT_PROVEN |
| 21-22 unlisted-but-dispatchable tools — dead or hidden | NOT_PROVEN |
| `trace-mcp-server.ts` batch_call shadow registry sync | PRESENT_UNPROVEN |
| Repair tools (`handleRepairToolCall`) | Confirmed **commented out** at line 2300 (`// disabled: broken retrieval module deps`) — STUB, correctly hidden from dispatch (the line is a no-op comment, not reachable code) |
| ACP registration (`bootstrapACPRegistry`, `registerDispatcherToolsAsACP`) | Confirmed called via `Promise.allSettled` at server startup (line 164-167) — registration call PROVEN, downstream consumer/task-round-trip NOT_PROVEN (Phase 6 of the full spec, not run this pass) |

## Not yet audited (remaining phases from the originating spec)

Phases 1-3 (repo scope, library inventory, static import graph) partially
covered as inputs to this doc but not written up as separate deliverables.
Phases 5-17 (capability-aware registry design, ACP/A2A/tRPC/Mastra/LangGraph/
LDR ownership, Redis/Valkey vector + centroid audits, retrieval consolidation,
llm_synthesis lineage, agentic error-fixing chain, recommendations/Kanban
parity, 384-dim classification, full validation harness) are **not started**.
Each was scoped in the original request as a separate phase; this document
covers Phase 4 only, per explicit agreement before starting.
