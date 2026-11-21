# Scene Cue Conflict Handling Progress

Date: 2026-11-20
OpenSpec: `crime-scene-reconstruction` / `CASE-SCENE-LIVE-01-overlapping-cue-conflicts`

## Change

The source-clock evaluator now detects simultaneous, incompatible visibility or movement actions that target the same scene object on the same clock. It preserves the object's baseline state while conflicting cues overlap, instead of letting event array order choose a result. Conflicting movement cues also do not start actor motion. Active and conflict event IDs are sorted for deterministic output. The scene object inspector reports possible overlapping cue conflicts, including both event IDs and their clock lane. An opt-in synthetic route fixture (`?conflict-fixture=1`) now renders two competing movement proposals for the same actor and lets the browser test select that actor to inspect the warning.

## Verification

- Focused Vitest suites (`character-behavior-haircard-v1`, `scene-scale-temporal-v1`, `scene-object-inspector-v1`, `scene-runtime-three-v1`): 24/24 passed. The character helper now uses browser-compatible Web Crypto for its asynchronous dedupe checksum and DataView for its matrix hex codec; this removed the Node-only crypto/Buffer dependency that previously caused the browser route to return 500.
- Chromium/WebGL2 Playwright: the full focused character-runtime file passes 3/3. The conflict fixture visibly loads, selects `ACTOR-01`, and verifies both event IDs, the `camera:3333...` clock lane, and unchanged baseline playback.
- `npm run check:native`: 2183 files, 0 errors, 0 warnings. The curfew demo canvas reference now uses Svelte state and the mounted canvas is captured before initialization.
- `openspec validate crime-scene-reconstruction --strict`: passed. Scoped `git diff --check`: passed with the repository's LF-to-CRLF warning for `tasks.md`.
- Docker Desktop was unavailable; no container, live PostgreSQL, SeaweedFS, or persistence write/readback checks were attempted.

## Remaining proof

Signed-in source review/dispute behavior and durable save/reopen remain unproven. The synthetic fixture is not authorization or persistence proof. No database or object-store writes were performed.

## Patch targets

- `sveltekit-frontend/src/lib/splat/scene-event-visibility-v1.ts`
- `sveltekit-frontend/src/lib/splat/scene-scale-temporal-v1.spec.ts`
- `sveltekit-frontend/src/lib/reconstruction/scene-object-inspector-v1.ts`
- `sveltekit-frontend/src/lib/reconstruction/scene-object-inspector-v1.spec.ts`
- `sveltekit-frontend/src/lib/reconstruction/scene-runtime-three-v1.ts`
- `sveltekit-frontend/src/lib/reconstruction/scene-runtime-three-v1.spec.ts`
- `sveltekit-frontend/src/lib/components/reconstruction/SceneRuntimeRecipeCanvas.svelte`
- `sveltekit-frontend/src/lib/characters/character-behavior-haircard-v1.ts`
- `sveltekit-frontend/src/lib/characters/character-behavior-haircard-v1.spec.ts`
- `sveltekit-frontend/src/routes/(app)/demos/curfew-beach-scene/+page.server.ts`
- `sveltekit-frontend/src/routes/(app)/demos/curfew-beach-scene/+page.svelte`
- `sveltekit-frontend/tests/e2e/parent-atlas-v2-character-runtime.spec.ts`
- `openspec/changes/crime-scene-reconstruction/tasks.md`
