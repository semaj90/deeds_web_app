# Tasks: parent-atlas-document-governance-master-index

**Task-count reconciliation (2026-09-23, read-only)**: a prior session cited two conflicting counts
for this change -- "33/64" and "14/64" -- without determining which was authoritative. Counted
directly from this live file: **33 `[x]` / 31 `[ ]` / 64 total -- 33/64 is correct and current.**
The "14/64" figure was a stale/corrupted aggregate workboard projection snapshot, not a real
change in task state -- no task reopening, restructuring, or different change involved. Consistent
with this repo's own standing caution: treat each change's `tasks.md` as task authority; the
aggregate workboard is projection evidence only until a clean rebuild succeeds.

**Partial CLAUDE_INSTRUCTION_SUPERSESSION_PLAN_2_2 contribution (2026-09-23, read-only, bounded --
NOT the full gate)**: located the 7 real `CLAUDE.md` files (excluding `node_modules/`,
`.tmp/workspace-source-snapshots/`, and `deeds_labs/archive/` snapshot copies): `CLAUDE.md` (root),
`.claude/CLAUDE.md`, `claude-mem/CLAUDE.md`, `llama-cpp-turboquant-gemma4/CLAUDE.md`,
`mcp-server-mcp/CLAUDE.md`, `tools/agentic-research/src/firecrawl/CLAUDE.md`,
`sveltekit-frontend/CLAUDE.md` -- matches the expected 1 root / 6 nested inventory. Cross-checked
these 7 paths against the existing `docs/reports/document-supersession-audit-v1.json` (16 explicit
"supersedes"-style reference edges found across the whole repo by an earlier, broader audit): **zero
edges have both `from` and `to` as CLAUDE.md files** -- the only CLAUDE.md-involving edge is
`CLAUDE.md -> docs/archive-manifest.json` (not another instruction document). This is real,
reused, supporting evidence for `NO_SUPERSESSION_EVIDENCE` across all 7 files, consistent with
governance 2.2's expected default outcome. **This is NOT the full gate**: no
`ClaudeInstructionSupersessionPlanV1` contract was built, no `InstructionScopeV1`/
`DocumentSupersessionV1` dimension types were frozen, no fixture proofs (A-F) were written, no
deterministic-replay checksum was generated, and the existing supersession audit's search pattern
was not verified to be scoped correctly for this specific question (it was built for a different,
broader purpose). Left as a real, bounded, honestly-partial contribution for the next session with
full budget to build the actual contract/fixtures on top of.

## 1. Registry and discovery

- [x] 1.1 Add `DocumentGovernanceRecordV1` schema with explicit status, topic ownership, supersession, OpenSpec, validation, workflow-progress-reference, and archive fields. Evidence: `packages/parent-atlas/src/core/document-governance-record-v1.ts` is the strict shared Zod owner; the deterministic registry builder validates every emitted record before serialization, and the SSR API validates the registry before summarizing it. Unassigned topics, unassessed supersession, unchecked validation, absent workflow receipts, and blocked archive state are explicit; no authority is inferred. Focused package tests: 4/4.
- [x] 1.2 Add read-only repository discovery for root/scoped `CLAUDE.md`, `docs/**/*.md`, OpenSpec artifacts, and `docs/reports/**/*`.
- [x] 1.3 Add deterministic topic/status extraction from explicit frontmatter/status text/path conventions; semantic/LLM classification may nominate but never promote canonical state. Evidence: `scripts/atlas/document-governance-frontmatter-v1.mjs` accepts only dedicated `documentStatus`/`document_status`, `topicIds`/`topic_ids`, and `canonicalForTopics`/`canonical_for_topics` fields; generic `status` is deliberately ignored because `.okf` uses evidence-state semantics. Path classifications remain deterministic, malformed/inconsistent declarations fail closed, and no LLM promotion exists. Tests: 4/4. Whole registry replay: 4,712 records, 0 topic claims/explicit governance statuses, 0 frontmatter failures; 34 existing `.okf` generic statuses remained unpromoted.
- [x] 1.4 Add one-canonical-document-per-topic validation and fail closed with `CONFLICT` when violated. Evidence: `scripts/atlas/document-governance-topic-conflicts-v1.mjs` groups only explicit `canonicalForTopics` claims with `CANONICAL_CURRENT` status; all documents competing for a topic become `CONFLICT` with failed validation, and no winner is selected. Tests: 3/3 including a two-document conflict fixture and supporting-document non-conflict. Whole-registry replay: 4,712 records, 0 explicit canonical topic claims, 0 conflicts.
- [x] 1.5 Add generated registry artifact with deterministic canonical JSON checksum and replay test.

