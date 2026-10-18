# Tasks: Svelte 5 Accessibility and Style Warning Batch Remediation

Status vocabulary: `CREATED`, `WIRED`, `DRY_RUN_PROVEN`, `APPLY_PROVEN`, `NOT_PROVEN`.
Offline Diagnostic Report: `docs/reports/svelte-check-all-warnings-errors-2026-10-13.txt` (291 warnings across 100 files).

## 1. Inventory & Baseline Verification

- [x] TSK-A11Y-01 Export complete diagnostic inventory of 291 warnings across 100 files to `docs/reports/svelte-check-all-warnings-errors-2026-10-13.txt`. Status: APPLY_PROVEN.
- [x] TSK-A11Y-02 Categorize warnings by rule family: 121 label associations, 58 dead CSS selectors, 48 key events, 34 static element interactions, 20 explicit button labels, 9 interactive focus, 1 role mismatch. Status: APPLY_PROVEN.

## 2. Phase 1: Form Label Control Associations (`a11y_label_has_associated_control`, 121 items)

- [x] TSK-A11Y-03 Batch-remediate developer demo routes: `src/routes/(dev)/rune-reactivity/+page.svelte`, `src/routes/(dev)/odin/+page.svelte`, and `src/routes/(dev)/demo/bits-ui/+page.svelte`. Status: APPLY_PROVEN.
- [x] TSK-A11Y-04 Batch-remediate admin and settings UI pages: `src/routes/(app)/settings/**` and `src/routes/(app)/admin/**`. Status: APPLY_PROVEN (2026-10-14 svelte-check run: 0 warnings under these paths; fixed label/control pairs in `admin/search-intelligence`, `admin/error-brain`, `admin/face-gallery`, `admin/knowledge-base`, `admin/atlas`).
- [x] TSK-A11Y-05 Batch-remediate case management and legal tools: `src/routes/(app)/cases/**` and `src/routes/(app)/evidence/**`. Status: APPLY_PROVEN (2026-10-14 svelte-check run: 0 warnings under these paths; `cases/[id]/board` labels, keyboard handlers, dead selectors; `EvidenceRecall.svelte` role fix).

## 3. Phase 2: Unused CSS Selectors (`css_unused_selector`, 58 items)

- [x] TSK-A11Y-06 Clean up unused selectors in `src/routes/(app)/reports/+page.svelte`, `src/routes/(app)/library/+page.svelte`, and related report cards. Status: APPLY_PROVEN.
- [x] TSK-A11Y-07 Clean up orphaned selectors in agentic and chat components (`src/lib/components/agentic/**`, `src/lib/components/chat/**`). Status: APPLY_PROVEN (2026-10-14 svelte-check run: 0 warnings under these paths; none were present at baseline).
- [x] TSK-A11Y-08 Clean up orphaned selectors across remaining app layout and navigation components. Status: APPLY_PROVEN (2026-10-14 svelte-check run: 0 warnings under `components/layout/**` and `components/navigation/**`).

## 4. Phase 3: Interactive Elements & Keyboard Listeners (82 items)

- [x] TSK-A11Y-09 Add `role="button"`, `tabindex="0"`, and `onkeydown` handlers (or convert to `<button type="button">`) on clickable overlay backdrops in modal dialogs (`src/routes/(app)/persons-of-interest/[id]/+page.svelte`, `src/routes/(app)/cases/+page.svelte`, `src/routes/(app)/active-cases/+page.svelte`, etc.). Status: APPLY_PROVEN.
- [x] TSK-A11Y-10 Add keyboard event handlers (`Enter` / `Space`) to custom cards and interactive list rows across case boards and knowledge feeds. Status: APPLY_PROVEN (2026-10-14 svelte-check: 0 click/keyboard warnings under `cases/[id]/board` and the knowledge routes; fixed evidence cards, table rows, admin atlas nodes).

## 5. Phase 4: Explicit Button Labels & Focus (29 items)

