# Tasks: parent-atlas-document-governance-master-index

## 1. Registry and discovery

- [ ] 1.1 Add `DocumentGovernanceRecordV1` schema with explicit status, topic ownership, supersession, OpenSpec, validation, workflow-progress-reference, and archive fields.
- [x] 1.2 Add read-only repository discovery for root/scoped `CLAUDE.md`, `docs/**/*.md`, OpenSpec artifacts, and `docs/reports/**/*`.
- [ ] 1.3 Add deterministic topic/status extraction from explicit frontmatter/status text/path conventions; semantic/LLM classification may nominate but never promote canonical state.
- [ ] 1.4 Add one-canonical-document-per-topic validation and fail closed with `CONFLICT` when violated.
- [x] 1.5 Add generated registry artifact with deterministic canonical JSON checksum and replay test.

## 2. CLAUDE.md supersession map

- [ ] 2.1 Discover every case-insensitive `CLAUDE.md`/`claude.md` and record scope/inheritance separately from supersession.
- [ ] 2.2 Build `ClaudeInstructionSupersessionPlanV1` with current SHA-256, topic claims, explicit supersedes/supersededBy links, contradictions, and proposed disposition.
- [ ] 2.3 Add fail-closed rule: file recency alone cannot imply supersession.
- [ ] 2.4 Add dry-run report listing `CANONICAL_CURRENT`, `SCOPED_SUPPORTING`, `SUPERSEDED_CANDIDATE`, and `CONFLICT` instruction files.
- [ ] 2.5 Add smoke test proving historical/original instruction files are not modified during discovery.

## 3. OpenSpec binding and completion checks

- [ ] 3.1 Bind implementation-changing document work to an existing OpenSpec change or report `OPENSPEC_BINDING_MISSING`.
- [ ] 3.2 Validate proposal/spec/design/tasks lifecycle according to the change's OpenSpec schema/config; do not assume every artifact when a schema explicitly skips one.
- [ ] 3.3 Parse tracked `tasks.md` checkboxes and expose `completedTasks`, `totalTasks`, and `progressFraction`.
- [ ] 3.4 Add completion rule: no document consolidation is `IMPLEMENTATION_COMPLETE` while tracked tasks remain unchecked.
- [ ] 3.5 Add archive-candidate rule only after all tracked tasks are complete and validation gates pass.

## 4. Agentic workflow receipts, progress, and ETA

- [ ] 4.1 Finish/reconcile `parent-atlas-agentic-run-receipt-binding` T1 against current `WorkflowActionEventV1`; reuse canonical workflow/action/sequence identity.
- [ ] 4.2 Decide `artifactRefs` versus a distinct `filesEdited` field by auditing current artifact semantics; do not duplicate fields unnecessarily.
- [ ] 4.3 Implement/dogfood the existing OpenSpec receipt recorder using `WorkflowActionEventV1` rather than a second receipt schema.
- [ ] 4.4 Roll current `WorkflowActionEventV1.progress.fraction`, `etaMs`, and `confidence` into document-governance summary state.
- [ ] 4.5 Never synthesize ETA from checkbox counts; render `ETA unavailable` when no runtime ETA exists.
- [ ] 4.6 Add receipt/reference checksum to document-governance rollup so stale workflow progress can be detected.

## 5. Supersession, smoke, validation, and archive gates

- [ ] 5.1 Reuse useful discovery ideas from `git-diff-supersedes-reconcile-production.mjs` without making it the canonical document owner.
- [ ] 5.2 Build reference census using `rg` for old path, title, explicit topic IDs, and supersession identifiers.
- [ ] 5.3 Add replacement-coverage validation: superseded document must have at least one validated `supersededBy` target.
- [ ] 5.4 Add link smoke test for canonical and replacement documents.
- [ ] 5.5 Add contradiction validation against active `CLAUDE.md`, canonical OpenSpec specs, representation manifests, and current architecture contracts.
- [ ] 5.6 Add archive eligibility report with explicit blocked reasons.
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
- [ ] 9.2 Add deterministic rebuild/replay test for registry and master TOC checksums.
- [ ] 9.3 Add fixture proving a scoped `CLAUDE.md` is not treated as superseding its parent merely because it is newer.
- [ ] 9.4 Add fixture proving an unchecked OpenSpec task blocks implementation-complete/archive-ready status.
- [ ] 9.5 Add fixture proving an active reference blocks archive.
- [ ] 9.6 Add API/SSR tests for `/admin/atlas` governance data.
- [ ] 9.7 Run focused Svelte/Vitest checks and `npm run check` for touched admin surfaces.
- [ ] 9.8 Run `build-document-governance-index --dry-run`, `validate-document-governance-index`, and `build-master-toc --check` twice and require identical checksums.

## 10. First bounded apply

- [ ] 10.1 Generate the first complete registry and `docs/MASTER-TOC.md` without editing or moving original documents.
- [ ] 10.2 Review every `CONFLICT` and `SUPERSEDED_CANDIDATE`; do not bulk-resolve through model judgment.
- [ ] 10.3 Select at most five clearly superseded non-instruction docs for archive canary.
- [ ] 10.4 Run archive canary with explicit authorization, exact pre/post path checks, rollback-on-failure semantics where applicable, and no OpenSpec/CLAUDE moves.
- [ ] 10.5 Record the canary workflow receipt under this OpenSpec change.
