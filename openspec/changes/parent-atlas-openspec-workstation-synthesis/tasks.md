## 1. Snapshot and task identity

- [x] 1.1 Add a `scripts/atlas` read-only adapter that consumes `openspec-workboard-v1` and emits a normalized Workstation v2 projection with source/report checksums. Proven by `scripts/atlas/build-parent-atlas-workstation-openspec-workboard-v2.mjs` and `docs/reports/parent-atlas-workstation-openspec-workboard-v2.json`; no runtime/store writes.
- [x] 1.2 Derive stable task identities from change ID, source path, task location, normalized text, and task checksum; preserve declared source and revision metadata without inference. Proven by per-task `taskChecksum` and `taskPopulationChecksum` in the v2 report.
- [ ] 1.3 Add deterministic replay fixtures proving unchanged ledgers produce the same task population and changed task text changes the task checksum.

## 2. Evidence and readiness

- [ ] 2.1 Resolve linked reports, receipts, source references, tests, blockers, dependencies, and supersession markers for a bounded task set.
- [ ] 2.2 Implement explicit readiness classes: `READY`, `BLOCKED`, `NEEDS_PROOF`, `STALE`, `SUPERSEDED`, `DEFERRED`, and `NEEDS_HUMAN_DECISION`.
- [ ] 2.3 Prove unclassified tasks and percentage-only completion cannot become executable candidates.
- [ ] 2.4 Emit an evidence-resolution receipt with missing, stale, contradictory, and verified references.

## 3. Bounded work planning

- [ ] 3.1 Implement dependency-first candidate selection with configurable limits and deterministic tie-breaking.
- [ ] 3.2 Emit `OpenSpecWorkPlanV1` for one bounded action, including blockers, prerequisites, evidence refs, likely files, mutation class, and validation commands.
- [ ] 3.3 Emit `NO_EXECUTABLE_CANDIDATE` without invoking a model when no candidate is eligible.
- [ ] 3.4 Add plan checksum and replay tests proving equivalent snapshots produce equivalent plans.

## 4. ACE and ContextManifest integration

- [ ] 4.1 Adapt the existing ACE context owner to accept selected task/evidence references without creating a second ContextManifest owner.
- [ ] 4.2 Enforce context token/reference limits and record selected and excluded candidates.
- [ ] 4.3 Prove the assembled context contains exact checksums and revisions and never the complete backlog by default.

## 5. Ornith synthesis and residency

- [ ] 5.1 Add a dry-run Ornith synthesis adapter through the existing llama-server `:8090` model resolver.
- [ ] 5.2 Record model, prompt, workboard, task, evidence, context, input, output, and producer revisions in the synthesis receipt.
- [ ] 5.3 Add revision-safe BitFrost/Valkey residency descriptors and exact hit/stale-reject replay tests.
- [ ] 5.4 Prove model/runtime failure is fail-closed and does not fall back to Ollama chat generation.

## 6. Validation and mutation boundary

- [ ] 6.1 Add a plan-only proof showing zero task-ledger, source, database, Qdrant, Neo4j, cache, and model writes where synthesis is disabled.
- [ ] 6.2 Add explicit authorization and base-revision checks for any future task-ledger or source mutation adapter.
- [ ] 6.3 Require a successful validation receipt before mutation and reject stale plans.
- [ ] 6.4 Keep implementation in `scripts/atlas` until a separate package-owner promotion proof succeeds.

## 7. Documentation and acceptance

- [ ] 7.1 Add a workstation synthesis report with status, checksums, selected action, blocked actions, and write flags.
- [ ] 7.2 Update the authoritative workstation/convergence handoff with linked evidence and the next bounded gate.
- [ ] 7.3 Run focused tests, JSON parsing, `git diff --check`, and strict OpenSpec validation.
