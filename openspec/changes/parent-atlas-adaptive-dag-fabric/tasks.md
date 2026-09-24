# Tasks — Parent Atlas Adaptive DAG Fabric

## 2026-08-30 — origin and scope

Captured from an external architecture review of the "adaptive DAG synthesis"
proposal (RabbitMQ work dispatch + Postgres/Tree-sitter/ast-grep/graph/Qdrant
local retrieval + optional web search + simdjson typed evidence, converging
through a deterministic evidence→context→prompt chain before Ornith
synthesis). Reviewed against live code before writing anything here — see
RUNTIME-QUEUE-01 below, which is a verified, fixed, real bug, not a
theoretical one. Everything else in this file is design freeze / backlog,
not yet built.

## RUNTIME-QUEUE — immediate RabbitMQ fix (small, scoped, done first)

- [x] RUNTIME-QUEUE-01 Fix the competing legacy worker registry gap: add
  `kb_ingest: 'kb.ingest'` to `RabbitMQManager.queues`
  (`sveltekit-frontend/src/lib/server/queue/rabbitmq-manager-fixed.ts`) so
  `setupInfrastructure()` asserts it before any consumer starts. Root cause
  verified live: `queue-worker.ts`'s `WebIngestWorker.queue = 'kb.ingest'`
  was consumed via `rabbitmq.consume('kb.ingest', ...)` (no assertQueue of
  its own) and published via `web-ingest.ts`'s `publishToQueue()` (also no
  assertQueue) — the queue was declared by nothing anywhere, and
  `createDefaultRegistry().startAll()` in `hooks.server.ts` would 404 the
  channel consuming from it at boot. Confirmed the ordering fix is
  sufficient: `rabbitmq-xstate-integration.ts`'s `startRabbitMQPipeline()`
  only resolves once the actor reaches `consuming`, which requires
  `initializeManager` (`rabbitmq.initialize()` → `setupInfrastructure()`) to
  have completed first.
- [x] RUNTIME-QUEUE-02 **Startup topology boundary audited (2026-09-23, read-only).**
  There are **two active startup declarations**, not one: legacy workload queues
  (`hooks.server.ts` → `startRabbitMQPipeline` → `RabbitMQManager.initialize` →
  `setupInfrastructure`) and the newer task/event topology (`hooks.server.ts` →
  `startEventFabricWorker` → `declareTopology`). Their exchange and queue name
  sets are disjoint. The event-fabric source explicitly separates notification
  traffic from `WorkCommand`; therefore these are separate workload/event
  domains, not competing declarations of the same broker objects. Preserve
  both; do not consolidate speculatively. A third `packages/atlas-core` topology
  source has no current first-party import/call site and shares
  `atlas.tasks.v1`/`atlas.tasks.dlx.v1` with the app topology while declaring the
  DLX as `fanout` instead of `direct`; do not activate it before owner/contract
  reconciliation. Repeatable source audit: `scripts/atlas/audit-rabbitmq-topology-ownership-v1.mjs`;
  receipt: `docs/reports/rabbitmq-topology-ownership-v1.json` (`writesPerformed=false`,
  `brokerTouched=false`). This closes the boundary audit, not any broker migration.
- [x] RUNTIME-QUEUE-03 **Worker readiness now reflects consumer registration outcomes (2026-09-23).**
  `QueueWorker.start()` previously swallowed `rabbitmq.consume()` failures, so
  `Promise.allSettled()` could count the worker as started despite no consumer.
  Startup errors now set `FAILED` + `startError` and propagate to the registry;
  `READY` is set only after `consume()` resolves. Registry state distinguishes
  `NOT_STARTED`, `READY`, `DEGRADED`, `FAILED`, and `DISABLED`, and the boot log
  reports ready/total plus failed/disabled counts. RabbitMQ remains non-fatal
  to HTTP startup: the registry settles worker failures and the boot chain keeps
  its warning-only failure handlers. Proof: `queue-worker-readiness.spec.ts`
  (5/5; consume success/failure, disabled consumer, aggregate states); focused
  typecheck found no diagnostics in the changed worker or readiness spec. The
  broader selected roots reported 15 pre-existing diagnostics in hooks locals
  augmentation/imported files, none at the changed boot log line.

