# Parent Atlas Agentic Completion — Tasks

## PAAC-1 — Canonical identity spine

* [ ] PAAC-1.1 Split `sourceKey` from `featureKey`.
* [ ] PAAC-1.2 Ensure feature identity survives source line movement.
* [ ] PAAC-1.3 Define canonical `feature_id + source_ref` join contract.
* [ ] PAAC-1.4 Add task/run/attempt/mutation/validation IDs.
* [ ] PAAC-1.5 Add migration/tests proving deterministic identity.
* [ ] PAAC-1.6 Rebuild Kanban projection using corrected identities.

Gate:

Two TODOs in one source file MUST have distinct feature keys while sharing one source document key.

---

## PAAC-2 — AtlasWorkRequest contract

* [ ] PAAC-2.1 Define request schema.
* [ ] PAAC-2.2 Normalize VS Code/OpenCode/CLI/Kanban/error inputs.
* [ ] PAAC-2.3 Include workspace revision and execution policy.
* [ ] PAAC-2.4 Persist request provenance.
* [ ] PAAC-2.5 Add contract tests.

---

## PAAC-3 — Evidence retrieval cascade

* [ ] PAAC-3.1 Exact sourceRef/file/symbol retrieval.
* [ ] PAAC-3.2 AST ownership/import/call/test expansion.
* [ ] PAAC-3.3 Lexical retrieval lane.
* [ ] PAAC-3.4 Dense retrieval lane.
* [ ] PAAC-3.5 DAG/KAG graph expansion.
* [ ] PAAC-3.6 Optional hypergraph expansion.
* [ ] PAAC-3.7 Authority/relevance/token-cost reranking.
* [ ] PAAC-3.8 Fail-open reranker invariant.
* [ ] PAAC-3.9 Persist retrieval manifest.

Gate:

Given a known compile/test failure, the expected implementing symbol and its closest test MUST appear in the evidence set.

---

## PAAC-4 — Context compiler

* [ ] PAAC-4.1 Define context packet schema.
* [ ] PAAC-4.2 Add token-budget allocator.
* [ ] PAAC-4.3 Separate working context from retrieval cache.
* [ ] PAAC-4.4 Generate ACE SymbolCard.
* [ ] PAAC-4.5 Generate ACE FeatureCard.
* [ ] PAAC-4.6 Generate FailureCard.
* [ ] PAAC-4.7 Generate SolutionCard.
* [ ] PAAC-4.8 Persist context manifest and packet hashes.

Gate:

The same evidence and policy MUST deterministically produce the same ordered context manifest, excluding explicitly nondeterministic model-generated summaries.

---

## PAAC-5 — Bitfrost / Redis bucket warming

* [ ] PAAC-5.1 Define bucket identity and TTL.
* [ ] PAAC-5.2 Warm by active `feature_id`.
* [ ] PAAC-5.3 Warm by sourceRef.
* [ ] PAAC-5.4 Warm AST neighborhood when a file/symbol becomes active.
* [ ] PAAC-5.5 Warm top dense neighbors.
* [ ] PAAC-5.6 Warm relevant KAG/DAG neighborhood.
* [ ] PAAC-5.7 Add VS Code/OpenCode query-triggered warming.
* [ ] PAAC-5.8 Record cache hit/miss and byte/token savings.
* [ ] PAAC-5.9 Prove warming does not automatically inject content into model context.

Gate:

Repeated tasks over the same feature SHOULD reduce retrieval/context preparation latency without changing canonical results.

---

## PAAC-6 — llama-server execution runtime

* [ ] PAAC-6.1 Enforce single-owner port invariant.
* [ ] PAAC-6.2 Reuse healthy matching model.
* [ ] PAAC-6.3 Record actual model/cache/backend configuration.
* [ ] PAAC-6.4 Record prompt/cache/generation telemetry.
* [ ] PAAC-6.5 Define sequential reasoning mode.
* [ ] PAAC-6.6 Define batch analysis mode.
* [ ] PAAC-6.7 Add bounded concurrency policy based on VRAM.
* [ ] PAAC-6.8 Add cancellation and timeout propagation.

Gate:

Normal startup MUST NOT reload a healthy model merely because free VRAM is low.

---

## PAAC-7 — Agentic repair executor

