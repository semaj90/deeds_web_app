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

## 8. Live-capability follow-up (2026-09-05, addendum to a closed change — no checkbox above was reopened)

This change proved fail-closed rejection paths for Ornith generation (5.1/5.4) and BitFrost
residency (5.3), but neither ever executed the thing it describes: 5.1's dry-run script has no
`/v1/chat/completions` call anywhere in it (unreachable while `context.status` stays
`NO_EXECUTABLE_CANDIDATE`), and 5.3's descriptor never opens a Valkey connection
(`cacheDecision: 'NOT_EXECUTED_REFERENCE_ONLY'` always). Per this repo's own AGENT_EXECUTION_INTEGRITY
rule, a proof of rejection is not a proof of function. This addendum closes that specific gap —
it does not touch `PKT-LINEAGE-08`, does not build the deferred mutation executor, and does not
reopen any task above.

- [x] 8.1 (`WORKSTATION-BITFROST-LIVE-READ-01`) Extend
  `scripts/atlas/build-parent-atlas-workstation-residency-v1.mjs` with a real, read-only Valkey
  `GET` against the exact computed `cacheKey` (ioredis, `lazyConnect`, `enableOfflineQueue: false`,
  fail-soft to `CACHE_UNAVAILABLE` on connection failure — the same client pattern already used by
  `scripts/atlas/prove-bitfrost-invalidation-owner-v1.mjs`). Classifies
  `MISS | EXACT_HIT | STALE_REJECT | CACHE_UNAVAILABLE`. `writes.valkey`/`writes.redis` remain `0`
  (a GET is not a write). Live-run result against the real running Valkey: `MISS`
  (`docs/reports/parent-atlas-workstation-residency-v1.json`).
- [x] 8.2 **Corrected same day, external review**: the first version of this task self-tested
  `EXACT_HIT`/`STALE_REJECT` by performing a live `SET`/`DEL` against a disposable key. That is a
  real Valkey write — reporting `writes.valkey: 0` / `cacheWritesPerformed: false` next to it would
  have been false, even though the key was disposable and no canonical store was touched. Removed
  entirely. `EXACT_HIT`/`STALE_REJECT` classification logic stays proven by the existing in-memory
  fixture (`deterministicReplay`, `staleIdentityChanged`) in
  `scripts/atlas/prove-parent-atlas-workstation-residency-v1.mjs`, which never touches real Valkey.
  This gate (`WORKSTATION-BITFROST-LIVE-READ-01`) proves only a real connect → `GET` → classify
  (`MISS | EXACT_HIT | STALE_REJECT`) against the exact production `cacheKey`, with no `SET`,
  `DEL`, `SCAN`, or any other mutation. `CACHE_UNAVAILABLE` (Valkey unreachable) reports
  `LIVE_RUNTIME_UNAVAILABLE` with a non-zero exit — never a passing result. Live-run result against
  the real running Valkey: `LIVE_GET_PROVEN`, `cacheDecision: "MISS"`,
  `cacheWritesPerformed: false`, `canonicalWritesPerformed: false`
  (`docs/reports/parent-atlas-workstation-residency-proof-v1.json`). A future, separate mutation
  fixture (`WORKSTATION-BITFROST-LIVE-VALUE-FIXTURE-01`) may prove real `EXACT_HIT`/`STALE_REJECT`
  against an isolated namespace and must honestly report `cacheWritesPerformed: true` — not this
  gate.