## 2. CLAUDE.md supersession map

- [x] 2.1 Discover every case-insensitive `CLAUDE.md`/`claude.md` and record scope/inheritance separately from supersession. Evidence: `scripts/atlas/build-master-toc.mjs` discovers case-insensitive exact-basename files; `scripts/atlas/document-governance-instruction-scope-v1.mjs` records scope path, nearest parent document ID, and explicit parent-resolution state without adding supersession edges. Tests: 4/4 including nested inheritance, no parent, case-insensitive duplicate ambiguity, and AGENTS separation. Whole registry: 7 CLAUDE files, 7 scopes, 1 root, 6 resolved parents, 0 ambiguous, 0 supersession edges.
- [x] 2.2 Build `ClaudeInstructionSupersessionPlanV1` with current SHA-256, topic claims, explicit supersedes/supersededBy links, contradictions, and proposed disposition. Evidence: `scripts/atlas/plan-claude-instruction-supersession-v1.mjs` verifies each current instruction byte digest against the registry and the registry checksum against its audit input; only explicit reciprocal document-ID links can nominate supersession. Scope remains separate, contradictions fail closed, and output is read-only/noncanonical. Four focused tests pass; 7 current CLAUDE files produce a bounded plan with no inferred supersession.
- [x] 2.3 Add fail-closed rule: file recency alone cannot imply supersession. Evidence: planner consumes no modification timestamps; regression test assigns a future-dated nested instruction and confirms it remains `SCOPED_SUPPORTING`, with zero superseded candidates absent an explicit reciprocal link.
- [x] 2.4 Add dry-run report listing `CANONICAL_CURRENT`, `SCOPED_SUPPORTING`, `SUPERSEDED_CANDIDATE`, and `CONFLICT` instruction files. Evidence: `docs/reports/claude-instruction-supersession-plan-v1.json` lists each of 7 files with one of the four dispositions, counts 1/6/0/0, and records read-only/noncanonical flags; input registry and audit checksums agree.
- [x] 2.5 Add smoke test proving historical/original instruction files are not modified during discovery. Evidence: `scripts/atlas/plan-claude-instruction-supersession-v1.smoke.mjs` hashes every discovered instruction before and after planner execution and verifies each report digest; all 7 original files remained byte-identical.

## 3. OpenSpec binding and completion checks

- [x] 3.1 Bind tracked implementation work to an existing OpenSpec change or report `OPENSPEC_BINDING_MISSING`. Evidence: the current registry's 93 `OPENSPEC_TASKS` records are checked against the canonical nested `openspec.change` field; 93/93 are bound, 0 missing, and stale flat-field access was removed. Four fixture cases cover bound, missing, malformed progress, and non-OpenSpec documents.
- [x] 3.2 Validate proposal/spec/design/tasks lifecycle according to the change's OpenSpec schema/config; do not assume every artifact when a schema explicitly skips one. Evidence: `openspec status --change parent-atlas-document-governance-master-index` reports `spec-driven`, 4/4 required artifacts complete (`proposal`, `design`, `specs`, `tasks`); strict validation passes.
- [x] 3.3 Parse tracked `tasks.md` checkboxes and expose `completedTasks`, `totalTasks`, and `progressFraction`. Verified against the generated governance registry for this change: 33/64 and 0.515625 match the source checkbox census exactly (2026-09-22).
- [x] 3.4 Add completion rule: no document consolidation is `IMPLEMENTATION_COMPLETE` while tracked tasks remain unchecked. Evidence: `getOpenSpecClosureBlockersV1` emits `UNCHECKED_TASKS` while any tracked task is open; the current registry has 3,348 unchecked tasks across 93 ledgers and the read-only report correctly records `closureEligible=false`. Focused closure tests cover both open and complete cases.
- [x] 3.5 Add archive-candidate rule only after all tracked tasks are complete and validation gates pass. Evidence: `scripts/atlas/document-governance-archive-gate-v1.mjs` requires supersession validation, reciprocal replacement, no active references, completed bound OpenSpec or explicit exemption, passing validation/smoke/tests, and no contradictions. Five tests cover admissible and blocked cases; the registry auditor itself never treats a record flag as proof of a completed reference scan. Current registry has 0 superseded/link/archive candidates; no archive was applied.