* [ ] PAAC-7.1 Normalize compiler/test/runtime diagnostics.
* [ ] PAAC-7.2 Rank root-cause hypotheses.
* [ ] PAAC-7.3 Resolve target symbol/function/file.
* [ ] PAAC-7.4 Generate minimal mutation.
* [ ] PAAC-7.5 Apply bounded edit.
* [ ] PAAC-7.6 Run closest targeted test.
* [ ] PAAC-7.7 Feed failure evidence into next attempt.
* [ ] PAAC-7.8 Run broader regression checks after local success.
* [ ] PAAC-7.9 Persist every attempt.
* [ ] PAAC-7.10 Enforce configurable attempt budget.

Gate:

A repair MUST not be marked successful solely because code generation completed.

Success requires executable validation evidence.

---

## PAAC-8 — Kanban control projection

Statuses:

BACKLOG
READY
RETRIEVING
PLANNING
PATCHING
VALIDATING
BLOCKED
REVIEW
DONE
REJECTED

* [ ] PAAC-8.1 Map canonical Atlas task → Kanban card.
* [ ] PAAC-8.2 Store current agent/run.
* [ ] PAAC-8.3 Surface evidence completeness.
* [ ] PAAC-8.4 Surface latest validation.
* [ ] PAAC-8.5 Surface retry count.
* [ ] PAAC-8.6 Surface blockers.
* [ ] PAAC-8.7 Require completion evidence before DONE.
* [ ] PAAC-8.8 Preserve board as projection, not source of truth.

---

## PAAC-9 — ACP client boundary

* [ ] PAAC-9.1 Prototype Agent Client Protocol adapter.
* [ ] PAAC-9.2 Map ACP session → Atlas workspace/request.
* [ ] PAAC-9.3 Stream plan/tool/edit/test events.
* [ ] PAAC-9.4 Support cancellation.
* [ ] PAAC-9.5 Test one ACP-compatible client.
* [ ] PAAC-9.6 Keep OpenCode/MCP path operational without ACP.

Decision:

ADOPT as a client interoperability boundary if the adapter proves useful.

---

## PAAC-10 — MCP tool boundary

* [ ] PAAC-10.1 Inventory TRACE MCP tools.
* [ ] PAAC-10.2 Give each tool typed input/output.
* [ ] PAAC-10.3 Attach sourceRefs to tool evidence.
* [ ] PAAC-10.4 Add permission/risk classification.
* [ ] PAAC-10.5 Add mutation audit records.
* [ ] PAAC-10.6 Add replayable tool-call records.

---

## PAAC-11 — A2A agent boundary

* [ ] PAAC-11.1 Define Agent Card/capability schema for Atlas agents.
* [ ] PAAC-11.2 Prototype supervisor → research-agent delegation.
* [ ] PAAC-11.3 Prototype supervisor → repair-agent delegation.
* [ ] PAAC-11.4 Propagate trace/task/source IDs across A2A.
* [ ] PAAC-11.5 Propagate cancellation and deadlines.
* [ ] PAAC-11.6 Test failure/retry across agent boundary.

Decision:

Use A2A only for independently deployable agents.

Do NOT convert local functions/subagents into network services merely to use A2A.

---

## PAAC-12 — tRPC internal API

* [ ] PAAC-12.1 Inventory app-internal TypeScript RPC boundaries.
* [ ] PAAC-12.2 Use tRPC where client/server types share one codebase.
* [ ] PAAC-12.3 Do not duplicate MCP/A2A operations unnecessarily.
* [ ] PAAC-12.4 Add auth/permission tests.

Decision:

tRPC = internal typed application RPC, not universal agent transport.

---

## PAAC-13 — Mastra proof-of-concept

* [ ] PAAC-13.1 Build one Atlas-backed supervisor workflow.
* [ ] PAAC-13.2 Reuse existing MCP tools.
* [ ] PAAC-13.3 Test ACP coding-harness delegation.
* [ ] PAAC-13.4 Map Mastra run IDs to Atlas run IDs.
* [ ] PAAC-13.5 Compare retries/resume/observability with current orchestrator.
* [ ] PAAC-13.6 Measure additional dependency/runtime complexity.
* [ ] PAAC-13.7 Produce adopt/reject decision record.

No migration of canonical state during POC.

---

## PAAC-14 — Paperclip experiment

* [ ] PAAC-14.1 Run isolated Paperclip evaluation.
* [ ] PAAC-14.2 Map Paperclip agent → Atlas agent identity.
* [ ] PAAC-14.3 Map Paperclip task → canonical task ID.
* [ ] PAAC-14.4 Evaluate board/operator UX.
* [ ] PAAC-14.5 Evaluate lifecycle/agent organization features.
* [ ] PAAC-14.6 Verify no duplicate source of task truth is required.
* [ ] PAAC-14.7 Produce adopt-as-UI / reject decision.

