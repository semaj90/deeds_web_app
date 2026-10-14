# Proposal: Svelte 5 Accessibility and Style Warning Batch Remediation

## Why

The SvelteKit frontend compiler (`svelte-check`) currently reports **0 errors** and **291 warnings** across 100 component and page files.
While non-blocking for compilation, these accessibility (`a11y`) and stylesheet warnings degrade developer velocity when running full audits and introduce accessibility regressions in production UI routes.
All 291 warnings have been captured into an offline ledger (`docs/reports/svelte-check-all-warnings-errors-2026-10-13.txt`) so that systematic batch remediation can proceed without waiting for iterative compiler rebuild latency.

## What Changes

1. **Phase 1: Form Label Control Association (`a11y_label_has_associated_control`, 121 occurrences)**:
   - Associate `<label>` elements with their target controls using explicit `for="id"` and matching `id` attributes, or wrap controls directly inside `<label>`.
2. **Phase 2: Dead CSS Selector Cleanup (`css_unused_selector`, 58 occurrences)**:
   - Clean up obsolete, orphaned styles in component `<style>` blocks that no longer match rendered markup.
3. **Phase 3: Interactive Static Elements & Keyboard Event Listeners (`a11y_click_events_have_key_events` [48], `a11y_no_static_element_interactions` [34])**:
   - Replace static `<div>`/`<span>` click handlers with semantic `<button type="button">`, or provide appropriate ARIA roles (`role="button"`) and keyboard listeners (`onkeydown={(e) => ...}`).
4. **Phase 4: Explicit Button & Control Labels (`a11y_consider_explicit_label` [20], `a11y_interactive_supports_focus` [9])**:
   - Add explicit `aria-label` attributes to icon-only toggle buttons, close buttons, and tab controls.
5. **Phase 5: ARIA Role Corrections (`a11y_no_interactive_element_to_noninteractive_role`, 1 occurrence)**:
   - Ensure interactive HTML elements do not carry non-interactive ARIA roles.

## Non-goals

- Do not alter business logic, state runes (`$state`, `$derived`, `$props`), or component API contracts.
- Do not introduce breaking layout shifts or styling regressions.
- Do not touch backend, database, Qdrant, or retrieval code.

## Success Criteria

- `npx svelte-check --threshold warning` achieves 0 errors and 0 warnings.
- All existing Vitest and Playwright test suites continue to pass cleanly.
