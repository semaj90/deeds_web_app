# Tasks

- [x] AFC-00 Audit current owners; preserve existing context/action/hypergraph contracts.
- [x] AFC-01 Add QueryClassificationV1 and FileMutationIntentV1 contracts.
- [x] AFC-02 Add CandidateFeatureRowV1 and ExactPromotionV1 contracts.
- [x] AFC-03 Add ContextManifestV1 contract view without a new table.
- [x] AFC-04 Add PromptPlanV1 and PrefillArtifactV1 contracts.
- [x] AFC-04A Bind PromptPlanV1 to the verified llama-server budget: 65,536-token physical context, 8,192-token output reserve, and 57,344-token maximum admitted input; over-budget plans fail closed. Live read-only proof: `scripts/atlas/prove-llama-context-capacity-v1.mjs` → `docs/reports/langgraph-llama-context-capacity-v1.json` (`LIVE_CONTEXT_CAPACITY_PROVEN`, one slot, `ornith-1.5-9b`). LangGraph remains orchestration-only and the plan carries references/checksums, not canonical evidence bytes.
- [ ] AFC-04B Wire the LangGraph synthesis adapter to the existing `ContextManifestV1`/`ContextManifestV2` → `PromptPlanV1` → shared Ornith llama-server resolver path; prove a bounded multi-turn execution without hidden-state persistence, ad-hoc prompt bypass, or datastore writes.
- [x] AFC-04B-01 Add the no-write Ornith PromptPlan adapter seam and fixture proof; it validates admitted segment checksums/budget, resolves the exact expected model via `/v1/models`, and sends only compiled plan messages. Full LangGraph graph wiring and live multi-turn proof remain part of AFC-04B.
- [x] AFC-04B-01A Verify endpoint selection against the live Ornith server: `/v1/completions` is reachable for plain prompts but returned a `<think>` marker even with `reasoning_effort: none` and `reasoning_format: none`; it is therefore not eligible for the canonical agent/tool path. Canonical synthesis remains `/v1/chat/completions` with the model Jinja template and per-request thinking disabled.
- [x] AFC-04B-02 Route the existing LangGraph synthesis node through the bounded Ornith adapter when a compiled prompt plan is supplied; fixture proof covers successful model discovery/generation and content-drift rejection before POST.
- [x] AFC-04B-03 Execute one bounded live adapter smoke against `http://127.0.0.1:8090`: `/v1/models` resolved `ornith-1.5-9b`, `/v1/chat/completions` returned `LIVE_ORNITH_ADAPTER_OK`, and the adapter receipt reported `modelCalls: 1`, `datastoreWrites: false`, `canonicalWrites: false`, and `hiddenStatePersisted: false`. This proves the adapter/service boundary only; the AFC-04B multi-turn LangGraph graph proof remains open.
- [x] AFC-04B-04 Repair the actual LangGraph worker import path by aligning the installed `@langchain/core` package with the existing lockfile resolution (`1.2.1`), which satisfies `@langchain/langgraph-checkpoint`'s `uuid6` requirement; runtime import now passes without changing the LangGraph source API.
- [x] AFC-04B-05 Prove a bounded two-turn LangGraph execution graph using only compiled PromptPlans: exactly two `/v1/models` + `/v1/chat/completions` pairs execute with deterministic controls, while content drift stops before any model request or second turn. The production worker graph's full multi-turn/checkpoint proof remains part of AFC-04B.
- [x] AFC-04B-06 Verify the compiled `PromptPlanV1.checksumSha256` against the existing Atlas canonical encoding before model discovery/generation; preserve `tokenizerRevision` and reject field tampering before any POST. Focused adapter, worker, and bounded-graph tests pass (8/8).
- [x] AFC-04B-07 Repair the existing Kanban LangGraph builder's typed node-edge construction so the installed LangGraph runtime can typecheck through the exported index; behavior and datastore ownership are unchanged.
- [x] AFC-04B-08 Separate the unused legacy block-reference planner from the canonical revisioned `atlas.prompt-plan.v1` wire contract; retain a deprecated builder alias, but emit `atlas.agentic-file-compiler.block-plan.v1` so unresolved block references cannot masquerade as executable PromptPlan evidence.

