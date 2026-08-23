# MCP tool deep audit — 2026-08-22

Status: `PARTIAL_PROVEN / ALIGNMENT_REQUIRED`

This report covers active MCP/tool surfaces only. Archived files are excluded
from the active counts, but exclusion is not treated as resolution.

## Inventory

| Surface | Observed | Meaning |
|---|---:|---|
| Live MCP endpoint | 175 | Runtime `tools/list` result from the local MCP endpoint |
| Trace static registrations | 119 | AST/registration count in `trace-mcp-server.ts` |
| Manifest entries | 190 | Generated/static tool manifest records |
| Combined registry index entries | 327 | Cross-surface index; not a proof of unique runtime handlers |
| Trace duplicate registrations | 0 | Static duplicate check passed |
| Trace unresolved handlers | 0 | Static registration parity passed |

The difference between 175 live tools and 119 static Trace registrations is an
active registry reconciliation gap. It must not be described as “119 tools
complete.”

## Open active gaps

1. The legacy `sveltekit-frontend/src/mcp/server.ts` has 22 dispatch handlers
   without matching listed tools. These include identity, mirror, graph,
   retrieval, synthesis, escalation, and Phase 109A handlers.
2. Seven names are duplicated between the legacy MCP server and Trace MCP:
   `atlas.packet_search`, `atlas.coverage`, `clusters.get_summary_lenses`,
   `wiki.status`, `wiki.search`, `wiki.explain_page`, and
   `wiki.refresh_directory`.
3. The ontology has 65 tools in the `unknown` layer. These are not necessarily
   broken, but they are not safely rankable by the current tool policy.
4. The implementation profile explicitly marks `atlas.search`,
   `atlas.patch.propose`, and `atlas.patch.apply` as `STUB` and non-routable.
5. `phase18_reranker` was removed from the legacy MCP exposure because its
   implementation returns randomized placeholder scores. Its source remains
   quarantined until a real XGBoost model and receipt-backed inference exist.
6. The active MCP schema audit previously found four failures: one missing
   `labels` description and six missing command descriptions. Those are now
   corrected; the schema audit reports `4 pass, 0 fail`.
7. The `.opencode/tools` directory is absent. The static Vercel tool-schema
   smoke checker therefore cannot prove that surface.

## Deeper active-list findings

The live ontology report contains 65 tools with `retrieval_layer: unknown`.
This is an active classification gap, not an archive gap. The largest
unclassified families are knowledge-base/search (`kb.*`, `trace_*`), legal
search, topology/manifold, library administration, and context compression.
Until each tool has an explicit lane, backend, permission, and proof status,
it must not be used as a ranked candidate by the agent policy.

The first ontology pass over-reported 15 tools as `read_write` because names
such as `db.*`, `graph.*`, and `coverage` matched store heuristics. The
classifier now emits `operation_kind` and applies explicit read-only
overrides. The current 175-tool result is: 150 `READ`, 20 `AUDIT`, 1
`PROPOSE`, and 4 `APPLY`. The remaining apply owners are explicit: Engram
memory injection/storage, temporal fix-attempt recording, and image-to-graph
linking. This is an audit classification, not live mutation proof.

The policy should continue using `operation_kind` (`READ`, `PROPOSE`, `APPLY`,
`AUDIT`) plus an explicit `writes_to` owner and receipt gate.

The live endpoint currently exposes 175 tools while the static Trace server
contains 119 registrations. This means the ontology is observing a broader
runtime surface than the active Trace source. The missing reconciliation
must identify whether each additional tool is generated, legacy, proxy,
internal, or unowned; it must not archive or silently discard them.

## Current executable policy

- Ornith receives bounded tool groups of at most three tools.
- Tools with explicit `STUB`/non-routable status are not eligible for model
  selection.
- Write-capable tools remain permission/receipt gated.
- Registration is not execution proof; execution proof requires a bounded
  call receipt, valid result schema, error classification, and replay behavior.

## Next implementation gates

1. Reconcile the 175 live tools against the 119 Trace registrations and 190
   manifest records using one canonical runtime registry.
2. Resolve the 22 legacy handler/list mismatches: expose only handlers with
   complete schemas, or mark intentionally internal handlers explicitly.
3. Deduplicate the seven cross-server names or assign explicit server owners.
4. Classify the 65 unknown tools by lane, backend, permission, and proof state.
5. Add a bounded smoke call for each promoted search, graph, context, rerank,
   and error-recovery tool; record receipts rather than relying on registration.
