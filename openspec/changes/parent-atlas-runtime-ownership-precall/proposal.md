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
- **Step 8 (canonical Zod schema) — DONE.** `query-plan-schema.ts` and
  `retrieve-evidence-schema.ts` created per `design.md`'s sketches.
- **Step 9 (one real wired path) — DONE, proven live, 2026-08-02.**
  `src/lib/server/parent-atlas/precall/retrieve-evidence-service.ts`
  wires `RetrieveEvidenceInputSchema`/`OutputSchema`/`LaneStatusSchema`
  to a real `parallelRetrieve()` call; `src/lib/server/trpc/routers/atlas.ts`
  (`atlas.retrieveEvidence`) is the first real MCP/tRPC consumer, wired
  into `router.ts`. All 8 proof gates verified via live authenticated
  HTTP requests against the running dev server (session via
  `/api/auth/demo-login`, a real Lucia session — not a bypass):

  | Gate | Evidence |
  |---|---|
  | `INVALID_INPUT_REJECTED` | `GET .../atlas.retrieveEvidence?input={"query":"test"}` (missing `workspaceRevision`) → `400 BAD_REQUEST`, structured Zod issues, via tRPC's own `.input()` validation |
  | `DEFAULT_LANES_APPLIED` | Request omitted `lanes` entirely; response's lane list matches the schema default (`exact/lexical/semantic/ast`) plus the always-attempted `turbovec` and the always-reported-but-unrequested `centroid`/`graph` (both correctly `lane_disabled`) |
  | `WORKSPACE_REVISION_PRESERVED` | Request `workspaceRevision:"rev-test-1"` → response echoes `"workspaceRevision":"rev-test-1"` unchanged (schema gained an explicit output field for this — it wasn't observable before) |
  | `CENTROID_NOT_CONFIGURED_REPORTED` | `{"lane":"centroid","status":"not_configured","reason":"lane_disabled"}` |
  | `TURBOVEC_NOT_CONFIGURED_REPORTED` | `{"lane":"turbovec","status":"not_configured","reason":"turbovec_grpc_not_wired"}` |
  | `FALLBACK_LANE_EXECUTED` | `lexical` lane returned 18 real candidates (live Postgres FTS against `codebase_chunk_index`) while `semantic`/`turbovec`/`centroid`/`graph` were `not_configured`; each of those carries `"fallbackUsed":true` |
  | `OUTPUT_SCHEMA_VALIDATED` | Response double-validated — once inside the service (`RetrieveEvidenceOutputSchema.parse`), once by tRPC's own `.output()` on the procedure |
  | `MCP_OR_TRPC_CONSUMER_READS_RESULT` | Real HTTP GET through `/api/trpc/atlas.retrieveEvidence`, real 200 response read by the test client |

  **Bonus finding, fixed along the way**: proving this required a real
  authenticated session, which surfaced that the *entire* tRPC mount was
  broken — `phase18-reranker.ts:2` imported `publicProcedure` from
  `'../router.js'` (which doesn't export it) instead of `'../init.js'`,
  a circular import that crashed `appRouter`'s construction at module-load
  time for every procedure, not just the new one. Same failure shape as
  the mastra-agent `ReferenceError` fixed earlier this session. Fixed;
  confirmed via `analytics.events.list` (unrelated, untouched procedure)
  going from a 500 crash to a clean `401` after the fix.

  **Also found live**: the `semantic` lane reports
  `not_configured`/`embedding_unavailable` — `tryEmbedCanonical()`
  couldn't reach an embedding backend on this dev instance. Correct
  degrade behavior, not a bug — logged here as a real infra observation,
  not investigated further (out of this change's scope).
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

## Step 5 (dispatcher worker entrypoint) — 2026-08-01, corrected status after operator review

Building the worker surfaced 3 real, pre-existing bugs (dependency
version mismatch, missing module, invalid Drizzle config) plus 2 design
issues in the worker itself (env-load ordering fragility, signal handlers
registered too late). All 5 are fixed — see commits `0202efaede`
(dependency), `ef6b28a25b` (import-chain repairs), `2a56624c2d` (worker
entrypoint). Split into 3 commits per operator instruction so a
dependency-graph fix, an unrelated-file repair, and a new long-running
process are independently revertable.

**Corrected status** (operator's classification, verified against what was
actually proven — not asserted from a single successful run):

| Gate | Status | Evidence |
|---|---|---|
| `LANGGRAPH_PACKAGE_COMPATIBILITY` | `RUNTIME_PROVEN` | `node -e` against installed `package.json`s: langgraph 1.4.7 requires core `^1.1.48`, installed core is `1.2.4` |
| `LANGGRAPH_IMPORT_COMPATIBILITY` | `RUNTIME_PROVEN` | `import('@langchain/core/language_models/stream')` (the exact originally-failing subpath) resolves cleanly |
| `LANGGRAPH_MINIMAL_EXECUTION` | `RUNTIME_PROVEN` | Minimal `StateGraph` (one node, START→node→END) compiled and `invoke({value:1})` returned `{value:2}` |
| `WORKER_STARTUP` | `RUNTIME_PROVEN` | `npm run atlas:dispatcher:worker:smoke` — full `starting→...→ready` progression, real Redis heartbeat with correct TTL |
| `QUEUE_TOPOLOGY` / `CONSUMER_REGISTRATION` | `RUNTIME_PROVEN` | `queue_bound`, `consumer_registered` both logged; `validateListenerSetup()` declared exchange/queue/DLQ/binding for real |
| `GRACEFUL_SHUTDOWN` | `RUNTIME_PROVEN` (via `--smoke`, not OS signals) | `shutdown_started→listener_stopped→redis_closed→lock_released→shutdown_complete`, exit 0, lock file and heartbeat key both confirmed removed. OS-level SIGTERM/SIGINT delivery could **not** be proven live in this Windows dev environment — confirmed both `Stop-Process` and `child.kill('SIGINT')` hard-terminate rather than deliver a catchable signal here. The code uses the standard `process.on('SIGTERM'/'SIGINT')` idiom and should be re-verified in a real Linux deployment; `--smoke` proves the identical shutdown code path deterministically in the meantime. |
| `MESSAGE_DELIVERY` / `GRAPH_INVOCATION` / `NODE_EXECUTION` / `MESSAGE_ACK` | `NOT_PROVEN` | No fixture message has been published through this worker yet. `worker_ready` proves startup, not orchestration. |
| `REDELIVERY_IDEMPOTENCY` / `RETRY_EXHAUSTION` / `DLQ_ROUTING` | `NOT_PROVEN` | Same — depends on the message-delivery proof above |
| `POSTGRES_CHECKPOINTER` / `THREAD_ID_CONTRACT` / `CHECKPOINT_RESUME` | `NOT_PROVEN` | `createDispatcherGraph()` compiles but is invoked with no checkpointer — no durable execution, no resume-after-crash |
| `PACKET_BITMAP_GATE_SEMANTICS` / `_WRITER` / `_REDIS_KEYS` / `_INVALIDATION` / `_PERFORMANCE` | `NOT_PROVEN` | `PACKET_BITMAP_IMPORT_BLOCKER: FIXED`, `SAFE_QUARANTINE_FALLBACK: PRESENT` — the capability itself remains unimplemented, now explicitly labeled as such rather than hidden behind zeroed data |

**Next proof is not more startup work** — it's one controlled RabbitMQ
message through a real LangGraph node: publish a fixture
(`eventId`, `workspaceId`, `workspaceRevision`, `operation`, `payload`),
prove `executeDispatcherOrchestration` is invoked, at least one real node
executes, a durable audit row is written (`dispatcher_audit_log`, now
that its schema import bug is fixed), and the message is acknowledged.
Then malformed-input rejection, one transient-failure/retry proof, and
DLQ-after-exhaustion. None of this is started.

## Severity-ranked backlog (operator review, 2026-08-01) — not started, logged for future sessions

Captured here rather than acted on now — each is real multi-session
scope on its own:

1. **Critical — dispatcher execution unproven.** Startup ≠ orchestration; see table above.
2. **Critical — LangGraph used without durable execution.** No Postgres checkpointer, no stable `thread_id`/`run_id` contract, no pending-write recovery, no proof that a failed super-step doesn't repeat a sibling node's already-successful side effect.
3. **High — import-time side effects are systemic, not isolated.** This session alone found 5 unrelated module-load crashes (phase18-reranker circular import, bare `boolean` in a Zod schema, langgraph/core version drift, missing packet-bitmap module, invalid `bigserial` config) plus the standalone-script env-loading gap. Desired rule: schema modules touch no network/DB/Redis/queue/filesystem; router modules declare procedures only; service construction is explicit dependency injection; only the entrypoint loads env, creates dependencies, and starts the runtime. Proposed gates: `IMPORT_ROOT_ROUTER_WITHOUT_INFRA`, `IMPORT_DISPATCHER_GRAPH_WITHOUT_BROKER`, `IMPORT_ZOD_SCHEMAS_WITHOUT_ENV`, `IMPORT_DRIZZLE_SCHEMA_WITHOUT_DATABASE` — each should complete quickly, no network access.
4. **High — RabbitMQ reliability policy is incomplete.** Manual-vs-automatic ack, prefetch, queue type, publisher confirms, retry limit, DLX, poison-message policy, duplicate handling, and competing-vs-single-active-consumer are all still undecided for this worker. Recommended baseline: durable queue, manual ack, prefetch 1–8, idempotency by `event_id`, bounded attempts, DLX after exhaustion.
5. **High — durable context continuity is architectural, not operational.** No transactional outbox, no CDC connector, no idempotent consumer, no proven compaction-restore. Best next infra slice: outbox insert in the same Postgres transaction as the canonical write → one CDC connector → one idempotent audit consumer → one compact context record → prove restore after a consumer failure.
6. **High — PostgreSQL CDC/WAL operational safety unproven**, relevant only once/if item 5's CDC connector is built: `wal_level=logical`, replication slot monitoring, abandoned-slot disk-pressure risk. Do not enable before `WAL_LEVEL_LOGICAL`, `SLOT_ACTIVE`, `SLOT_LAG_REPORTED`, `SAFE_WAL_SIZE_REPORTED`, and outage alerts all exist.
7. **High, for answer quality — retrieval is structurally wired but semantically incomplete.** The live `atlas.retrieveEvidence` proof (previous session pass) is closer to "validated lexical retrieval with transparent degradation" than full hybrid retrieval: `semantic` was `not_configured`/`embedding_unavailable` on that run (embedding backend down), `centroid`/`turbovec` structurally not_configured, `graph` never enabled in the wired path. Next retrieval proof should restore one canonical `semantic_768` embedding backend and prove embed→Qdrant top-K→revision-guard→merge-with-lexical, not add more lanes.
8. **High — centroid ownership remains fragmented.** 8 incompatible Redis key schemes (prior audit) + a 9th Postgres naming scheme (`node:{row}:{col}`, this session) + 2 populated-but-stale Postgres tables + zero active Redis projection writer + no settled Qdrant payload contract. Not just naming drift — no live invariant connects canonical assignment → representation revision → member identity → Qdrant payload → Valkey projection → retrieval reader. Do not rename the 9 schemes without first tracing every writer/reader (some may represent genuinely different concepts: SOM cells, KMeans clusters, graph communities, query affinity).
9. **Medium-high — graph freshness and runtime LangGraph evidence are conflated.** The stale-codebase-graph warning (Karpathy/KAG map) is a separate concern from whether the LangGraph *runtime* works — track `STATIC_CODEBASE_GRAPH_FRESH` and `LANGGRAPH_RUNTIME_EXECUTION_PROVEN` as two separate gates. `graphify:daily` should stay a scheduled projection, never worker-startup logic.
10. **High, for long-term maintainability — state ownership is split across competing stores.** Confirmed conflicts: multiple MCP server registries (mostly resolved this session), `kanban_tasks` as its own planning DB (confirmed, not yet redesigned), OpenSpec/GSD/GitHub/Parent-Atlas state not linked by one `work_item_id`, multiple centroid schemas, `bitfrost`/`bifrost` spelling drift. Needed guards: one canonical writer per entity type, one immutable `work_item_id`, a representation registry, projection revision fields, stale-event rejection, a generated schema-ownership doc.
11. **Medium-high — tests are strong locally, thin at process boundaries.** The 19 committed tests are good service/router coverage but don't cover child-process startup, real RabbitMQ delivery/ack/requeue, worker crash after a side effect but before ack, Redis reconnect, Postgres outage, checkpoint resume, or multi-process contention. Next test layer needs real containers/subprocesses, not more mocks.
12. **Medium now, critical if production claims begin — GPU capability proof base is much narrower than the roadmap.** Keep `PACKAGE_INSTALLED`/`MODULE_IMPORTS`/`GPU_VISIBLE`/`KERNEL_EXECUTES`/`NUMERICAL_PARITY`/`PERFORMANCE_IMPROVEMENT`/`REAL_DATA_ACCURACY`/`PRODUCTION_INTEGRATION` as separate, non-implying stages — a successful import or CUDA allocation proves none of the later ones.
13. Kanban-as-projection redesign (already logged as a separate decision needing operator sign-off before touching `kanban_tasks`) and Deep-research-ingestion/Triton-readiness stubs remain untouched, as intended.

**Ranked remediation order** (operator's own sequencing, not re-derived):
prove the dispatcher (one message → one node → durable audit → ack) →
make LangGraph durable (checkpointer, `thread_id`, idempotent side
effects, crash/resume proof) → restore hybrid retrieval (canonical
embedding backend first, lanes after) → durable context (outbox → CDC →
idempotent consumer → compaction restore) → ownership/projections
(MCP registries done; Kanban, centroid, SOM/KMeans coverage remain) →
GPU numerical validation gates.

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

## Re-verification pass (2026-09-05, read-only — portfolio-tooling correction, not new work)

This change has no `tasks.md`, so `sveltekit-frontend/scripts/atlas/audit-openspec-portfolio-v1.mjs`
(which counts `- [ ]`/`- [x]` checkboxes) reports it as `0/0` and `UNCLASSIFIED` in
`docs/reports/openspec-portfolio-v1.json`. **That is a tooling artifact, not evidence of no work** —
this proposal.md is this change's chosen living record (steps + a dated "Progress" log), and step
4/8/9 are real, still live today:

- `src/lib/server/retrieval/parallel-orchestrator.ts` still exports the `not_configured` lane-status
  variant described in Step 4.
- `src/lib/server/parent-atlas/precall/{retrieve-evidence-schema,retrieve-evidence-service}.ts`
  (Step 8/9) still exist, and `src/lib/server/trpc/routers/atlas.ts` still wires
  `atlas.retrieveEvidence` to `retrieveEvidence()` with `.input()`/`.output()` Zod validation.
- Ran both committed test files fresh: `tests/atlas/retrieve-evidence-service.test.ts` (15 tests) +
  `tests/atlas/atlas-router.test.ts` (4 tests) — **19/19 pass**, covering all 7 unit-level proof
  gates named in the service file's own docstring (`INVALID_INPUT_REJECTED`, `DEFAULT_LANES_APPLIED`,
  `WORKSPACE_REVISION_PRESERVED`, `CENTROID_NOT_CONFIGURED_REPORTED`, `TURBOVEC_NOT_CONFIGURED_REPORTED`,
  `FALLBACK_LANE_EXECUTED`, `OUTPUT_SCHEMA_VALIDATED`) plus the router-level
  `MCP_OR_TRPC_CONSUMER_READS_RESULT` gate.
- Steps 5–7 and 10–13 remain exactly as logged above (dispatcher orchestration unproven end-to-end,
  centroid ownership still fragmented, no shared cross-transport pre-call layer yet) — this pass
  found no evidence any of those advanced since the 2026-08-02 Progress entry.

No code changed in this pass. Recorded so a future portfolio/triage pass doesn't mistake the `0/0`
count for "no work happened here."