Default recommendation:

EXPERIMENTAL ONLY.

---

## PAAC-15 — RLM decomposition

* [ ] PAAC-15.1 Define recursive subproblem schema.
* [ ] PAAC-15.2 Cap recursion depth and token budget.
* [ ] PAAC-15.3 Allow independent subproblems to batch.
* [ ] PAAC-15.4 Merge typed results into parent request.
* [ ] PAAC-15.5 Persist subproblem lineage.
* [ ] PAAC-15.6 Benchmark against single-context execution.

---

## PAAC-16 — Graph completion lane

* [ ] PAAC-16.1 Materialize source → symbol → feature DAG.
* [ ] PAAC-16.2 Materialize source → claim/fact/evidence KAG.
* [ ] PAAC-16.3 Create feature implementation projection.
* [ ] PAAC-16.4 Add authority metrics.
* [ ] PAAC-16.5 Add community/cluster IDs.
* [ ] PAAC-16.6 Evaluate hypergraph representation only for genuinely n-ary relationships.
* [ ] PAAC-16.7 Persist graph algorithm version and input revision.

Do not force ordinary binary relationships into hyperedges.

---

## PAAC-17 — Learning/evaluation dataset

* [ ] PAAC-17.1 Capture successful repair trajectories.
* [ ] PAAC-17.2 Capture rejected/failed mutations.
* [ ] PAAC-17.3 Capture retrieval relevance labels.
* [ ] PAAC-17.4 Capture root-cause classifications.
* [ ] PAAC-17.5 Remove secrets/private runtime material.
* [ ] PAAC-17.6 Split train/eval by repository revision/task family.
* [ ] PAAC-17.7 Build baseline before QLoRA.
* [ ] PAAC-17.8 Train QLoRA candidate offline.
* [ ] PAAC-17.9 Require held-out improvement for promotion.

---

## PAAC-18 — End-to-end acceptance

Select at least five historical real failures:

* TypeScript/compiler error
* failing unit test
* missing database relation/migration
* retrieval/reranker failure
* runtime/startup failure

For every fixture prove:

* [ ] feature resolution
* [ ] sourceRef grounding
* [ ] relevant file/symbol retrieval
* [ ] context assembly
* [ ] mutation selection
* [ ] bounded patch
* [ ] validation
* [ ] complete lineage
* [ ] Kanban transition
* [ ] reproducible report

Final gate:

Parent Atlas SHALL demonstrate higher first-pass or bounded-retry repair success than the current unguided coding-agent baseline without materially increasing invalid mutations.

---

## PAAC-19 — Current workstation gate summary

This section records the current open lanes and gate order so the task list stays aligned with the live Parent Atlas workstation boundary.

### Open control-plane proofs

* [ ] Prove OpenCode / Ornith replay on a bounded 10-turn path with a preserved `tool_calls[]` history and no raw XML leakage.
* [ ] Keep `llama-server` chat on `:8090` only; keep embeddings on the embedding provider path, not chat.
* [ ] Keep TRACE MCP healthy while proving the replay path.
* [ ] Keep the Valkey OpenCode seed path fixed and idempotent.

### Open graph / retrieval lane

* [ ] Freeze Phase 3–6 proof artifacts as the current dynamic baseline.
* [ ] Prove `Neo4j -> Qdrant` graph projection parity with revision, identity, and stale-projection rejection.
* [ ] Materialize process packets from the graph revision and round-trip them through retrieval.
* [ ] Wire graph-derived features into the existing packet feature matrix and ranking path.

### Open execution lane

* [ ] Bind `ContextManifest` to task grounding with `runId`, selected packet keys, selected process IDs, and source refs.
* [ ] Route grounded tasks through the worker router to Codex / Claude Code / OpenCode.
* [ ] Persist `ExecutionReceipt` and feed validation outcome back into recommendation telemetry.

### Explicit boundary rules

* [ ] Do not reopen Kanban internals; Kanban remains the task-intent surface, not truth ownership.
* [ ] Do not let recommendation policy become a truth owner; it consumes canonical evidence and produces decisions only.
* [ ] Do not promote GPU ranking before graph features are actually flowing through the live retrieval path.