6. Keep HMM/Vibreti-style repair and ranking tools challenger-only until their
   handlers produce deterministic, non-placeholder results.
7. Add an ontology classification receipt for every unknown tool and a
   mutation-owner receipt for every non-read-only tool before enabling model
   routing.
8. Re-run the audit with a generated `activeToolRegistryV1` that records one
   owner per tool name, one dispatch surface, one operation kind, and one
   proof status. Keep legacy/proxy tools visible as `QUARANTINED` or
   `INTERNAL`, rather than treating them as absent.

## Agent/runtime alignment check

- tRPC is present at `/api/trpc/[...procedure]` and is correctly scoped as a
  typed SvelteKit RPC boundary; it is not the MCP or durable workflow owner.
- Mastra compiler/snapshot/DAG fixtures passed `6/6` in SvelteKit.
- `@deeds/atlas-orchestrator` is present and its direct TypeScript build now
  passes after removing stale unused Mastra imports and separating the
  PageRank input schema from its step object. Runtime PageRank write/promotion
  proof remains open.
- Streamable MCP is live: JSON-RPC verification saw 175 tools and a working
  `tools/list`/`tools/call` SSE path. The tested invalid arguments were
  rejected, which confirms schema enforcement rather than successful business
  execution.
- OpenCode configuration points to `hforf.gguf` at
  `http://127.0.0.1:8090/v1`; health and model discovery returned 200.
- A bounded `/v1/chat/completions` probe returned `READY`; a required-tool
  probe returned one `atlas_ping` tool call with `{}` arguments. This proves
  facade protocol/tool-call compatibility only, not MCP execution, agent
  replay, or production promotion.
- OpenCode wiring check passed. The repository’s 8090 summary-pipeline TODO
  remains open because no receipt-backed end-to-end search → tool → result →
  cache replay was proven.

The local OpenCode configuration uses the installed v1-style `provider` /
`npm` / `options.baseURL` shape and passes the repository wiring check. Current
OpenCode documentation also describes a newer `providers` /
`package` / `settings.baseURL` shape, so upgrading the desktop binary requires
a separate config-compatibility proof; do not silently rewrite the working
config. The installed desktop binary reports `1.3.14.0`.

The alignment conclusion is therefore:

- tRPC: `WIRED`, typed app boundary only.
- Mastra: `FIXTURE_PROVEN`; package TypeScript build `PASS`; runtime
  PageRank/write promotion remains unproven.
- MCP Streamable HTTP: `PROTOCOL PROVEN`; business-tool replay remains open.
- OpenCode → 8090 `/v1`: `LOCAL PROTOCOL PROVEN` for model discovery,
  completion, and required tool-call shape.
- OpenCode agent triggers → MCP → tool result → cache/receipt: `NOT PROVEN`.
- Streamable cache replay with stable packet identity and durable receipt:
  `NOT PROVEN`.

## Database ownership correction

The application database owner is Drizzle: SvelteKit DB clients and tRPC
routers import `drizzle-orm`, and the frontend package declares Drizzle/Drizzle
Kit. Prisma is not an application database owner and must not be introduced
for Atlas persistence.

The installed historical `@mastra/core@0.1.26` package carries Prisma-shaped
type declarations and Prisma dependencies, but the repaired
`packages/atlas-orchestrator/src` no longer imports Mastra at runtime. Its
workflow descriptors compile independently. Treat this as dependency hygiene:
either upgrade/isolate Mastra behind a non-persistence adapter or remove the
unused package dependency; do not add Prisma schema, migrations, or clients.

No Postgres, Qdrant, Neo4j, Valkey, or canonical graph writes were performed.

## Validation snapshot

- MCP schema validation: `4 pass, 0 fail`.
- AI/MCP bridge and routing focused tests: `14/14 passed`.
- Static parity remains intentionally failing: the legacy server has 22
  handler-only names and seven cross-file duplicate names; the Trace server
  itself has 119 unique registrations with no unresolved handlers.
- `.opencode/tools` remains absent, so that separate static smoke surface is
  still unverified.

This audit therefore confirms that the recent quarantine and schema repairs
are safe, but it does not promote the broader tool list. The next required
artifact is an active registry manifest with explicit ownership and proof
state for every live tool, including proxy/internal tools and tools currently
classified as ontology-unknown.
