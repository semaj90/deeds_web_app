# Case scene builder preview — 2026-11-20

## Status

Implemented a first case-bound, read-only scene-planning and preview slice on the existing crime-scene page. The page's existing authorized server load supplies the current case intake and case-scoped evidence list. On user submission, the browser calls the existing case-authorized parameter endpoint, builds a typed candidate, calls the existing canonical plan resolver, then renders only the returned plan through the Three.js runtime consumer.

This is not durable scene creation. The parameter and plan endpoints remain read-only. The preview does not create a scene revision, queue an analysis job, write an asset, or establish a fresh-page readback. It is not yet browser-verified against an authorized signed-in case.

## User-facing slice

- Explicit **Build blockout first** and **Add evidence first** choices reorder the authoring stages. Both use the same case workspace and plan contract.
- Choose a procedural urban, beach, or indoor environment.
- Select evidence already available to the authorized case.
- Add pseudonymous actors, registered primitive props, and event proposals with a target, one source, a source-local interval, and uncertainty.
- Event behavior can show a prop during its interval or move a selected actor/prop along an illustrative path. Events remain hypotheses and review-pending.
- The client uses same-origin POSTs with no-store semantics and relies on the server's case access, source membership/hash, and expected scene revision checks. Client review/authorization booleans are not part of the builder's request.
- The viewer initializes Three.js only after mount, uses one canvas with orbit controls, and exposes source-clock lane selection, event selection, playback and scrubbing. It labels the output illustrative and uncalibrated.
- Case intake WHY/HOW remains unknown in the generated candidate. The user-entered intake is displayed as unverified context, not treated as accepted scene facts.

## Curfew/beach distinction

The curfew fixture remains a separate fictional demo and is not silently inserted into unrelated cases. A future case can author separate evidence-backed event proposals for the stated 22:00 curfew context, reports of people at a bonfire from approximately 23:00–02:00, and reports of possible underage drinking. The local time statements do not prove a curfew violation, participant identity, age, or offense. If source timestamps are only wall-clock statements, preserve their wording and keep clocks unaligned; do not convert them into media offsets without reviewed alignment. Actor handles remain unlinked unless the reviewer links them through an authorized owner.

## Implementation files

- `sveltekit-frontend/src/lib/reconstruction/case-scene-plan-draft-v1.ts` — strict response parsing and source-bound, hypothesis-only candidate compilation.
- `sveltekit-frontend/src/lib/reconstruction/case-scene-plan-draft-v1.spec.ts` — verifies timed-prop binding and fail-closed missing hashes.
- `sveltekit-frontend/src/lib/components/reconstruction/CaseScenePlanBuilder.svelte` — case-scoped user controls and endpoint orchestration.
- `sveltekit-frontend/src/lib/components/reconstruction/SceneRuntimeRecipeCanvas.svelte` — browser-only scene runtime, source-lane timeline, event selection and playback.
- `sveltekit-frontend/src/routes/(app)/cases/[id]/crime-scene/+page.svelte` — places the explicit builder inside the case scene page.
- `openspec/changes/crime-scene-reconstruction/tasks.md` — records this as partial and lists remaining proof gates.

## Validation

- Focused plan/parameter/resolver/runtime Vitest set: **27/27 passed** in one worker.
- `npm run check:native`: **2,179 files checked; 11 errors, 0 warnings**. All 11 errors are in pre-existing `StorybookAuthorities.svelte` and `storybook-authorities/+server.ts`; the changed/new builder, canvas, plan helper, and route have zero diagnostics.
- `openspec validate crime-scene-reconstruction --strict`: passed.
- `git diff --check`: reports trailing whitespace in an unrelated generated file `simd-bridge/cpp/build-x64-cuda/CMakeFiles/CMakeConfigureLog.yaml`; no cleanup was performed. The command also printed existing line-ending notices.
- No Playwright run, signed-in case browser flow, live PostgreSQL/SeaweedFS write, independent readback, or save/reopen proof was performed.

## Remaining work

1. Browser-verify the case builder with authentication, including preview, event target binding, clock-lane isolation, play/pause/scrub, and teardown.
2. Add a clear source-time basis control for media elapsed time versus reported wall-clock time and preserve that distinction in cue revisions. Require monotonic post-midnight intervals without implying cross-source synchronization.
3. Implement editable selection/placement and scene authoring controls, camera-driven cell streaming, and measured CPU/GPU memory and draw behavior.
4. Persist through the existing authorized scene revision / asset owners, with review freshness and revision compare-and-swap; then reopen in a fresh browser and independently read back PostgreSQL and object-store hashes.
5. Keep the durable job/compiler path separate from inline HTTP preview. Resolve evidence-free blockout jobs without fabricating evidence IDs.

## OpenCode fields

- `likely_cause`: The case page had authorized evidence/intake data and server plan validation but no user-facing consumer connecting them to the Three.js runtime.
- `evidence`: `+page.server.ts` loads authorized case-scoped evidence and intake; `/scene-reconstruction/parameters` validates membership and expected revision; `/plans` resolves current case/source references; runtime recipe/Three consumer modules already existed without a case-page caller.
- `patch_targets`: `sveltekit-frontend/src/lib/reconstruction/case-scene-plan-draft-v1.ts`, `sveltekit-frontend/src/lib/reconstruction/case-scene-plan-draft-v1.spec.ts`, `sveltekit-frontend/src/lib/components/reconstruction/CaseScenePlanBuilder.svelte`, `sveltekit-frontend/src/lib/components/reconstruction/SceneRuntimeRecipeCanvas.svelte`, `sveltekit-frontend/src/routes/(app)/cases/[id]/crime-scene/+page.svelte`, `openspec/changes/crime-scene-reconstruction/tasks.md`.
- `safe_next_command`: `npm exec vitest run src/lib/reconstruction/case-scene-plan-draft-v1.spec.ts src/lib/reconstruction/scene-runtime-three-v1.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism`
- `smoke_command`: `npm run check:native`
- `report_path`: `docs/reports/case-scene-case-builder-preview-20261120.md`
