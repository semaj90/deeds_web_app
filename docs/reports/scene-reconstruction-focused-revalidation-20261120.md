# Scene Reconstruction Focused Revalidation

Date: 2026-11-20

## Scope

Revalidated the existing source-video scrub adapter, Three.js source-clock event behavior, and the candidate scene-generation job key/transition contract. The pass found and fixed one pure-contract edge case: a queued job could transition to `running` after its attempt budget was exhausted. No database state was changed.

## Result

Command:

```powershell
npm test -- --run src/lib/components/reconstruction/SceneSourceVideo.spec.ts src/lib/reconstruction/scene-runtime-three-v1.spec.ts src/lib/server/reconstruction/scene-generation-job-keys-v1.spec.ts
```

Result: 3 test files passed, 12 tests passed.

- The video adapter applies the newest seek and ignores stale frame callbacks after teardown.
- The scene runtime applies visibility and movement only on the matching source clock.
- The candidate job contract distinguishes evidence-free blockouts from evidence-backed requests and produces deterministic revision-bound keys.
- The transition helper now rejects a new run at `attemptCount >= maxAttempts`; the focused job-key/transition suite passed again after the fix (1 file / 4 tests).

## Still unproven

- Signed-in browser presentation and interaction against authorized evidence routes.
- Nearby thumbnail/proxy behavior during rapid scrubbing and residency-priority behavior.
- Durable job admission/status reads: the `scene_generation_jobs` schema remains a candidate and is not admitted or applied.
- Authorized PostgreSQL/SeaweedFS scene save, independent readback, and fresh-browser reopen.
- Cross-case denial and stale review/source rejection in a signed-in browser round trip.

`npm run test:run` is not present in this checkout's package scripts; `npm test -- --run ...` is the supported focused invocation. No live-service requests or writes were made.

## Native Svelte check

`npm run check:native` completed with 2181 files, 11 errors, and 1 warning. All 11 errors remain in the pre-existing Storybook Authorities component/API route; the warning remains in the curfew-beach demo's non-reactive canvas binding. No diagnostic points to the changed scene-generation job contract or its test. This check is not green and does not prove browser or persistence behavior.
