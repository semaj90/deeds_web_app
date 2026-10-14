# Tasks: Svelte 5 Accessibility and Style Warning Batch Remediation

Status vocabulary: `CREATED`, `WIRED`, `DRY_RUN_PROVEN`, `APPLY_PROVEN`, `NOT_PROVEN`.
Offline Diagnostic Report: `docs/reports/svelte-check-all-warnings-errors-2026-10-13.txt` (291 warnings across 100 files).

## 1. Inventory & Baseline Verification

- [x] TSK-A11Y-01 Export complete diagnostic inventory of 291 warnings across 100 files to `docs/reports/svelte-check-all-warnings-errors-2026-10-13.txt`. Status: APPLY_PROVEN.
- [x] TSK-A11Y-02 Categorize warnings by rule family: 121 label associations, 58 dead CSS selectors, 48 key events, 34 static element interactions, 20 explicit button labels, 9 interactive focus, 1 role mismatch. Status: APPLY_PROVEN.

## 2. Phase 1: Form Label Control Associations (`a11y_label_has_associated_control`, 121 items)

- [x] TSK-A11Y-03 Batch-remediate developer demo routes: `src/routes/(dev)/rune-reactivity/+page.svelte`, `src/routes/(dev)/odin/+page.svelte`, and `src/routes/(dev)/demo/bits-ui/+page.svelte`. Status: APPLY_PROVEN.
- [ ] TSK-A11Y-04 Batch-remediate admin and settings UI pages: `src/routes/(app)/settings/**` and `src/routes/(app)/admin/**`.
- [ ] TSK-A11Y-05 Batch-remediate case management and legal tools: `src/routes/(app)/cases/**` and `src/routes/(app)/evidence/**`.

## 3. Phase 2: Unused CSS Selectors (`css_unused_selector`, 58 items)

- [x] TSK-A11Y-06 Clean up unused selectors in `src/routes/(app)/reports/+page.svelte`, `src/routes/(app)/library/+page.svelte`, and related report cards. Status: APPLY_PROVEN.
- [ ] TSK-A11Y-07 Clean up orphaned selectors in agentic and chat components (`src/lib/components/agentic/**`, `src/lib/components/chat/**`).
- [ ] TSK-A11Y-08 Clean up orphaned selectors across remaining app layout and navigation components.

## 4. Phase 3: Interactive Elements & Keyboard Listeners (82 items)

- [x] TSK-A11Y-09 Add `role="button"`, `tabindex="0"`, and `onkeydown` handlers (or convert to `<button type="button">`) on clickable overlay backdrops in modal dialogs (`src/routes/(app)/persons-of-interest/[id]/+page.svelte`, `src/routes/(app)/cases/+page.svelte`, `src/routes/(app)/active-cases/+page.svelte`, etc.). Status: APPLY_PROVEN.
- [ ] TSK-A11Y-10 Add keyboard event handlers (`Enter` / `Space`) to custom cards and interactive list rows across case boards and knowledge feeds.

## 5. Phase 4: Explicit Button Labels & Focus (29 items)

- [x] TSK-A11Y-11 Add `aria-label` to toggle switch buttons (e.g., `src/routes/(app)/recommendations/+page.svelte` GPU rerank toggle, `src/routes/(app)/admin/library/+page.svelte` official source toggle). Status: APPLY_PROVEN.
- [ ] TSK-A11Y-12 Add `aria-label` to icon-only modal close buttons, search triggers, and audio controls.

## 6. Phase 5: Role Corrections & Final Audit

- [ ] TSK-A11Y-13 Correct non-interactive role on interactive element (`a11y_no_interactive_element_to_noninteractive_role`, 1 item).
- [ ] TSK-A11Y-14 Execute full validation gate `npm run check` to prove 0 errors and 0 warnings.
- [ ] TSK-A11Y-15 Execute test suite `npm run test:run` to verify zero functional regressions.