## 4. Agentic workflow receipts, progress, and ETA

- [x] 4.1 Finish/reconcile `parent-atlas-agentic-run-receipt-binding` T1 against current `WorkflowActionEventV1`; reuse canonical workflow/action/sequence identity. Evidence: the shared core receipt owner derives `(workflowId, workflowRevision, actionId, sequence)`, but the recorder had omitted `workflowRevision` from its de-duplication key. The recorder and isolated-repository smoke now preserve workflow revision, prove same-revision replay is idempotent, allow the same action/sequence in a new workflow revision, and reject changed payload under an identical canonical coordinate.
- [x] 4.2 Keep `artifactRefs` and `filesEdited` distinct: canonical `WorkflowActionEventV1.artifactRefs` contains artifact IDs/references, while changed source paths are workflow accounting metadata (`metadata.filesEdited` in the canonical adapter) and remain a separate field in agent-run receipts. No new canonical event field is needed; adapter round-trip preserves the UI field without conflating it with generated artifacts. Evidence: `packages/parent-atlas/src/core/workflow-action-event.ts`, `sveltekit-frontend/src/lib/server/atlas/workflow/workflow-action-event-v1.ts`, and `scripts/atlas/agentic-recommendation-workflow.mjs`.
- [x] 4.3 Implement/dogfood the existing OpenSpec receipt recorder using `WorkflowActionEventV1` rather than a second receipt schema. Both recorder paths now validate against the canonical `workflowActionEventSchema`; workflow aggregation preserves the completed event identity/revisions, preflights the entire batch, and refuses groups without a canonical completed event. Temporary-repository smoke proves canonical apply/readback plus fail-closed rejection without ledger writes for incomplete events: `scripts/atlas/record-agentic-run-receipt.smoke.mjs`, `scripts/atlas/record-workflow-run-receipt.smoke.mjs`.
- [ ] 4.4 Roll current `WorkflowActionEventV1.progress.fraction`, `etaMs`, and `confidence` into document-governance summary state. BLOCKED: the frontend adapter has typed `progress`, but the shared core event only exposes untyped metadata; the only discovered receipt JSONL is ignored/untracked and lacks required canonical `workflowRevision`/`runId`. Do not ingest it or fabricate progress. Next proof: produce an admitted core-schema event with explicit progress, then verify document binding and checksum.
- [x] 4.5 Never synthesize ETA from checkbox counts; render `ETA unavailable` when no runtime ETA exists. Evidence: the generated `docs/MASTER-TOC.md` explicitly renders `ETA unavailable` and states no current `WorkflowActionEventV1.progress.etaMs` receipt was consumed. The TOC builder's checkbox counts are used only for completion percentage, never ETA. No runtime ETA was fabricated.
- [ ] 4.6 Add receipt/reference checksum to document-governance rollup so stale workflow progress can be detected. BLOCKED_BY 4.4: no admitted progress receipt/reference exists to checksum; adding a checksum of an ignored/unqualified receipt would falsely imply authority.

## 5. Supersession, smoke, validation, and archive gates