LangGraph runtime recheck (read-only, 2026-09-19): the installed StateGraph replay matched the
local adapter, and the failure/retry/cancellation/replay fixture passed with deterministic output.
Receipts: `docs/reports/langgraph-readonly-adapter-replay-v1.json` and
`docs/reports/langgraph-failure-retry-replay-v1.json`. These are process-local fixture proofs;
they do not close AFC-04B's production worker/checkpoint gate or authorize durable state.

Production wiring recheck (read-only, 2026-09-19):
`node scripts/tests/test-langgraph-wiring.mjs --langgraph http://127.0.0.1:8091`
confirmed the SvelteKit JSON synthesis proxy is reachable, but the direct LangGraph
service on `:8091` is unavailable and the SSE proxy run emitted no `complete` event
(`3` events, `0` chunks). AFC-04B remains open; no container was started and no
datastore/model state was changed.
- [x] AFC-05 Add DagNodePlanV1 and AtlasWorkflowSpecV1 contracts.
- [x] AFC-06 Add WorkflowActionEventV1 persistence envelope.
- [x] AFC-07 Add MastraWorkflowGraphV1 runtime-dialect contract.
- [x] AFC-08 Add FileMutationPlan/ValidationObservation/Receipt/Failure contracts.
- [x] AFC-09 Add GraphProjectionRequestV1 and SearchRuntimePolicyV1 contracts.
- [x] AFC-10 Wire query classifier to the live request front door. Evidence:
  `sveltekit-frontend/src/routes/api/search/hyperrag/+server.ts` classifies every validated
  request, compiles a retrieval plan only for revision-qualified requests, and applies its
  bounded candidate budget to SearchRuntime; `server.route.test.ts` proves both the control
  metadata and budget propagation. Exact promotion remains AFC-11.
- [x] AFC-10-01 Wire deterministic `QueryClassificationV1` observation into `/api/search/hyperrag` after request validation; return it as control metadata while preserving SearchRuntime as the retrieval/fusion owner. Route proof asserts the stable classification contract; full classification-to-retrieval-plan execution remains open.
- [x] AFC-10-02 Compile the existing `RetrievalPlanV1` only for revision-qualified HyperRAG requests, apply its bounded candidate budget to the SearchRuntime call, and return the plan as control metadata; unqualified requests remain plan-less rather than receiving a synthetic workspace revision.
- [ ] AFC-11 Wire exact promotion to the live retrieval owner.
- [ ] AFC-12 Extend existing context manifest persistence with revision/evidence refs through a migration only after compatibility proof.
- [x] AFC-13 Persist WorkflowActionEventV1 through the existing action/outbox writer. The compiler now converts supported lifecycle events through `workflowEventToCanonicalActionWriterRequest` and delegates to `writeCanonicalWorkflowActionAtomically`; compiler-only kinds fail closed. Adapter proof passes 5/5 and existing action/outbox writer proof passes 11/11. No live database write/readback was run in this tranche.
- [x] AFC-14 Install/verify a real Mastra runtime before replacing the current passthrough shim. The existing `@deeds/atlas-orchestrator` owner now pins `@mastra/core@1.71.0`, its PostgreSQL and Redis adapters, and an isolated LangChain/Deep Agents dependency set satisfying the Deep Agents peer ranges. A checksum-verified portable Node `v22.23.3` import smoke loads `Mastra`, `createDurableAgent`, `PostgresStore`, `WorkflowsPG`, `RedisServerCache`, `createDeepAgent`, LangChain `tool`, and LangGraph `StateGraph`; TypeScript check passes. The repo `.npmrc` disables workspaces, so install required explicit `--workspaces=true --workspace=@deeds/atlas-orchestrator --install-strategy=nested`. No agent was instantiated, no database connection or write occurred, and the SvelteKit shim was not replaced. See `docs/reports/mastra-deepagents-install-20260926.md`. AFC-15 restart/suspend parity remains open.
- [x] AFC-14B-01 Wire the authenticated SvelteKit Mastra route to accept only the existing `AceContextManifestAdmissionV1` + `PromptPlanV1` + checksum-bound segment content; revalidate manifest/plan checksums and packet-key/evidence membership, resolve the loaded model through the existing llama-server resolver, and execute with a request-scoped tool-free Mastra Agent. The route does not retrieve/build candidates, write stores, persist durable state, or accept an ad-hoc prompt. Fixture route and executor tests pass (6/6); package type-check passes. This is wiring/fixture proof only, not a live same-snapshot inference proof; immutable model artifact revision remains unavailable. See route `sveltekit-frontend/src/routes/api/atlas/mastra-agent/+server.ts` and executor `packages/atlas-orchestrator/src/models/prompt-plan-agent.ts`.
- [x] AFC-14B-01A Rehome the route fixture spec outside the reserved SvelteKit `+` route directory to `sveltekit-frontend/src/lib/server/atlas/mastra-agent-route.spec.ts`. Under PATH Node `v22.23.3`, the focused route suite passes 3/3 and the orchestrator import/typecheck smoke passes. The initial 8-GiB-heap check reported 36 errors / 291 warnings; the 2026-09-26 remediation rerun now reports 0 errors / 291 warnings across 100 files. AFC-17 remains open pending the required Tree-sitter and test-barrier proof. No live inference or datastore operation was performed. Details: `docs/reports/svelte-check-error-remediation-20260926.md`.
- [ ] AFC-14B-02 Prove one authenticated live request using an owner-produced packet-key CandidateOrdinal snapshot, admitted ContextManifestV2, and PromptPlanV1 through the Mastra route; preserve the exact loaded model ID and record immutable model-artifact provenance if the endpoint exposes it. No candidate selection or identity interpretation may move into Mastra. Until this receipt exists, application runtime execution is not live-proven.
- [ ] AFC-15 Prove suspend/resume restart parity using Mastra snapshots.
- [ ] AFC-16 Wire bounded filesystem mutation behind authorization and human-approval policy.
- [ ] AFC-17 Prove Tree-sitter/typecheck/test validation barrier. The pure barrier contract now
  has pass/fail, warning-admission, required-validator ordering, and deterministic replay tests
  (`validation-barrier.spec.ts`, 5/5); live repository Tree-sitter/typecheck/test execution is
  still required before this task can close. The app-wide typecheck subgate now passes with
  0 errors / 291 warnings across 100 files; the remaining Tree-sitter and required test-barrier
  gates are not yet proven.

