## Why

The Phase 4 MCP tool registry parity audit (`docs/parent-atlas/MCP_TOOL_REGISTRY_AUDIT.md`)
proved *structural* facts — which tool names are listed, dispatched, and
imported across the 3 MCP server files. It did not prove runtime behavior.
A caller trace on top of that audit surfaced three separate runtime
classes that the original PROVEN/NOT_PROVEN vocabulary blurred together:
LangGraph dispatcher nodes with real implementations but an orphaned
orchestration entrypoint, Atlas MCP tools with real gRPC-backed handlers,
and a live authenticated HTTP route (`/api/atlas/mastra-agent`) that
imported real Atlas tool functions but never called them — returning
fabricated evidence with `success: true` instead.

This proposal corrects the status vocabulary (adds a runtime-ownership
axis on top of the static-dispatch axis), re-verifies every claim against
current code via `rg`, and replaces "audit MCP parity" with the actual
next problem: **the repo has no single pre-call validation layer**, so
four different transports (MCP, tRPC, LangGraph, gRPC) would otherwise
grow four independently-drifting schemas for the same Atlas operations —
exactly the pattern that produced 8 incompatible Redis centroid key
schemes (see `openspec/changes/session-159-followup-tasks.md`, Phase 11
audit) and one fabricated-success HTTP route.

## Corrected Status Summary (re-verified 2026-08-02, evidence-linked)

| Finding | Corrected status | Evidence |
|---|---|---|
| MCP tool registration/dispatch structure, all 3 server files | `STATIC_PROVEN` (not bare `PROVEN`) | AST parse of `tools:[]`, switch/if-chain dispatch, `registerTool()` calls. No tool was invoked. |
| Canonical ownership `src/mcp/server.ts` vs `src/lib/server/mcp/server.ts` | `RESOLVED` | Latter archived this session (`158ec39263`) — dead duplicate, zero references in `.mcp.json`/`opencode.jsonc`/`api/mcp` route. |
| Group A — LangGraph dispatcher tools (9 nodes) | `INDIVIDUAL_NODE_IMPLEMENTATION: PRESENT` · `DISPATCHER_GRAPH_CONSTRUCTION: PRESENT` · `ORCHESTRATION_EXTERNAL_TRIGGER: DEAD_OR_UNREFERENCED` · `END_TO_END_DISPATCH_EXECUTION: NOT_PROVEN` | `rg "startIdentityListener\("` across `src/` → **zero real call sites** (only the definition + a re-export). `startIdentityListener` (`src/lib/server/dispatcher/rabbitmq-identity-listener.ts:45`) is never invoked from any route, hook, or npm script. No `atlas:dispatcher:worker`-style script exists in `package.json`. |
| Group B — Atlas MCP tools (`atlas.*` handlers) | `PARTIAL_PROVEN` for static wiring only | Dispatch reaches real gRPC-backed handlers; runtime execution/output validation not exercised in this pass. |
| `POST /api/atlas/mastra-agent` | **RESOLVED this session** (was `LIVE_STUB` / `FAILED_RESPONSE_INTEGRITY`) | `+server.ts:41-90` — request schema now requires `acknowledgeMock: z.boolean().default(false)`; default path returns `501` + `{success:false, error:'not_implemented', message:'...'}` explaining the route is unwired. Opt-in path now also returns `mock:true` + explicit `warning` field alongside the simulated response. **Still not a real Mastra integration** — the `MastraAgent` instantiation is commented out (`+server.ts:134-148`); this is correctly a Mastra-branded live demo stub with an honest contract now, not a fix that makes it real. |
| Group C — `phase109a_*` tools | `PARTIAL_PROVEN` for static dispatch (registry + Zod parse + handler invocation present; handler internals/persistence not executed) | unchanged from prior audit |
| Group D — `ldr_research` | `PARTIAL_PROVEN` for static dispatch (reaches a dedicated orchestrator, not a canned response; backend execution/output validation not exercised) | unchanged from prior audit |
| ACP bootstrap (`Promise.allSettled` registration) | `INVOCATION_PROVEN` / `REGISTRATION_SUCCESS: NOT_PROVEN` | `allSettled` only proves the registration functions were called, not that they fulfilled. |
| Real LangGraph package/runtime | `PRESENT` | `@langchain/langgraph` + `@langchain/core` installed; `StateGraph`/`Annotation`/`END`/`START` used for real in `dispatcher-graph.ts`. |
| Real Mastra package/runtime | `NOT_PROVEN` (package absent) | Confirmed via `package.json` audit — no `@mastra/core`. Everything calling itself "Mastra" in this repo is homegrown naming; both call sites (`atlas-mastra-adapter.ts`, `atlas-mastra-workflow.ts`) now use local passthrough shims, not the real runtime. |
| Real Deep Agents package/runtime | `NOT_PROVEN` (package absent) | not found in `package.json` |
| tRPC presence | **`PRESENT`, previously miscategorized as unverified** | `@trpc/client`/`@trpc/server` 11.18.0 installed; real server wiring at `src/lib/server/trpc/{init,router}.ts`, 4 sub-routers (`agent`, `analytics`, `search`, `workflow`), SvelteKit adapter at `src/routes/api/trpc/[...procedure]/+server.ts`. `workflow.ts` and `agent-run-service.ts` already reference "atlas" concepts. |
| `.okf` ownership | `PRESENT`, repo-internal only | OpenSpec Knowledge Framework manifest (`.okf/manifest.yaml`) — not an external Google framework; do not attribute externally. |
| Centroid Redis/Valkey key contract | `NOT_PROVEN` (contract) / `PROVEN` (naming drift) | See `session-159-followup-tasks.md` Phase 11 audit — 8 incompatible schemes, zero live keys under any of them. |
| `parallel-orchestrator.ts` centroid lane (`redis.keys('centroid:feature:*')`) | `CENTROID_LANE_IMPLEMENTATION: PRESENT` · `CENTROID_LANE_DATA_SOURCE: NOT_PROVEN` · `CENTROID_LANE_RESULTS: PROVEN_EMPTY` · `CENTROID_LANE_DEGRADED_SIGNAL: MISSING` | `parallel-orchestrator.ts:183`. No configuration/health signal surfaces the empty result as anything other than "searched, found nothing." |
| **New finding**: `parallelRetrieve()` itself (the whole 5-lane orchestrator) | `DEAD_OR_UNREFERENCED` at its own entrypoint | `rg "parallelRetrieve\("` across `src/` → only self-reference inside its own file. Nothing in the app currently calls this orchestrator at all — the centroid-lane issue is real but currently unreachable in production. |
| **New finding**: Lane 2 (`searchTurboVec`) inside the same orchestrator | `STUB` (explicit) | `parallel-orchestrator.ts:153-164` — comment-labeled placeholder, unconditionally `return []`. Same "looks like a clean empty result" risk as the centroid lane, not yet flagged by anyone. |