- [x] 5.1 Reuse useful discovery ideas from `git-diff-supersedes-reconcile-production.mjs` without making it the canonical document owner. Evidence: adapted only its exact-string `rg` reference-discovery concept from `findStaleDocs` into the bounded read-only document census; intentionally did not import its Postgres/Qdrant/Redis lookup, invalidation, supersession, or apply behavior. Focused census tests: 4/4; no canonical owner or store writes.
- [x] 5.2 Build reference census using `rg` for old path, title, explicit topic IDs, and supersession identifiers. Evidence: `scripts/atlas/document-reference-census-v1.mjs` searches exact values only for explicit superseded records/replacement links, with a fixture covering path/title/topic/document/replacement IDs and fail-closed search errors. Current registry: 0 superseded records and 0 explicit links, so live result is `NO_SUPERSESSION_TARGETS` (no search falsely claimed); generated receipt is noncanonical/read-only.
- [x] 5.3 Add replacement-coverage validation: superseded document must have at least one validated `supersededBy` target. Evidence: `scripts/atlas/document-governance-archive-gate-v1.mjs` requires a nonempty `supersededBy` set, each target to exist, and each link to be reciprocal; tests cover an admissible reciprocal replacement and unresolved replacement rejection.
- [x] 5.4 Add link smoke test for canonical and replacement documents. Evidence: `scripts/atlas/document-governance-link-smoke-v1.mjs` and its tests verify current source checksums, replacement targets, and reciprocal IDs fail-closed. Live smoke checks canonical files and reports the actual replacement-link count; 0 links is reported as such, not claimed as live replacement proof.
- [ ] 5.5 Add contradiction validation against active `CLAUDE.md`, canonical OpenSpec specs, representation manifests, and current architecture contracts.
- [x] 5.6 Add archive eligibility report with explicit blocked reasons. Evidence: `validate-document-governance-index.mjs` includes per-candidate blocker codes from `document-governance-archive-gate-v1.mjs`; the audit explicitly reports `NO_SUPERSESSION_OR_ARCHIVE_CANDIDATES` when empty, with 0 eligible and 0 writes. Tests cover active references, incomplete OpenSpec, missing replacement, unproven reference scan, and empty-candidate reason.
- [ ] 5.7 Add `--apply` archive operation only after dry-run/readback proof; default remains non-destructive.
- [ ] 5.8 Preserve OpenSpec changes under OpenSpec's own archive lifecycle; do not move them with the docs archive tool.

## 6. Master TOC generation

- [x] 6.1 Implement `scripts/atlas/build-master-toc.mjs` from the canonical registry.
- [ ] 6.2 Generate `docs/MASTER-TOC.md` with canonical topics, active OpenSpec changes, progress, ETA when available, superseded docs, archive-ready docs, experiments, and conflicts.
- [x] 6.3 Add `--check` mode that fails when committed `MASTER-TOC.md` differs from deterministic regeneration.
- [ ] 6.4 Add direct pointers to canonical source docs and OpenSpec changes; do not duplicate their substantive content.
- [ ] 6.5 Add quick-retrieval keywords/topic aliases without turning the TOC into a second semantic knowledge base.

## 7. Ewin Tang / experimental recommendation audit

- [ ] 7.1 Index `TANG_INSPIRED_LOW_RANK_SHORTLIST` from `parent-atlas-memory-architecture-freeze` as `EXPERIMENTAL`, `canonicalAuthority=false`.
- [ ] 7.2 Link `docs/reports/atlas-candidate-shortlist-receipt-v1.json` and expose its current `EXECUTED_UNPROVEN` status/quality metrics.
- [ ] 7.3 Add validation preventing an experimental/challenger record from becoming `CANONICAL_CURRENT` merely through document consolidation.
- [ ] 7.4 Add a future promotion-gate link rather than restating Tang-inspired sampling as current retrieval authority.

## 8. Parent Atlas admin SSR/API

- [ ] 8.1 Add read-only `/api/admin/atlas/document-governance` endpoint returning compact registry summary, topic conflicts, active OpenSpec progress, latest receipts, and archive readiness.
- [x] 8.2 Extend `/admin/atlas/+page.server.ts` to load the document-governance summary during SSR; browser code must not scan repository files directly.
- [ ] 8.3 Add typed page-data contract for the governance summary.
- [ ] 8.4 Add Svelte 5 runes state for filters/selection only; use `$derived` for computed counts/progress and `$effect` only for actual synchronization/side effects.
- [ ] 8.5 Add Bits UI `Tabs` for Current / OpenSpec / Superseded / Archive Ready / Conflicts.
- [ ] 8.6 Add Bits UI `Progress` for OpenSpec task completion and show runtime ETA/confidence when available.
- [ ] 8.7 Add Bits UI `Accordion` for per-topic lineage, source documents, supersession edges, validation receipts, and blocked archive reasons.
- [ ] 8.8 Add refresh action that re-fetches the API without mutating governance state.

## 9. Validation and smoke

