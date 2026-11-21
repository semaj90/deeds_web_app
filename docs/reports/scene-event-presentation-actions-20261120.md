# Scene Event Presentation Actions — 2026-11-20

## Scope

Added a bounded, deterministic `pulse_light_during_interval` presentation action to the existing typed scene-generation/runtime path. This is a preview behavior on an explicitly selected source-clock lane. It does not create a factual event, infer actor identity, or authorize persistence.

The Three.js runtime binds each pulse to its registered target, evaluates intensity from absolute source time, hides/resets it outside the cue interval, and disposes the derived light with the runtime. The case-plan editor can author the preview proposal. The read-only object inspector now handles pulse actions without interpreting their parameters as movement endpoints.

## Verification

- Focused command: `npm exec vitest run src/lib/reconstruction/scene-object-inspector-v1.spec.ts src/lib/reconstruction/scene-runtime-three-v1.spec.ts src/lib/server/reconstruction/scene-generation-plan-v1.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism`
- Exact result: `Test Files 3 passed (3)`, `Tests 22 passed (22)`.
- Native command: `npm run check:native`
- Exact result: `COMPLETED 2183 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS`.
- `git diff --check` passed for the files in this slice.

## Limits and next work

- The pulse action is not yet part of the saved `SceneTimelineCueV1` schema, so this does not prove save/reopen of the action.
- No signed-in browser test, live PostgreSQL/SeaweedFS readback, or authorized write-route test was run. Docker Desktop was reported unavailable; persistence gates were not changed.
- Continue `CASE-SCENE-E2E-02c-3` by extending the existing revision contract with target-specific actions under server-side source/revision checks, then prove exact seek and fresh reopen in an authorized browser session.
- Multi-track camera, animation, effects/audio, and cited dialogue remain planned in the OpenSpec ledger. GOAP simulation stays a separate optional track and must never promote its output into case events.

## Changed files

- `sveltekit-frontend/src/lib/reconstruction/scene-generation-plan-v1.ts`
- `sveltekit-frontend/src/lib/reconstruction/scene-runtime-recipe-v1.ts`
- `sveltekit-frontend/src/lib/reconstruction/case-scene-plan-draft-v1.ts`
- `sveltekit-frontend/src/lib/reconstruction/scene-runtime-three-v1.ts`
- `sveltekit-frontend/src/lib/reconstruction/scene-runtime-three-v1.spec.ts`
- `sveltekit-frontend/src/lib/reconstruction/scene-object-inspector-v1.ts`
- `sveltekit-frontend/src/lib/reconstruction/scene-object-inspector-v1.spec.ts`
- `sveltekit-frontend/src/lib/splat/scene-event-visibility-v1.ts`
- `sveltekit-frontend/src/lib/components/reconstruction/CaseScenePlanBuilder.svelte`
- `openspec/changes/crime-scene-reconstruction/tasks.md`