- [x] 8.3 (`WORKSTATION-ORNITH-LIVE-FIXTURE-01`) Added
  `scripts/atlas/lib/workstation-ornith-adapter.mjs` — a shared discovery/streaming adapter — and
  refactored the existing dry-run discovery script to delegate to it, so the dry-run and fixture
  paths share one model-resolver/SSE owner instead of two subtly different implementations. Added
  `scripts/atlas/run-parent-atlas-workstation-ornith-synthesis-fixture-v1.mjs`: a real
  `POST :8090/v1/chat/completions` call (`stream: true`, SSE assembly, per this repo's canonical
  Gemma4/Ornith llama-server rule) using a small hardcoded, non-production fixture prompt — never
  the real `parent-atlas-workstation-ace-context-v1.json` backlog content. Writes its own separate
  receipt, `docs/reports/parent-atlas-workstation-ornith-synthesis-fixture-v1.json`, with
  `canonicalAuthority: false`, `productionPlanPath: false`, `requestChecksum`, `responseChecksum`,
  `finishReason`, and `streamed: true` (the output content itself is execution evidence, not a
  cross-run determinism requirement). Live-run result: `LIVE_FIXTURE_PROVEN`, `modelCalls: 1`,
  `loadedModel: "ornith-1.5-9b"`, real assembled output `"ORNITH_FIXTURE_OK"`,
  `finishReason: "stop"`.
- [x] 8.4 Added `scripts/atlas/prove-parent-atlas-workstation-ornith-synthesis-fixture-v1.mjs`: this
  proof harness itself hashes `docs/reports/parent-atlas-workstation-ornith-synthesis-dry-v1.json`
  and `...-proof-v1.json` *before* invoking the fixture runner (not a separately-run before/after
  command pair — the atomicity of the preimage comes from the harness owning both the hash and the
  invocation), then re-hashes after, asserting byte-identical. Runtime-unavailable is reported as
  `LIVE_RUNTIME_UNAVAILABLE` with a non-zero exit, never as a passing/skippable result. Proven live:
  `status: "PROVEN"`, `dryRunReceiptUntouched: true`, `dryRunProofUntouched: true`,
  `productionAdoption: "BLOCKED_CURRENT_LINEAGE"`
  (`docs/reports/parent-atlas-workstation-ornith-synthesis-fixture-proof-v1.json`).
- [x] 8.5 Verified no regression: re-ran the original, unmodified
  `prove-parent-atlas-workstation-ornith-synthesis-dry-v1.mjs` and
  `prove-parent-atlas-workstation-plan-only-v1.mjs` after 8.1–8.4 — both still report `PROVEN`
  with `noModelCalls: true` / `modelCalls: 0` on the production path, exactly as before this
  addendum. All 7 scripts in the full chain (8.1–8.6 plus the two regression checks and the
  rollup) exit `0` — one exact count, not two overlapping ones.
- [x] 8.6 Added `liveCapabilityProofs` (informational only, `{ gate, ornith: {...}, bitfrost:
  {...}, productionAdoption: "BLOCKED_CURRENT_LINEAGE" }`) to
  `scripts/atlas/build-parent-atlas-workstation-synthesis-report-v1.mjs`'s rollup. Confirmed
  `status`, `nextGate` (`SOURCE-SELECTION-AUTHORITY-01`), and `blockedActions` (still includes
  `PKT-LINEAGE-08`) are unchanged from before this addendum — this work does not select an
  executable task or advance the upstream lineage blocker. This closed change's own `nextGate`
  wording is left as historical record, not rewritten — the current, more precise implementation
  gate name lives in the active convergence authority (see cross-reference below), not here.

**Final state, `WORKSTATION-LIVE-CAPABILITY-PROOF-01`** (two child gates,
`WORKSTATION-ORNITH-LIVE-FIXTURE-01` + `WORKSTATION-BITFROST-LIVE-READ-01`): both `*_PROVEN`,
canonical writes `0`, cache writes `0` for this gate, production plan-only path model calls `0`,
isolated fixture-path model calls exactly `1`. This is capability evidence only, not production
Workstation adoption. No mutation executor was built. No Postgres/Qdrant/Neo4j write occurred. No
package dependency was added (`ioredis` was already a repo dependency). `PKT-LINEAGE-08` remains
exactly as blocked as before — this addendum only proves the previously-untested plumbing around
it actually functions. See `parent-atlas-retrieval-lineage-dag-convergence/tasks.md` for the
current-authority cross-reference and the active next gate.
