## 1. Snapshot and task identity

- [x] 1.1 Add a `scripts/atlas` read-only adapter that consumes `openspec-workboard-v1` and emits a normalized Workstation v2 projection with source/report checksums. Proven by `scripts/atlas/build-parent-atlas-workstation-openspec-workboard-v2.mjs` and `docs/reports/parent-atlas-workstation-openspec-workboard-v2.json`; no runtime/store writes.
- [x] 1.2 Derive stable task identities from change ID, source path, task location, normalized text, and task checksum; preserve declared source and revision metadata without inference. Proven by per-task `taskChecksum` and `taskPopulationChecksum` in the v2 report.
- [x] 1.3 Add deterministic replay fixtures proving unchanged ledgers produce the same task population and changed task text changes the task checksum. Proven by `scripts/atlas/prove-parent-atlas-workstation-workboard-v2.mjs`: unchanged replay checksum stable and altered fixture text changes the task checksum.

## 2. Evidence and readiness

- [x] 2.1 Resolve linked reports, receipts, source references, tests, blockers, dependencies, and supersession markers for a bounded task set. The v2 builder records per-reference existence and missing-reference counts without inferring missing evidence.
- [x] 2.2 Implement explicit reconciliation classes: `OPEN_ACTIONABLE`, `BLOCKED_UPSTREAM`, `CLOSED_BY_CURRENT_EVIDENCE`, `SUPERSEDED`, `OWNED_BY_OTHER_CHANGE`, `GOVERNANCE_ONLY`, `NEGATIVE_CONSTRAINT`, `HUMAN_DECISION_REQUIRED`, and `UNVERIFIED`. The v2 proof validates every emitted classification against this exact required set.
- [x] 2.3 Prove unclassified tasks and percentage-only completion cannot become executable candidates. The proof receipt records `unclassifiedNotExecutable=true`, `percentageNotUsedForEligibility=true`, and every emitted task carries `executable=false` with an explicit evidence/classification basis.
- [x] 2.4 Emit an evidence-resolution receipt with missing, stale, contradictory, and verified references. The bounded receipt is `docs/reports/parent-atlas-workstation-evidence-resolution-v1.json`; current missing-reference count is zero and no canonical writes occur.

## 3. Bounded work planning

- [x] 3.1 Implement dependency-first candidate selection with a bounded limit and deterministic priority/change/source-line tie-breaking. The v2 projection uses a limit of 5 and selects only `OPEN_ACTIONABLE` rows explicitly marked executable.
- [x] 3.2 Emit `OpenSpecWorkPlanV1` for one bounded action, including blockers, prerequisites, evidence refs, likely files, mutation class, and validation commands. The current plan is explicitly `NO_EXECUTABLE_CANDIDATE` with `nextAction=null`, blocker evidence, `mutationScope=NONE_UNTIL_EXPLICIT_AUTHORIZATION`, and a deterministic plan checksum.
- [x] 3.3 Emit `NO_EXECUTABLE_CANDIDATE` without invoking a model when no candidate is eligible. Current proof reports zero eligible and zero selected candidates while the lineage blocker remains active.
- [x] 3.4 Add plan checksum and replay tests proving equivalent snapshots produce equivalent plans. The proof reports `planReplayStable=true` across two builder executions.

## 4. ACE and ContextManifest integration

- [x] 4.1 Adapt the existing ACE context owner to accept selected task/evidence references without creating a second ContextManifest owner. `scripts/atlas/build-parent-atlas-workstation-ace-context-v1.mjs` is reference-only and names the existing ACE/ContextManifest owner as authoritative.
- [x] 4.2 Enforce context token/reference limits and record selected and excluded candidates. The adapter enforces a 2,000-token budget, 8-reference cap, selected task refs, and excluded task count.
- [x] 4.3 Prove the assembled context contains exact checksums and revisions and never the complete backlog by default. `scripts/atlas/prove-parent-atlas-workstation-ace-context-v1.mjs` reports bounded context, stable replay, backlog exclusion, exact workboard/task/plan checksums, and zero writes.

## 5. Ornith synthesis and residency

- [x] 5.1 Add a dry-run Ornith synthesis adapter through the existing llama-server `:8090` model resolver. `scripts/atlas/run-parent-atlas-workstation-ornith-synthesis-dry-v1.mjs` verifies the live allowlisted `ornith-1.5-9b` boundary and performs no generation while no candidate is executable.
- [x] 5.2 Record model, prompt, workboard, task, evidence, context, input, output, and producer revisions in the synthesis receipt. Receipt: `docs/reports/parent-atlas-workstation-ornith-synthesis-dry-v1.json`.
- [x] 5.3 Add revision-safe BitFrost/Valkey residency descriptors and exact hit/stale-reject replay tests. `scripts/atlas/build-parent-atlas-workstation-residency-v1.mjs` emits a reference-only identity descriptor; `scripts/atlas/prove-parent-atlas-workstation-residency-v1.mjs` proves deterministic exact-hit identity and `STALE_REJECT` on a changed context revision. No Valkey connection or cache writes occur; live residency adoption remains a separate gate.
- [x] 5.4 Prove model/runtime failure is fail-closed and does not fall back to Ollama chat generation. The focused proof exercises live `:8090` and an unavailable endpoint; it reports `unavailableFailClosed=true`, `noFallback=true`, and zero model calls.

## 6. Validation and mutation boundary

- [x] 6.1 Add a plan-only proof showing zero task-ledger, source, database, Qdrant, Neo4j, cache, and model writes where synthesis is disabled. `scripts/atlas/prove-parent-atlas-workstation-plan-only-v1.mjs` checks the workboard, ACE, Ornith dry-run, and residency receipts and emits `docs/reports/parent-atlas-workstation-plan-only-proof-v1.json` with zero write flags and zero model calls.
- [x] 6.2 Add explicit authorization and base-revision checks for any future task-ledger or source mutation adapter. `scripts/atlas/prove-parent-atlas-workstation-mutation-gate-v1.mjs` proves missing authorization and changed plan identity are rejected; no mutator is invoked.
- [x] 6.3 Require a successful validation receipt before mutation and reject stale plans. The same proof requires a `PROVEN` zero-write validation receipt and reports `STALE_PLAN_REJECT` for a changed report checksum.
- [x] 6.4 Keep implementation in `scripts/atlas` until a separate package-owner promotion proof succeeds. All new workstation adapters and proofs remain in `scripts/atlas`; no package promotion is claimed.

## 7. Documentation and acceptance

- [x] 7.1 Add a workstation synthesis report with status, checksums, selected action, blocked actions, and write flags. `scripts/atlas/build-parent-atlas-workstation-synthesis-report-v1.mjs` emits `docs/reports/parent-atlas-workstation-synthesis-report-v1.json` with no selected action while `PKT-LINEAGE-08` remains blocked.
- [x] 7.2 Update the authoritative workstation/convergence handoff with linked evidence and the next bounded gate. The report links the current workboard, ACE context, Ornith dry-run, residency, and plan-only receipts; the convergence ledger remains authoritative for `PKT-LINEAGE-08` and its fresh lineage audits.
- [x] 7.3 Run focused tests, JSON parsing, `git diff --check`, and strict OpenSpec validation. The residency proof, plan-only proof, JSON parsing, and strict validation pass; no datastore or model writes occurred.