Live barrier recheck (read-only, 2026-09-19): the structured-value runtime probe is ready with
`tree-sitter 0.25.1`, `tree-sitter-typescript 0.23.2`, `treesitter-chunker 4.0.0`, Python 3.13.5,
and `pyarrow 21.0.0`; the four barrier tests pass. The SvelteKit `typecheck:native` check at that
time exited with 62 TypeScript errors. This historical baseline is superseded by the fresh 2026-09-26
8-GiB-heap check below; it is retained as history, not current status.

The barrier contract was hardened to fail closed on duplicate validator observations; focused coverage
passes 5/5. Fresh 2026-09-26 verification is recorded in
`docs/reports/svelte-check-error-remediation-20260926.md`: the full frontend `npm run check` with
`NODE_OPTIONS=--max-old-space-size=8192` now reports 0 errors and 291 warnings across 100 files.
This closes the app-wide typecheck subgate only. AFC-17 remains OPEN pending Tree-sitter and full
required test-barrier execution. No model inference, canonical datastore mutation, or Graphify run
was performed.

Warning/barrier diagnosis (2026-09-26): machine census confirms 0 errors / 291 Svelte warnings
(233 accessibility, 58 unused CSS selectors). AFC-17's pure aggregator has no live runner callsite;
no repository Tree-sitter receipt or selected test-suite receipt is bound into a
`ValidationBarrierResultV1`. The current aggregator trusts caller-supplied validators/statuses and
does not bind PASS to exit codes/output evidence or warning-code/count admission. Keep AFC-17 OPEN
until these proof/contract gaps are closed; see `docs/reports/svelte-check-error-remediation-20260926.md`.
- [ ] AFC-18 Wire incremental AST/semantic_768/graph refresh and cache invalidation.
- [ ] AFC-19 Run CPU/GPU semantic executor parity and confirm one-vote-per-lane behavior.
- [ ] AFC-20 Retire the fake Mastra `defineWorkflow` shim only after AFC-14/AFC-15 pass.
