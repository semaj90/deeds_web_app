# Scene Event Cue Development Panel

## Outcome

Extended the development-only `Scene Cue Lab` in the existing Morrow Bay fictional scene preview. It now supports registered actor targets as well as props, can preview deterministic actor movement by absolute source time, and keeps actor and beach-prop clock/time controls separate. Props are hidden unless their event target reference matches the rendered object. A cue on one source clock cannot affect a target while another unaligned clock is selected. Overnight times are represented as monotonic source milliseconds (for example, 23:00 to 02:00 is 23 hours to 26 hours), without silently wrapping or synchronizing another source.

The component is rendered only when Vite `import.meta.env.DEV` is true. The prop cue remains an unrelated synthetic beach demonstration. The actor cue targets only a visual handle in the synthetic bank fixture and is not a factual motion finding. Neither panel writes data, approves evidence, synchronizes clocks, or creates canonical event bindings. A separate fictional curfew/beach fixture is tracked in OpenSpec so it cannot be mixed with the bank case; legal curfew context, witness reports, and POI appearances must remain distinct and source-qualified.

## Verification

- `src/lib/splat/scene-scale-temporal-v1.spec.ts`: 6/6 passed, including explicit actor movement, target binding, invalid paths, clock isolation, interval edges, and overnight reported-event timing.
- `npm run check:native`: completed across 2,176 files; 21 diagnostics remain in four other files (StorybookAuthorities.svelte, storybook-authorities route, scene-reconstruction plans route, and scene-generation-plan-v1.ts); zero diagnostics in files changed for this update.
- The 4-file plan/recipe/resolver/parameter suite from the prior slice passed 21/21.
- Not run: Playwright, live case authorization, PostgreSQL/SeaweedFS save/reopen, or production case event rendering.
- `git diff --check` and strict OpenSpec validation are run separately after this report is written.

## Status

- **Created:** target-aware, source-clock-bound development cue controls and pure timeline projection for visibility and actor movement; overnight intervals stay monotonic.
- **Wired:** panel to the existing synthetic Three.js environment-cell builder in the Morrow Bay dev preview.
- **Proven:** focused temporal tests and the full native Svelte check, with no diagnostics in changed files. Browser rendering and persistence remain unproven.
- **Done:** dev preview slice only. The case-bound timeline/event runtime, actor animation, persistence, and fresh-browser replay remain open.

## OpenCode execution fields

- **likely_cause:** The preview coupled a timed event to a single hard-coded prop, so event targets and actor motion were not generalized.
- **evidence:** `SceneEventCueDevPanel.svelte`, `scene-event-visibility-v1.ts`, `scene-environment-cell-three-v1.ts`; focused temporal test suite passed 6/6; `npm run check:native` reported 21 diagnostics in four other files and none in touched files.
- **patch_targets:** `sveltekit-frontend/src/lib/components/scene/SceneEventCueDevPanel.svelte`; `sveltekit-frontend/src/routes/(app)/demos/morrow-bay-case-scene-e2e-01b/+page.svelte`; `sveltekit-frontend/src/lib/splat/scene-environment-cell-three-v1.ts`; `sveltekit-frontend/src/lib/splat/scene-event-visibility-v1.ts`; `sveltekit-frontend/src/lib/splat/scene-scale-temporal-v1.spec.ts`; `openspec/changes/crime-scene-reconstruction/tasks.md`.
- **safe_next_command:** `npm run check:native` from `sveltekit-frontend` to confirm the current diagnostic set before further UI work.
- **smoke_command:** `npm run test -- --run src/lib/splat/scene-scale-temporal-v1.spec.ts` from `sveltekit-frontend`; it does not replace browser interaction testing.
- **report_path:** `docs/reports/scene-event-cue-dev-panel-20261120.md`.