## DAG-CONTRACT / DAG-FETCH / DAG-WEB / DAG-REPLAY — audit correction (2026-08-30)

**Before writing more code against these four sections, read this.** A repo
audit (per this file's own CLAUDE.md "Duplication Prevention — Audit Before
You Build" rule) found `sveltekit-frontend/src/lib/server/atlas/research/`
already implements a real, tested, checksum-deterministic research-DAG
circuit that overlaps heavily with what was speculatively drafted below
under different names:

| Speculative name (this file) | Real existing equivalent | File |
|---|---|---|
| `WorkflowActionEventV1` (queue dispatch envelope) | `ResearchOperationV1` (op ledger: kind/inputChecksum/outputChecksum/status) | `research-kernel-contract-v1.ts` |
| session/budget wrapper | `ResearchKernelSessionV1` + `ResearchKernelBudgetV1` (maxRounds/maxSubqueries/maxOperations/maxCards/tokenBudget/maxWallTimeMs) | `research-kernel-contract-v1.ts` |
| `AdaptiveDagPlanV1` classify→fetch→coverage loop | `runLocalResearchCircuitV1()` — round loop over subqueries, budget-bounded, coverage-gated | `local-research-circuit-v1.ts` |
| `FetchParameterPlanV1` fan-in into `EvidenceManifestV1` | `AceCardSelectionV2Result` via `selectAceCardsV2()`, deduped by `cardId`, checksum-sealed | `local-research-circuit-v1.ts` (calls into `../context/ace-card-selection-v2.ts`) |
| `WebSearchPlanV1` / `ExternalEvidenceV1` | `AtlasExternalResearchEvidenceV1` (Zod-validated, `canonicalAuthority`/`localSourceAuthority`/`mutationAuthority` all `false`, sha256 evidence checksum) | `external-research-evidence-v1.ts` |
| external evidence → context promotion (no local identity) | `externalResearchEvidenceToAceCardV1()` — explicit doc comment "adapts external evidence into an ACE card without assigning local identity" | `external-research-ace-adapter-v1.ts` |
| `SynthesisReceiptV1` | already named exactly this | `synthesis-receipt-v1.ts` (not yet read in this audit pass — verify before reusing) |

**What is a real, not-yet-covered gap** (confirmed by grep, not assumed):
naming/shape alignment between this contract family and
`ArtifactAddressV1`/`ActionWorkItemV1` from
`parent-atlas-candidate-feature-execution-fabric` (QUEUE-01/02) — the
research kernel does not appear to route its operations through the RabbitMQ
outbox/artifact-reference path at all yet; it looks like an in-process
circuit (`runLocalResearchCircuitV1` is `async` but shows no queue
dispatch). Also unconfirmed: whether `DagActionKind`'s
`AST_SCAN`/`SIMDJSON_SCAN`/`FETCH_POSTGRES`/`FETCH_QDRANT`/`FETCH_FILE`/
`GRAPH_EXPAND` local-evidence branches (as opposed to the `WEB_SEARCH`
branch, which is well covered above) have an equivalent — `local-research-
circuit-v1.ts`'s `search()` callback is injected by the caller, so the
actual POSTGRES/QDRANT/GRAPH fetch implementations live elsewhere and were
not traced in this pass.

**Action**: do not build a second, differently-named contract for what
`atlas/research/*` already does. The remaining real work is (a) tracing
the injected `search()` callback to confirm/deny local-branch coverage,
(b) deciding whether this contract should route through the RabbitMQ
outbox (QUEUE-01-style artifact refs) or stay in-process, and (c) reading
`synthesis-receipt-v1.ts` before assuming `SynthesisReceiptV1` needs to be
redefined. None of that was done in this pass — this section only prevents
the wrong next step (rebuilding what exists), it does not complete the
gap-check.

**Follow-up finding (2026-08-30, same pass): `atlas/research/*` itself has
zero production callers — a THIRD parallel research system already exists
and is the one actually live.** Traced `runLocalResearchCircuitV1`'s only
caller: its own `local-research-circuit-v1.spec.ts`. No route, worker, or
orchestrator wires it. Separately, `src/lib/server/research/` (note: NOT
`atlas/research/` — different, sibling directory) has
`web-research-ingester.ts` (`RESEARCH_COLLECTION = 'chunks_web_search'`
Qdrant collection, `searchResearchChunks()`, `ingestResearchChunks()`) and
`lane4-feedback.ts`, both with real callers
(`src/lib/server/ast/cross-language-synthesis.ts`,
`src/lib/server/ace/codeintel-datastore.ts`). Per this repo's own
CANONICAL_OWNER/BACKEND/EXPERIMENT/DEAD vocabulary (root CLAUDE.md "One
Canonical Runtime Owner Per Capability"): `research/web-research-ingester.ts`
is the live `CANONICAL_OWNER` for web-research retrieval today;
`atlas/research/*` (research-kernel-contract-v1, local-research-circuit-v1,
external-research-evidence-v1, external-research-ace-adapter-v1,
synthesis-receipt-v1) is unclassified — built, Zod-typed, checksum-
deterministic, fixture-tested, but not proven live and not wired to
anything. Do not build a fourth system. Before doing anything else with
either research family: decide whether `atlas/research/*` is
(a) `EXPERIMENT`/`COMPATIBILITY` and should stay parked, or
(b) the intended replacement for `web-research-ingester.ts` and needs an
actual wiring task, not more contract-writing. This is an operator
decision, not something to resolve by continuing to add code to either
side.

**Operator decision (2026-08-31): (a) — `EXPERIMENT`.** `atlas/research/*`
(`research-kernel-contract-v1.ts`, `local-research-circuit-v1.ts`,
`external-research-evidence-v1.ts`, `external-research-ace-adapter-v1.ts`,
`synthesis-receipt-v1.ts`) is classified `EXPERIMENT` per this repo's own
CANONICAL_OWNER/BACKEND/ADAPTER/EXPERIMENT/COMPATIBILITY/FIXTURE_ONLY/DEAD
vocabulary (root CLAUDE.md "One Canonical Runtime Owner Per Capability").
**Do not wire it, do not give it a production caller, do not migrate
`web-research-ingester.ts` traffic to it.** `research/web-research-
ingester.ts` remains the sole `CANONICAL_OWNER` for web-research retrieval.
Leave `atlas/research/*` as-is (built, tested, parked) — this closes the
open ownership question without requiring new implementation work.

**Downstream consequence for `parent-atlas-ontology-kernel`'s OAK-07**:
that change's `KernelBoundDagPlannerV1` cannot be scoped against
`atlas/research/*` (would be constraining a planner around code with no
real caller). If/when OAK-07 work starts, it must be scoped against the
actually-live system — `web-research-ingester.ts`'s
`searchResearchChunks()`/`ingestResearchChunks()` plus whatever the rest
of `AdaptiveDagPlanV1`'s local-evidence branches
(`AST_SCAN`/`FETCH_POSTGRES`/`FETCH_QDRANT`/`FETCH_FILE`/`GRAPH_EXPAND`)
actually route through today — not against `atlas/research/*`. This is a
different, smaller task than "constrain `AdaptiveDagPlanV1`" originally
implied when `atlas/research/*` looked like the live planner substrate.

## DAG-CONTRACT — typed envelope

- [x] DAG-CONTRACT-01 **Typed adaptive DAG plan contract exists and is tested (2026-09-23).**
  `packages/parent-atlas/src/core/adaptive-dag-plan-v1.ts` owns the full
  `AdaptiveDagPlanV1` and `DagActionKind` contract; it is not supplied by the
  narrower web-research circuit. The action catalog covers Postgres, Qdrant,
  file, AST, SIMD-JSON, graph, web search, rerank, context build, synthesis,
  and latent fetch. Actions carry typed inputs/checksums, parameter artifact
  references/checksums, output contracts, mutation policy, timeout, and
  failure policy. The plan binds planner/classification revisions and a
  checksum, validates dependencies, and hard-codes `canonicalAuthority=false`.
  Focused tests: `adaptive-dag-plan-v1.spec.ts` (3),
  `kernel-bound-dag-planner-v1.spec.ts` (5), and
  `kernel-bound-dag-executor-v1.spec.ts` (2), all passing in the current
  package tree. This proves the typed contract/planner/executor fixtures, not
  live tool execution or canonical promotion.

  **Historical note (superseded by the implementation above):** the narrower
  gap was confirmed 2026-08-31 (found while scoping OAK-07 in
  `parent-atlas-ontology-kernel`): `DagActionKind` and `AdaptiveDagPlanV1`
  themselves — not just the queue-envelope/session-wrapper names covered
  above — do not exist as code anywhere in the repo, under any name.**
  Checked twice, not just grepped once: (1) `grep -rn
  "AdaptiveDagPlanV1\|DagActionKind"` over every `.ts` file — zero
  matches; (2) checked whether `research-kernel-contract-v1.ts`'s
  `ResearchOperationV1.kind` (the closest candidate the table above
  already names) covers the same ground — it doesn't: `kind` there is a
  narrow 4-value union (`SYNTHESIZE_QUERY | SEARCH | SELECT_CARDS |
  COVERAGE`) scoped to the web-research loop only, not the 10-value
  `DagActionKind` catalog this file's own spec.md describes
  (`FETCH_POSTGRES`, `FETCH_QDRANT`, `FETCH_FILE`, `AST_SCAN`,
  `SIMDJSON_SCAN`, `GRAPH_EXPAND`, `WEB_SEARCH`, `RERANK`,
  `BUILD_CONTEXT`, `SYNTHESIZE` — local Postgres/Qdrant/file/AST/graph
  branches plus web). So this is a real gap, not a fifth near-miss of the
  "it already exists under a different name" pattern this file warns
  about elsewhere. **This means DAG-CONTRACT-01 is not actually
  "superseded in spirit" for the full planner shape** — only the
  web-research-loop slice of it is. The local-evidence action catalog
  (`FETCH_POSTGRES`/`FETCH_QDRANT`/`FETCH_FILE`/`AST_SCAN`/
  `SIMDJSON_SCAN`/`GRAPH_EXPAND`) has no contract owner at all yet — real,
  unattempted work, not just unwired existing work. Not started here (out
  of this pass's scope) — flagged because `parent-atlas-ontology-kernel`'s
  OAK-07 depends on this existing before it can start.

## DAG-FETCH — deterministic fan-in

- [ ] DAG-FETCH-01 **Fetch-plan coalescing remains open; selection must preserve card identity.**
  Audit found no current `FetchParameterPlanV1` implementation/caller. The
  circuit invokes `search()` per unique synthesized query, merges returned
  cards by `cardId`, then selects cards. A concurrent selection patch had
  deduplicated by `(sourceRef, sourceRevision, sorted unique evidenceRefs)` and
  discarded a distinct card; that was not an upstream fetch dedupe. The unsafe
  selection-level drop is removed and regression tests now require distinct
  cards to survive, including equivalent evidence tuples, while different
  revisions/evidence sets remain distinct. Still required before closure:
  define/wire a fetch-plan boundary in the existing circuit (or identify its
  actual owner), prove equivalent request tuples cause one upstream fetch and
  one payload reuse, and prove revision/evidence changes do not coalesce. No
  canonical authority or persistence is involved.
  **Fixture progress (2026-09-23):** `buildResearchFetchPlanV1()` is now wired
  before the circuit's injected `search()` callback. The callback receives the
  full revision-qualified request tuple. Focused tests prove normalized
  equivalent queries produce one callback invocation and two aliases to one
  fetched payload, while workspace/candidate/ordinal revision changes produce
  four distinct requests. ACE selector tests also prove distinct cards with
  equivalent evidence references and cards with changed source revision or
  evidence sets remain distinct. These are deterministic fixture proofs only;
  no production retrieval caller is wired to this local circuit, so the gate
  remains open for caller-level integration/readback.

## DAG-STRUCT — ast-grep as evidence node

- [x] DAG-STRUCT-01 **Already built, and this section's own earlier "genuine
  gap" claim was wrong** — that grep only searched `sveltekit-frontend/src`,
  not `packages/parent-atlas/src`, where the real contract lives (same
  mistake pattern as DAG-CONTRACT/DAG-FETCH/DAG-WEB above: this repo splits
  canonical contracts into `packages/parent-atlas` and `packages/atlas-core`
  per root CLAUDE.md's "Parent Atlas Library Consolidation" section — always
  check there first). `packages/parent-atlas/src/core/ast-grep-observation-
  adapter.ts` defines exactly this: `AstGrepObservationV1`
  (`source_ref`/`source_revision`/`rule_id`/`byte_start`/`byte_end`/
  `observation_kind`/`captures`/`extractor_revision`/
  `canonical_authority: false`), built via `adaptAstGrepMatches()` with a
  deterministic `observation_id` (sha256 of source_ref+revision+rule+byte
  range+captures) and real chunk-overlap resolution
  (`bestChunk()`). `structural-extraction-fabric.ts` composes it into
  `compileStructuralExtractionFabric()`. **Confirmed wired to production**:
  `sveltekit-frontend/src/lib/server/atlas/indexing/graphify-structural-
  intelligence-adapter.ts::compileGraphifyStructuralIntelligence()` imports
  and calls it, producing a receipt
  (`atlas.graphify-structural-intelligence-receipt.v1`) with
  `canonicalIdentityCreated: false` — the same non-authority rule this task
  asked for, already enforced. Do not build a second ast-grep evidence
  contract.

## DAG-WEB — bounded external evidence branch

- [x] DAG-WEB-01 **Already built and tested.** `WebSearchPlanV1`'s budget
  role is filled by `ResearchKernelBudgetV1`; `ExternalEvidenceV1` is
  `AtlasExternalResearchEvidenceV1Schema` (Zod, `.strict()`,
  `canonicalAuthority: false`); the "never assigned local identity unless
  explicitly promoted" rule is enforced by
  `externalResearchEvidenceToAceCardV1()`'s `candidateOrdinal: null` /
  `sourceRef: null`. Tests exist:
  `external-research-evidence-v1.spec.ts`,
  `external-research-ace-adapter-v1.spec.ts`,
  `local-research-circuit-v1.spec.ts`. Not verified in this pass: whether
  `allowedDomains`/`blockedDomains`/`maxBytes`/`freshnessPolicy` limits from
  the original freeze are enforced anywhere, or whether the budget fields
  here fully substitute for them — read `ldr-orchestrator.ts` and
  `web-search.ts` (the actual fetch implementations) before treating those
  specific limits as covered.

## DAG-XJSON — simdjson typed adapter (not started)

- [x] DAG-XJSON-01 **Built 2026-08-30 — confirmed genuine gap, not a
  duplicate** (checked both `sveltekit-frontend/src` and `packages/` before
  writing anything, per the audit-first rule this change itself established
  for the other DAG-* tasks). `TypedEvidenceEnvelopeV1` +
  `adaptSimdjsonTypedEvidence()`/`adaptSimdjsonTypedEvidenceStream()` in
  `packages/parent-atlas/src/core/simdjson-typed-evidence-adapter.ts`
  (pure, framework-agnostic — takes an already-parsed record + a caller
  `payloadSchema`; structurally impossible to produce an envelope without
  the payload passing `payloadSchema.parse()` first). Exported from the
  package index. The actual simdjson call site is
  `sveltekit-frontend/src/lib/server/atlas/indexing/simdjson-typed-evidence-bridge.ts::parseNdjsonTypedEvidence()`
  — splits NDJSON, calls the existing `fastJsonParse()` from
  `simdjson-bridge.ts` per line (no second JSON-parsing path), routes each
  record through the packages-level adapter, never throws on a bad line
  (rejects and continues). Verified: `packages/parent-atlas` rebuilt clean
  (`tsc -p tsconfig.json`, exit 0); 4/4 vitest tests pass in
  `simdjson-typed-evidence-bridge.spec.ts` (accept, reject-on-schema-
  failure, reject-on-malformed-JSON, determinism-across-two-runs), with the
  native simdjson addon (`tensorrt_bridge.node`) confirmed loaded and used,
  not the V8 fallback; scoped `tsc --noEmit` over the whole repo shows zero
  errors on either new file.

  Follow-up hardening validated 2026-08-30: accepted envelopes now carry
  `sourceRef`, `sourceRevision`, `evidenceId`, `parserRevision`,
  `rawInputChecksum`, and `typedEvidenceChecksum`; the existing
  `payloadChecksum` remains the validated-payload alias. Rejections now
  distinguish `JSON_PARSE_FAILED` from `SCHEMA_REJECTED`. The focused bridge
  suite remains 4/4 green. This is still a read-only adapter: no live NDJSON
  replay or production wiring is claimed.

  Bounded real replay validated 2026-08-31 against the first 32 records of
  `.opencode/outcome-ledger.ndjson`: native parser `true`, accepted `32`,
  rejected `0`, two-run checksum parity `true`, and writes `0`. Receipt:
  `docs/reports/dag-xjson-readonly-replay-v1.json`. The replay used a
  permissive ledger-record schema for parser-boundary coverage; it does not
  prove domain-specific research evidence promotion or production wiring.

## DAG-REPLAY — determinism proof

- [x] DAG-REPLAY-01 **Confirmed proven at fixture level.**
  `local-research-circuit-v1.spec.ts` line 17-21 runs
  `runLocalResearchCircuitV1()` twice in parallel with identical injected
  `search()`/`coverage()` callbacks and asserts `a.checksum === b.checksum`
  — real same-input → same-output-checksum replay determinism, not just
  shape validation. Caveat: this proves determinism of the circuit's own
  logic given a deterministic `search()` callback; it does NOT prove the
  real POSTGRES/QDRANT/GRAPH fetch implementations that would be injected
  in production are themselves deterministic — and per the finding above,
  none of them are wired to this circuit yet anyway.

## NATS-EVENT — deferred, explicitly not started

- [ ] NATS-EVENT-01 JetStream `PARENT_ATLAS_EVENTS` shadow event stream
  (`atlas.workflow.requested/action.started/action.completed/action.failed`,
  `atlas.receipt.created`, `atlas.artifact.created`,
  `atlas.validation.{passed,failed}`), carrying `WorkflowActionEventV1`
  bodies, for admin UI / auditing / agent observability only. **No job
  execution** goes through JetStream initially — this is Option B from
  spec.md, and only after RabbitMQ's own work-dispatch role (Option A) is
  stable. Do not start this before DAG-CONTRACT-01 through DAG-REPLAY-01
  are real and proven; introducing a second broker before the first
  contract is even defined is the exact anti-pattern this change exists to
  avoid. **Current classification (2026-09-23): OPTIONAL_OBSERVABILITY_FOLLOWUP; not an execution dependency.**
  Correction to the prior blocker note: Compose defines NATS in the `full`
  profile and `legal-ai-nats` is running with JetStream enabled. Read-only
  monitoring reports 0 streams, 0 consumers, 0 stored messages, and 0 live
  connections. NATS client code also exists for other Core NATS subjects; that
  does not establish a `PARENT_ATLAS_EVENTS` producer/consumer. RabbitMQ remains
  the work-dispatch owner; PostgreSQL `workflow_events`/outbox remains durable
  event authority; the existing Valkey stream is explicitly transport-only.
  Therefore NATS is an optional observability/replay projection, not a DAG
  execution prerequisite. Keep this checkbox open: no stream or event bridge
  was provisioned, and enabling one requires a separately bounded operator
  decision. The legacy spec's `WorkQueue` retention wording is not reconciled
  with independent replay/audit consumers; settle that before configuration.
  No jobs may be dispatched through JetStream here. Evidence:
  `docs/reports/adaptive-dag-nats-event-ownership-v1.json`.
## LLAMA-SERVER-ORNITH-RUNTIME-OWNER-01 — live model identity

- [x] Route the existing decomposition, synthesis/enrichment, pattern-reranking,
  entity-extraction, and Bifrost chat fallback callers through the existing
  `llama-server-model-resolver.ts` against the configured `:8090` endpoint.
  Requests use the model ID returned by `GET /v1/models` when available; the
  configured alias remains a bounded fallback only when the server is
  unreachable.
- [x] Keep responsibilities separate: `:8090` owns LLM NLP/enrichment and
  synthesis; the sklearn NLP sidecar remains the domain-classifier owner;
  `:8121` remains the separate PyTorch neural-decoder lane; Ollama remains
  the embedding lane.
- [x] Live Ornith identity and chat output verified 2026-09-23. `GET
  http://127.0.0.1:8090/v1/models` returned `ornith-1.5-9b`; a bounded
  non-streaming `/v1/chat/completions` request using that returned ID completed
  with `finish_reason=stop` and the expected `READY` response. The workstation
  policy is `LOADED_ACTIVE` with an `ornith-1.5` family allowlist; deployments
  may use `CONFIGURED_VERIFY` to fail closed on model drift. This is a live
  identity/endpoint smoke proof, not a quality/parity benchmark; no canonical
  writes, classifier promotion, Graphify execution, or hidden-state persistence
  is implied.