- [x] TSK-A11Y-11 Add `aria-label` to toggle switch buttons (e.g., `src/routes/(app)/recommendations/+page.svelte` GPU rerank toggle, `src/routes/(app)/admin/library/+page.svelte` official source toggle). Status: APPLY_PROVEN.
- [x] TSK-A11Y-12 Add `aria-label` to icon-only modal close buttons, search triggers, and audio controls. Status: APPLY_PROVEN (2026-10-14 svelte-check: 0 `a11y_consider_explicit_label` warnings left; 16 icon-only and swatch buttons labelled; audio mic toggles already labelled).

## 6. Phase 5: Role Corrections & Final Audit

- [x] TSK-A11Y-13 Correct non-interactive role on interactive element (`a11y_no_interactive_element_to_noninteractive_role`, 1 item). Status: APPLY_PROVEN (`EvidenceRecall.svelte`: removed `role="listitem"` from a `<button>`; rule absent in 2026-10-14 run).
- [ ] TSK-A11Y-14 Execute full validation gate `npm run check` to prove 0 errors and 0 warnings. Not met (2026-10-14): 0 errors, 197 warnings remain repo-wide (was 215; 291 in the original report).
- [ ] TSK-A11Y-15 Execute test suite `npm run test:run` to verify zero functional regressions. Not met (2026-10-14): no `test:run` script exists (`npx vitest run` used instead); the full run crashed mid-suite (`ERR_IPC_CHANNEL_CLOSED` in the tinypool worker pool) with no summary. Targeted run: 2 files / 4 tests passed (`knowledge-base`, `atlas-admin-page-loader`). Serial run (one file at a time, cache file excluded) also crashed with `ERR_IPC_CHANNEL_CLOSED` after `tests/errors-feedback-fictional-routes.spec.ts`; that file alone: 8 failed, 40 passed (pre-existing, file not changed by this work). Blocked until the crash source and those failures are resolved.
## Resume here — 2026-10-15

- Committed and pushed: ee756a3bcd (TSK-04, 05, 07, 08, 10, 12, 13 evidence; svelte-check 215 -> 181 warnings, 0 errors).
- Open: TSK-14 (repo-wide svelte-check warnings, 181 left; deferred by request).
- Open: TSK-15 (test gate). Full-suite run crashes with ERR_IPC_CHANNEL_CLOSED after tests/errors-feedback-fictional-routes.spec.ts; that file alone has 8 failing tests. Shard runs (4 shards, cache file excluded) completed without crash: 425 failing tests across 112 files in total before the spec-contract fixes.
- Next: triage the 8 failures in errors-feedback-fictional-routes.spec.ts, then rerun shards to confirm the crash source.

## SVELTE-A11Y-EVIDENCE-01 — source-grounded repair fixture (2026-10-17)

- [ ] **SVELTE-A11Y-EVIDENCE-01** Build a bounded, read-only local evidence fixture from the official Svelte accessibility documentation for one explicitly selected accessibility rule. Preserve the official URL, retrieved-document checksum, retrieval time, and documentation version when available; mark this material as reference evidence, not canonical source authority.
- [ ] Bind the fixture to one exact Svelte source revision and the compiler warning/rule evidence. Keep deterministic compiler/AST observations authoritative; documentation and any model-generated summary remain advisory.
- [ ] Compile the proposed patch with the repository's Svelte compiler/checker and require the targeted warning to be absent without introducing new errors or warnings in the changed file. Record before/after diagnostics, patch checksum, checker version, and outcome in a deterministic receipt.
- [ ] Validate citation grounding against the local fixture and require abstention when the rule, cited passage, source revision, or checker result cannot be resolved. Do not fetch into `atlas_external_doc_pages`, write PostgreSQL/Valkey/Qdrant/Neo4j, publish a task, or promote a repair as part of this gate.
- [ ] Run focused fixture and compiler tests, then record exact commands, denominators, checksums, changed files, and residual risks. This gate is independent of full domain-taxonomy coverage.

Status: **OPEN / LOCAL FIXTURE ONLY**. This is a proposed proof gate; no official documentation acquisition, Svelte repair, or live model execution is claimed here.