## What Changes

Ordered, each step small enough to verify independently. Steps 1–2 are
already done (found true during this proposal's own verification pass,
not proposed work); listed for completeness of the record.

1. ~~Disable the fabricated Mastra route~~ — **DONE**, see status table.
2. ~~Record Mastra/Deep Agents as NOT_PROVEN rather than installing them
   to legitimize existing naming~~ — **DONE**, shims in place, no install.
3. **Name LangGraph as the current orchestration owner** — decision only,
   no code. Blocks nothing else in this list; needed before step 5.
4. **Add a `not_configured` degraded-status signal to `parallel-orchestrator.ts`'s
   centroid and TurboVec lanes** — small, additive, no schema/key migration.
   The function already builds a `lanes: LaneResult[]` diagnostic array
   internally (lines 88–110 of `parallel-orchestrator.ts`) and discards it;
   surface it. Add a `not_configured` variant to `LaneResult['status']` and
   set it when a lane has no real backing (centroid: no writer found;
   turbovec: explicit stub). Low urgency in practice since `parallelRetrieve()`
   has zero current callers — but cheap to fix correctly now rather than
   carry the same silent-empty pattern into whatever calls this orchestrator
   next.
5. **Wire one explicit, manually-invoked LangGraph dispatcher entrypoint** —
   `npm run atlas:dispatcher:worker` (does not exist yet). Single-process
   lock, queue consumer, graceful shutdown, retry + DLQ, health endpoint,
   structured telemetry. Do **not** wire into `hooks.server.ts` — duplicate-consumer
   risk on every dev-server reload (same failure class as the TurboVec
   duplicate-bind bug fixed this session).
6. **Prove one real dispatcher task end-to-end** through the new manual
   entrypoint before considering automatic startup.
7. **Extend the MCP registry audit with runtime pre-call columns**: input
   schema present, parser present, pre-call hook present, domain-service
   caller present, output schema present, output validation present,
   consumer-implementation-kind (`REAL` / `REAL_BUT_ORPHANED` /
   `HIDDEN_INTERNAL` / `LIVE_STUB` / `MOCK_OPT_IN` / `DEAD_OR_UNREFERENCED`).
8. **Canonical Zod schema for one bounded operation** — `atlas.retrieve_evidence`
   is the best first candidate (see `design.md`). Centroid routing present
   in the schema but `enabled: false` by default / reports `not_configured`
   until step 10 resolves ownership.
9. **One shared pre-call layer**, usable by MCP, tRPC, LangGraph, and future
   gRPC/ACP/A2A adapters — not MCP-specific middleware (see `design.md` for
   module list).
