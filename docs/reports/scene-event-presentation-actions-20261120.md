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

## Follow-up on worktree base `2ac62dafe35`

The case builder saves its full plan under `proceduralPreviewDraft`, including pulse parameters. The reopen adapter previously retained the action type but defaulted its color, intensity and period during regeneration. It now preserves those values through edits. The stored revision still carries the event's source binding and review state separately from the visual behavior.

- Focused command: `npm exec vitest run src/lib/reconstruction/case-scene-plan-draft-v1.spec.ts src/lib/server/scene-document-revisions-v1.spec.ts src/lib/reconstruction/scene-runtime-three-v1.spec.ts src/lib/reconstruction/scene-revision-report-v1.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism`
- Exact result: `Test Files 4 passed (4)`, `Tests 39 passed (39)`.
- `npm run check:native` returned `COMPLETED 2183 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS`. From the repository root, `npx openspec validate crime-scene-reconstruction --strict` returned `Change 'crime-scene-reconstruction' is valid`.
- Rebuilding an edited draft preserved a nondefault pulse, and a zero period was rejected. The revision-owner test read back the exact JSON draft through a mocked transaction and retained checks for revoked event review and superseded analysis.
- Live staging proof remains open. The Playwright case ID, session state, base URL, and staging write opt-in were all absent from the current process environment.

## Source lane playback on worktree base `2ac62dafe35`

The case preview has a whole-lane play control alongside the selected-event loop. Whole-lane playback uses the selected source clock, passes through gaps, and stops at the final interval boundary. The timeline identifies all entries at the playhead using the same half-open intervals as the renderer.

- `npm exec vitest run src/lib/reconstruction/scene-runtime-three-v1.spec.ts src/lib/reconstruction/case-scene-plan-draft-v1.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism` returned `Test Files 2 passed (2)`, `Tests 16 passed (16)`. The renderer test checks simultaneous visibility and light pulsing, exact reverse seeking, and suppression on an unrelated clock at the same time.
- `npm run check:native` returned `COMPLETED 2183 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS` for the playback UI.
- `npm exec playwright test -- --config=playwright.set-the-scene.config.ts set-the-scene-workflow.spec.ts --workers=1 --reporter=list` returned `2 skipped`. The case ID, session state, base URL, and write opt-in were absent. The new browser assertions cover overlapping cues and the final playhead position when staging is configured.
- Scope: CREATED and WIRED. Signed-in browser playback and independent live persistence readback remain open.
## Timed prop rotation

Worktree base `2ac62dafe35`. The builder accepts a signed yaw angle on one or more registered primitive targets. The cue rotates around each prop's authored pivot and local vertical axis. The pure timeline evaluator uses source time within the half-open interval, so reverse seeking reproduces the same orientation. The renderer composes the result with the placement quaternion. Incompatible overlapping rotations leave the saved orientation and appear as a conflict. The object inspector also handles markers with no presentation action.

This is an illustrative prop action within the procedural scene plan. The generic saved cue schema, browser proof and live authorized save/reopen remain open.

`npm exec vitest run scene-runtime-three-v1.spec.ts case-scene-plan-draft-v1.spec.ts scene-object-inspector-v1.spec.ts scene-generation-plan-v1.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism` returned `Test Files 5 passed (5)`, `Tests 38 passed (38)`. Coverage includes simultaneous visibility, rewind, a different source clock, incompatible overlapping rotation, rejection of actor targets, and an out-of-bounds angle. After correcting the DOM input type, `npm run check:native` returned `COMPLETED 2185 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS`. Strict OpenSpec validation passed.
## Source-clock camera cues

Worktree base `2ac62dafe35`. A reviewer can attach a top-down, isometric or perspective preset to an existing event alongside its object action. The typed plan, generated recipe, reopened editor and JSON report carry the cue. The preview evaluates camera presets at the selected source-lane time using half-open intervals. Following is opt-in, and a gap, conflict, or override restores the manual view. Actor and prop playback continue on the same playhead. Camera presets are illustrative presentation choices.

`npm exec vitest run scene-camera-cue-v1.spec.ts case-scene-plan-draft-v1.spec.ts scene-revision-report-v1.spec.ts scene-runtime-three-v1.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism` returned `Test Files 4 passed (4)`, `Tests 25 passed (25)`. Coverage includes half-open boundaries, rewind, conflicting and identical presets, invalid preset rejection, and a rotation cue with a simultaneous camera preset that survives draft reconstruction and recipe compilation.

`npm exec playwright test -- --config=playwright.set-the-scene.config.ts parent-atlas-v2-character-runtime.spec.ts --grep 'synthetic camera cues' --workers=1 --reporter=list` returned `1 passed (6.0s)` after correcting a manual-override handler exposed by the initial run. The test checks a changed rendered canvas, cue overlap, reverse seeking, and manual override in the synthetic demo. It does not exercise case authorization or live revision persistence.

Final `npm run check:native` returned `COMPLETED 2185 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS`. Strict OpenSpec validation passed.
## Cited source captions

Worktree base `2ac62dafe35`. The selected approved video event can show transcript excerpts as the source clock is scrubbed. The existing video-events endpoint verifies case access, current evidence revision, current analysis, approved event and exact interval. It reads up to 64 canonical cited transcript segments and verifies each segment's stored transcript ID, index and time bounds. Corrected text comes from the current row. Rejected, missing or over-limit excerpts are counted as unavailable. Unreviewed excerpts are labeled separately from reviewed text. The scene retains source bindings and fetches the current excerpt at inspection time.

`npm exec vitest run load-scene-captions-v1.spec.ts scene-video-event-readback-v1.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism` returned `Test Files 2 passed (2)`, `Tests 12 passed (12)`. Tests with mocked storage cover corrected text, exact source intervals, revoked approval, stale analysis, and missing or rejected segments. The signed-in evidence-backed Playwright scenario can also exercise captions with `PW_SCENE_VERIFY_CAPTIONS=1` and an approved event with a current cited transcript excerpt. Whole-lane captions and audio playback remain open.

`npm run check:native` returned `COMPLETED 2185 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS`. Strict OpenSpec validation passed. `npm exec playwright test -- --config=playwright.set-the-scene.config.ts set-the-scene-workflow.spec.ts --grep 'preserves a reviewed video event' --workers=1 --reporter=list` returned `1 skipped` with authorized staging settings absent.