- [ ] 9.1 Add unit tests for schema validation, topic conflicts, supersession rules, progress derivation, ETA absence, and archive eligibility.
- [x] 9.2 Add deterministic rebuild/replay test for registry and master TOC checksums. Evidence: `npm run atlas:docs:toc:replay-smoke` rebuilds both projections twice and asserts byte-identical outputs; the run receipts are in `docs/reports/openspec-workboard-run-2026-09-22T220428Z.json`. Generated workboard/session-run projections are excluded as inputs so report refreshes cannot perturb the registry checksum.
- [x] 9.3 Add fixture proving a scoped `CLAUDE.md` is not treated as superseding its parent merely because it is newer. Evidence: `scripts/atlas/document-governance-supersession-plan-v1.test.mjs` supplies a scoped child with a future `modifiedAt`, then verifies it remains `SCOPED_SUPPORTING` with no supersession edge.
- [x] 9.4 Add fixture proving an unchecked OpenSpec task blocks implementation-complete/archive-ready status. Evidence: `scripts/atlas/document-governance-archive-gate-v1.test.mjs` lowers the bound OpenSpec task count and verifies `OPENSPEC_CHANGE_INCOMPLETE`; the gate's eligibility result remains false.
- [x] 9.5 Add fixture proving an active reference blocks archive. Evidence: `scripts/atlas/document-governance-archive-gate-v1.test.mjs` supplies an active source-path reference and verifies `ACTIVE_DOCUMENT_REFERENCE_EXISTS` blocks candidacy.
- [ ] 9.6 Add API/SSR tests for `/admin/atlas` governance data.
- [ ] 9.7 Run focused Svelte/Vitest checks and `npm run check` for touched admin surfaces.
- [ ] 9.8 Run `build-document-governance-index --dry-run`, `validate-document-governance-index`, and `build-master-toc --check` twice and require identical checksums.

## 10. First bounded apply

- [ ] 10.1 Generate the first complete registry and `docs/MASTER-TOC.md` without editing or moving original documents.
- [ ] 10.2 Review every `CONFLICT` and `SUPERSEDED_CANDIDATE`; do not bulk-resolve through model judgment.
- [ ] 10.3 Select at most five clearly superseded non-instruction docs for archive canary.
- [ ] 10.4 Run archive canary with explicit authorization, exact pre/post path checks, rollback-on-failure semantics where applicable, and no OpenSpec/CLAUDE moves.
- [ ] 10.5 Record the canary workflow receipt under this OpenSpec change.

## Master Feature TODO reconciliation — 2026-08-31

- [x] **DOC-GOV-MASTER-TODO-01** Locate and checksum the archived Master Feature TODO: `docs/reports/sessions/MASTER-FEATURE-TODO-2026-05-20.md`; 1,468 lines, 466 checklist rows, 297 checked, SHA-256 `0e6e1206a9eb05f307466c75d7404ce72e4350adbf242414d3b7e2ee3ab00bea`.
- [x] **DOC-GOV-MASTER-TODO-02** Record the historical TODO as an archived reference rather than a second active task authority.
- [ ] **DOC-GOV-MASTER-TODO-03** Reconcile each still-open historical item to an existing OpenSpec change using exact source references and source revisions where available; do not copy or auto-close tasks.
- [ ] **DOC-GOV-MASTER-TODO-04** Classify historical completion claims as `PROVEN`, `FIXTURE_ONLY`, `REFERENCE_ONLY`, or `UNPROVEN` from current receipts before any task is marked complete.
- [ ] **DOC-GOV-MASTER-TODO-05** Generate a bounded crosswalk from historical TODO sections to OpenSpec task keys and include unresolved/ambiguous rows in the governance report.

### Master Feature TODO crosswalk evidence — 2026-08-31

Generated `docs/reports/master-feature-todo-openspec-crosswalk-v1.json` in review-only mode.
It contains 466 archived checklist rows, 297 historically checked and 169 historically open;
285 rows have lexical OpenSpec candidates, 113 of those are explicitly ambiguous, and 181 remain without a candidate. Every row retains
the archived `sourceRef` and the TODO SHA-256 `sourceRevision`. These are candidate mappings only:
no OpenSpec task was copied, closed, or merged. DOC-GOV-MASTER-TODO-05 remains open until
ambiguous-match review is explicitly represented and human-reviewed.
