# CASE-SCENE-E2E-01C — East Quay typed scene bridge

Date: 2026-11-19  
Workspace: `C:\Users\james\Videos\deeds-web-app`  
Git revision at start: `b283b7436c1ecc5d8a380784a8ec974b64f6c7ab` (worktree already dirty)

## Outcome

The read-only synthetic East Quay slice is now typed and browser-rendered. The staging persistence portion of CASE-SCENE-E2E-01C remains incomplete; no task is marked complete.

## Audit findings

- The downloaded East Quay data contains eight scenes, eight people, eleven events, nine synthetic evidence synopses, five transcripts, and eight synthetic SVG portraits. It has no canonical database IDs.
- The three copied JavaScript helpers used `.mjs` modules and declaration shims. The portrait helper accepted caller-supplied `authorized` and `sourceApproved` booleans and required a `joints.get()` actor API.
- `CrimeSceneViewer3D.svelte` owns a separate static detective actor and an unrelated GLB guide/animation loader. Its in-file crouched actor is not the downloaded synthetic GLB and does not expose the portrait helper interface.
- `ScenePrimitiveManager` accepts caller-owned Three.js objects and records their transforms; it does not construct or attach objects. The new adapter therefore builds the render objects and registers them with this existing manager.
- `scene_assets` and immutable `scene_document_revisions` already have server owners. Asset routes require UUID identifiers, case authorization, and `SCENE_PERSISTENCE_ENABLED`; the environment parser defaults that gate to `false`. No Drizzle table or persistence bypass was added.

## Changes

- Replaced `case-registry.mjs`, `scene-bridge.mjs`, `poi-portrait-three.mjs` and their `.d.mts` shims with typed TypeScript registry, event planner, portrait presentation and scene-adapter modules.
- Added Zod validation for the fixed synthetic case, eight-scene minimum, synthetic-only portrait metadata, no-media evidence synopses, source clock timestamps, and local references. Runtime fixture admission is fixed to `PA-DEMO-ROBBERY-001`, a known scene, and `READ`; `WRITE` throws `DEMO_FIXTURE_WRITE_FORBIDDEN`.
- Added stable actor IDs derived from fixture/case/scene/event/person IDs. The selected event plan is `DEMO_ONLY` and `readOnly`.
- Added a Three.js synthetic viewer on `scene-intent-2d`. It loads the existing static sample GLB, registers one actor and event marker with `ScenePrimitiveManager`, displays the selected event's source-linked evidence synopsis, and switches the actor/event binding when the event changes.
- The head adapter prefers named rig bones. When the static GLB has no head joint, it derives a presentation anchor from mesh bounds and attaches a visibly labeled portrait card. Portrait URLs must exactly match the fixture allowlist; the renderer accepts no authorization or review booleans.
- The server page loader validates the fixed fixture and verifies every referenced synthetic portrait against its SHA-256 before returning the fixture. Existing asset/revision routes continue to reject non-UUID fixture identifiers and enforce case access.
- Updated `openspec/changes/crime-scene-reconstruction/tasks.md`. CASE-SCENE-E2E-01, 01B and 01C are partial (`[~]`); none are complete.

## Verification

- Focused Vitest:
  - `npm exec vitest run src/lib/scene/procedural/parent-atlas-east-quay-case-v1/case-registry-v1.spec.ts 'src/routes/api/cases/[id]/scenes/[sceneId]/assets/assets.route.spec.ts'`
  - **2 files passed, 10 tests passed.** Includes fixture admission/read-only enforcement, eight-scene mapping, deterministic IDs, scene-manager registration, event/evidence/revision binding, fixture write rejection, and unauthorized cross-case write rejection.
- Focused Chromium Playwright:
  - `npm exec playwright test tests/east-quay-scene-demo.spec.ts --config=playwright.config.ts`
  - **3 tests passed.** Confirmed static GLB response and render, derived head-anchor portrait-card fallback, evidence synopsis, event selection, fixture-write rejection, and anonymous cross-case write rejection.
  - The repository Playwright global setup created three `[PW-TEST]` cases; global teardown archived all three. They are not East Quay fixture rows.
- Native Svelte check:
  - `npm run check:native`
  - **2,172 files, 11 errors, 0 warnings, 2 files with diagnostics.** This matches the prior baseline set: nine `$state`/typing diagnostics in `src/lib/components/evidence/StorybookAuthorities.svelte` (lines 19–27), plus two `unknown` property diagnostics in `src/routes/api/cases/[id]/storybook-authorities/+server.ts` (line 72). The prior count was 2,171 files with the same 11 errors and zero warnings; no new diagnostic appeared in this integration.
- Persistence was not attempted. The staging route's existing gate defaults to disabled, and no authorized staging write was used. No East Quay evidence, scene asset, or scene revision rows were created. SeaweedFS/PostgreSQL byte/hash and revision readback remain unverified.

## OpenSpec status

- `CASE-SCENE-E2E-01`: `[~]` — read-only synthetic integration advanced; canonical case admission and full end-to-end workflow remain open.
- `CASE-SCENE-E2E-01B`: `[~]` — Morrow Bay fixture/browser reload remains separate and incomplete.
- `CASE-SCENE-E2E-01C`: `[~]` — typed demo bridge and browser behavior are proven; authorized staging persistence/readback and fresh-browser reopen remain outstanding.

## Structured handoff

- **likely_cause:** The East Quay demo stopped at listing fixture actors because its helpers were JavaScript-only and its portrait contract did not match the app's existing Three.js objects.
- **evidence:** `case-registry-v1.ts`, `scene-bridge-v1.ts`, `scene-adapter-v1.ts`, `poi-portrait-three-v1.ts`, `EastQuaySceneCanvas.svelte`, focused Vitest and Playwright results above, and the native checker baseline comparison.
- **patch_targets:** `openspec/changes/crime-scene-reconstruction/tasks.md`; `sveltekit-frontend/src/lib/scene/procedural/parent-atlas-east-quay-case-v1/`; `sveltekit-frontend/src/routes/(app)/demos/scene-intent-2d/`; `sveltekit-frontend/src/routes/api/cases/[id]/scenes/[sceneId]/assets/assets.route.spec.ts`; `sveltekit-frontend/tests/east-quay-scene-demo.spec.ts`.
- **safe_next_command:** `npm exec vitest run src/lib/scene/procedural/parent-atlas-east-quay-case-v1/case-registry-v1.spec.ts 'src/routes/api/cases/[id]/scenes/[sceneId]/assets/assets.route.spec.ts'`
- **smoke_command:** `npm exec playwright test tests/east-quay-scene-demo.spec.ts --config=playwright.config.ts`
- **report_path:** `docs/reports/case-scene-e2e-01c-east-quay-scene-bridge-20261119.md`
