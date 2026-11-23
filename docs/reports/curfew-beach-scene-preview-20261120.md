# Curfew Beach Scene Preview

## Outcome

Added a separate synthetic-only case workspace at `/demos/curfew-beach-scene`. It loads the typed curfew fixture through a read-only server loader, renders a procedural Three.js beach, shows four generic unlinked POI placeholders, lists the independently clocked reports, and drives the bonfire visibility only when a selected report targets that prop and its own clock/time interval is active. The 22:00 curfew is labeled unverified scenario context. Possible alcohol use remains an attributed report; the scene does not infer age, identity, or guilt.

No source media, live case IDs, evidence writes, scene revisions, or database writes are included. The visual scene is illustrative and uncalibrated.

## Verification

- Curfew fixture and temporal tests: 9/9 passed.
- Headless browser smoke: route returned HTTP 200; the scene canvas rendered at 793×620 with a WebGL context; selecting a report displayed its source-clock lane; no page errors were observed.
- `npm run check:native`: 2,178 files checked; zero diagnostics in the new curfew route and fixture. 21 diagnostics remain in four other files: `StorybookAuthorities.svelte`, `storybook-authorities/+server.ts`, `scene-reconstruction/plans/+server.ts`, and `scene-generation-plan-v1.ts`.
- Not run: a checked-in Playwright spec, live media readback, reviewer authorization, save/reopen, or independent database/object-store readback. The browser smoke was a direct headless Chromium run against the existing local dev server.

## OpenCode execution fields

- **likely_cause:** The synthetic curfew event fixture had no browser scene consumer to show clock-local events and their explicitly bound targets.
- **evidence:** `sveltekit-frontend/src/routes/(app)/demos/curfew-beach-scene/+page.svelte`; `+page.server.ts`; `sveltekit-frontend/src/lib/server/reconstruction/fixtures/curfew-beach-case-v1.ts`; 9 focused tests passed; headless Chromium loaded WebGL and selected a report without page errors; native Svelte check reports no diagnostics in the route or fixture.
- **patch_targets:** `sveltekit-frontend/src/routes/(app)/demos/curfew-beach-scene/+page.svelte`; `+page.server.ts`; `sveltekit-frontend/src/lib/server/reconstruction/fixtures/curfew-beach-case-v1.ts`; `sveltekit-frontend/src/lib/splat/scene-environment-cell-three-v1.ts`; `sveltekit-frontend/src/lib/splat/scene-scale-temporal-v1.spec.ts`; `openspec/changes/crime-scene-reconstruction/tasks.md`.
- **safe_next_command:** `npm run check:native` from `sveltekit-frontend`.
- **smoke_command:** `npm run test -- --run src/lib/server/reconstruction/fixtures/curfew-beach-case-v1.spec.ts src/lib/splat/scene-scale-temporal-v1.spec.ts` from `sveltekit-frontend`.
- **report_path:** `docs/reports/curfew-beach-scene-preview-20261120.md`.