10. **Centroid key contract consolidation decision** — separate OpenSpec
    change (do not fold into this one; needs its own writer/reader
    inventory per `session-159-followup-tasks.md`'s Phase 11 findings).
    Steps 8–9 must not depend on this being resolved — centroid routing
    stays optional/`not_configured` until it lands.
11. Revision-safe exact/embedding/centroid/ACE cache key contracts —
    depends on step 10.
12. Output validation wired end-to-end for one real call path.
13. Only then: evaluate ACP/A2A bridges.

## Progress (2026-08-02, operator review + fixes)

Steps 4, 8, and the beginning of the runtime-verification work are now
done, per operator sign-off on the "Correct next TODO" list:

- **Step 4 (degraded lane reporting) — DONE.** `parallel-orchestrator.ts`'s
  `LaneResult.status` gained a `not_configured` variant; `searchTurboVec`
  (explicit stub) and `searchRedisCentroids` (reports `not_configured`
  when zero `centroid:feature:*` keys exist, distinct from "searched,
  found nothing") both use it now, and the previously-discarded `lanes`
  diagnostic array is now actually returned (`parallelRetrieve` return
  type changed `SearchResult[]` → `{results, lanes}`; safe, zero external
  callers confirmed via `rg` before the change).
- **Step 8 (canonical Zod schema) — DONE, schema only, not wired.**
  `src/lib/server/parent-atlas/precall/query-plan-schema.ts` and
  `retrieve-evidence-schema.ts` created per `design.md`'s sketches. No
  caller wiring yet — that's still steps 9+.
- **tRPC/LangGraph/Mastra/Deep-Agents package verification — DONE**, see
  the status table above; Deep Agents also confirmed absent from
  `package.json` (not previously checked explicitly).
- **Postgres centroid table inventory — DONE**, logged in
  `openspec/changes/session-159-followup-tasks.md`'s Phase 11 addendum
  rather than here (keeps that finding attached to the audit it corrects).
  Short version: 2 real populated tables exist (`qdrant_centroid_clusters`,
  202 rows; `gpu_cluster_centroids`, 64 rows), both stale (no active
  writer), both using yet another naming scheme (`node:{row}:{col}`) on
  top of the 8 already found in code — so "no canonical writer" was true
  for Redis specifically, not for Postgres.
- **Two of the six decomposed future changes now exist as scope-reserving
  stubs** (design sketch / gate definitions only, nothing implemented):
  `openspec/changes/parent-atlas-deep-research-ingestion/`,
  `openspec/changes/parent-atlas-triton-trtllm-readiness/`. The remaining
  four (`parent-atlas-centroid-projection-v1`,
  `parent-atlas-code-intelligence-population`,
  `parent-atlas-hypergraph-retrieval`, `parent-atlas-agent-runtime-evaluation`)
  are not yet created — logged here as backlog, not scaffolded ahead of
  need.
- **Not done, explicitly deferred**: steps 5–7, 9–13 (dispatcher worker
  entrypoint, wiring the new schemas to a real caller, bounded query
  planning, proving one end-to-end LangGraph dispatcher run, SOM/KMeans
  population coverage metrics). These need either a running-infra proof
  (dispatcher, LangGraph) or meaningfully more design work (query
  planning, coverage metrics) than a single bounded pass covers.

## Explicitly out of scope for this change

- Migrating or renaming any of the 8 (now 9, see Postgres inventory
  above) centroid key schemes (needs its own writer/reader inventory
  first — separate change).
- The `bitfrost`/`bifrost` spelling question (legacy persisted prefix vs
  documented product name) — do not resolve by frequency; separate
  decision, not blocking.
- `scripts/ingest/turbovec-sidecar.py` archival (flagged, not actioned,
  in `session-159-followup-tasks.md`).
- Broad ACP/A2A audit (explicitly step 13, last).
- Installing `@mastra/core` or Deep Agents "to legitimize existing naming" —
  explicitly rejected; LangGraph is the chosen current owner (step 3).

## Impact

- `src/lib/server/atlas/atlas-mastra-adapter.ts`, `atlas-mastra-workflow.ts` —
  already patched with passthrough shims this session; no further Mastra
  work planned unless the package is formally adopted later.
- `src/lib/server/retrieval/parallel-orchestrator.ts` — step 4 target.
- `src/lib/server/dispatcher/rabbitmq-identity-listener.ts`,
  `dispatcher-orchestrator.ts`, `dispatcher-graph.ts` — step 5–6 target.
- New: `scripts/atlas/dispatcher-worker.mjs` (or `.mts`) + npm script,
  step 5.
- New: `src/lib/server/parent-atlas/precall/*` module family, step 9 (see
  `design.md`).
- `docs/parent-atlas/MCP_TOOL_REGISTRY_AUDIT.md` — gains a runtime column
  set, step 7 (extend, do not replace the existing structural findings).
