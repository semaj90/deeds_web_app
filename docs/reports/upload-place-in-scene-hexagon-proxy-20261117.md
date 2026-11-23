# Upload Placement Link and Hexagon Proxy

## Scope and state

Worktree base revision: `dcb643ccfeb4230bce5565b82f7cd5102f296571` (changes remain uncommitted; this is not a release revision).

The case evidence upload progress row now requires a UUID-shaped accepted evidence ID before it displays **Place in scene · open in Detective Mode**. That route passes the case and evidence IDs to the existing board, which selects and opens the authorized exhibit viewer in Detective Mode. A successful in-board upload does the same after refreshing the case list. The user must still place and save a marker separately; opening an exhibit is not a placement write.

The existing primitive registry now exposes a regular six-sided polygon extruded into a shallow prism. This is a demonstrative placeholder, with an estimated 20 triangles and an approximate convex-hull collider recipe. The existing preview triangle cap remains in force. The primitive does not come from YOLOX and does not stand for measured evidence geometry.

The reviewed calibration-to-ground-track path already exists in the worktree: the source-frame editor records a manually marked ground-contact candidate; accepted calibration and contact decisions are read from source-bound evidence history; `deriveReviewedGroundPlaneTrackFromHistoryV1` computes a 2D measured-plane proposal; the event timeline can append it to a scene-document revision and verify a fresh readback. This code path is not live-storage/browser-proven in this turn.

## Representation boundaries

- Six line segments around a center define a regular hexagon. A shallow 3D extrusion is a hexagonal prism.
- A one-image YOLOX box is a class/rectangle proposal, not a mask, camera calibration, depth map, or mesh. One image can support a plane or estimated 2.5D relief; multi-view splat reconstruction needs camera/view geometry and a separate reconstruction stage.
- Scene records and transforms belong in the existing revisioned scene manifest. Mesh/texture assets belong in the authorized asset store. A queue should carry bounded IDs, source/run revisions, and artifact references, not raw image bytes or pixel bitmaps. Valkey may cache revision-keyed manifests/LOD descriptors; PostgreSQL remains canonical. EmbeddingGemma supports retrieval/context, not geometric coordinates.
- PostgreSQL AIO and bitmap scans are planner/execution behavior, not an application bitmap-table format. There is no need for a new `.ds` store for this slice.

## Case placement follow-up

The upload queue keeps a stable row identity across progress updates and duplicate filenames. Its analysis progress applies only to the accepted exhibit for the job. The **Place in scene** link opens the exhibit and the case placement panel while analysis is running. The progress glow respects the reduced-motion preference.

Click the scene floor or drag the selected exhibit's placement control onto it. Detective Mode shows a wireframe preview until **Save marker** submits the selected position through the existing case-scoped marker API. The board then fetches the saved marker and renders a solid proxy from its persisted position. Case markers in `main-scene` use scene-local coordinates. Source-image pins use their own `evidence:<id>` scene keys and image coordinates.

The case marker shares one six-segment Three.js cylinder geometry and one material across the saved markers. Its center-fan caps produce 24 triangles. The existing extruded polygon recipe has 20 triangles with vertex-fan caps. Both counts were checked using the installed Three.js. Preview and marker resources are disposed with the viewer. These placements are investigator-selected annotations inside an illustrative environment. The reviewed ground-track workflow separately needs an approved mapping into a specific 3D scene coordinate frame.

## Follow-up validation

- Chromium passed 2/2. The new fixture uses the real case board and accepted exhibit read path. It intercepts upload, progress, and marker writes, verifies duplicate-name rows, clears the completed row, follows the remaining link, drags the placement control onto the Three.js floor, and verifies a single marker POST with the expected exhibit ID and finite position.
- Vitest passed 17/17. The PostgreSQL 18 rollback check created an image-anchored marker and a scene-local marker, read each back under its own scene key, and verified absence after rollback. The other tests cover the progress envelope, board authorization, and BVH.
- The fast Svelte check reported 0 errors and 7 warnings. The live signed-in upload, placement save, and fresh browser reopen still need one continuous run.

## Detective Mode dossier follow-up

The station image informed the expanded canvas, compact layer control, and view tools. The multiplane illustration informed the proposed source/depth/review layer separation. The PS1 ordering diagram was used to identify transparency and retro effects as profiling candidates. The matrix and Blender references informed shared transforms and UV presentation. Copies of all five input images are under `.tmp/atlas/detective-dossier-references-20261117/` for local review. No reference art is loaded by the application.

The case workspace uses the existing cream dossier tokens. The real case exhibit list and inspector can collapse, expanding the 3D view. Narrower widths stack the inspector below the canvas. **Ask assistant** opens the existing board chat with the authorized exhibit selected and visible in the panel. A real model response was outside this browser fixture.

The illustrative blockout uses six instances on one box geometry and material. Saved marker moves refit the existing picking BVH. The case renderer caps device pixel ratio at 1.5. The optional procedurally colored floor uses the existing WebGL2 indexed texture path. Its 64×64 source contains 2,048 index bytes and a shared 16×RGBA8 palette of 64 bytes before texture padding. The portable motion format is still 64×128 with 4,096 packed pixel bytes plus its 16-byte header. The default 32×64 motion preview has 1,024 packed index bytes. These are payload sizes.

### Verification (2026-11-17)

- Browser command from `sveltekit-frontend`: `npx playwright test tests/e2e/evidence-upload-scene-placement.spec.ts tests/e2e/scene-primitive-inspector.spec.ts --project=chromium --workers=1 --retries=0`. Used `PLAYWRIGHT_SKIP_GLOBAL_SETUP=true`, `SCENE_PLACEMENT_TEST_CASE_ID=b8fbe1be-dad0-4986-b51d-b28338acd71a`, and `SCENE_PLACEMENT_TEST_EVIDENCE_ID=4fb1e374-ab27-489c-857b-6dd3618d1acb`. Reported `2 passed (29.3s)`. The desktop canvas expanded, color shader rendered, a forged exhibit ID could not populate the assistant, and the 820-pixel layout kept the canvas usable. The test intercepted upload and marker writes. Browser base revision was `dcb643ccfeb4230bce5565b82f7cd5102f296571` with worktree changes. Screenshots were saved in `.tmp/atlas/detective-dossier-qa-20261118/`.
- Focused command from `sveltekit-frontend`: `npx vitest run src/lib/shared/video-motion-cue-v1.spec.ts src/lib/splat/indexed-palette-shader-v1.spec.ts src/lib/splat/reviewed-ground-plane-track-v1.spec.ts src/lib/splat/spatial-bvh-manager-v1.spec.ts 'src/routes/(app)/cases/[id]/board/board-page-server-auth.spec.ts' --reporter=dot`. Output `Test Files 5 passed (5)` and `Tests 28 passed (28)`.
- Signed-in upload, investigator review, and fresh scene reopen through the running app remain open. The separate PostgreSQL and SeaweedFS scratch browser proof is recorded in `video-motion-lut-v1-20261116.md`.

## Original detective guide (2026-11-18)

**CREATED.** The original guide uses a petrol coat, cream cuffs, oxblood tie, brass badge, glasses, pocket lens, and notebook. The procedural Blender source uses one joint influence per authoring vertex. The GLB contains one primitive, 969 triangles, 15 joints, a nearest-filtered 64×64 PNG atlas, and Idle, Walk, Inspect, and Interact clips. Runtime GLB is `sveltekit-frontend/static/models/detective-actor-v1.glb` (167,084 bytes, SHA-256 `2a23e0c7912592a2560e53a19864df8edb728d24e5bd2e7dc4f529011c288318`). Editable Blender and rigged FBX exports, atlas, and previews are in `.tmp/atlas/detective-actor-v1/`. The pasted segmented geometry informed the joint organization. Character meshes, textures, and movements were authored for this workspace.

**WIRED.** In Detective Mode, open **Layers → Illustrative detective guide** and choose a guide action. Three.js loads the GLB and plays its embedded clips. Walk moves the guide along the existing illustrative path. Inspect and Reach play authored gestures. Exhibit selection and marker placement stay in the case editor. If the GLB is unavailable, the viewer displays its procedural guide and reports animation unavailable.

**PROVEN for the asset and controls.** Worktree base `4f3091bbb4832bf728fe062cdd34fe9c9b5a6ddc` with local edits. Generation command from repository root:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 4.3/blender.exe' -b --factory-startup --python-exit-code 3 --python 'scripts/atlas/generate-detective-actor.py' -- '.tmp/atlas/detective-actor-v1'
```

Output `DETECTIVE_ACTOR vertices=577 triangles=969 joints=15`. FBX import returned an armature with 15 bones, a mesh with 15 vertex groups, and all four actions. Generated art preview and browser placement capture are `.tmp/atlas/detective-actor-v1/detective-actor-preview.png` and `.tmp/atlas/detective-actor-v1/detective-in-case.png`.

From `sveltekit-frontend`, with `PLAYWRIGHT_SKIP_GLOBAL_SETUP=true`, `SCENE_PLACEMENT_TEST_CASE_ID=b8fbe1be-dad0-4986-b51d-b28338acd71a`, and `SCENE_PLACEMENT_TEST_EVIDENCE_ID=4fb1e374-ab27-489c-857b-6dd3618d1acb`, `npx playwright test tests/e2e/evidence-upload-scene-placement.spec.ts tests/e2e/scene-primitive-inspector.spec.ts --project=chromium --workers=1 --retries=0` reported `2 passed (56.8s)`. The browser loaded the real GLB, selected the four actions, toggled guide visibility, and exercised the marker workflow with intercepted upload and marker writes. An adversarial 404 for the GLB preserved the canvas and displayed the fallback status. The existing demo marker interaction test also passed.

### Deterministic guide clip scrubbing (2026-11-18)

**CREATED, WIRED, and PROVEN in the case browser fixture.** The case Layers panel now has an opt-in clip-time slider. It samples the selected GLB animation at an absolute, clamped time with the Three.js mixer held at zero delta; Walk also derives the guide's illustrative path position from that clip time. Turning scrubbing off returns to the existing free-running action behavior. Loading rejects an unexpected rig hierarchy or missing/empty/non-finite required clips and retains the existing procedural fallback. The rig check normalizes names using Three.js `PropertyBinding.sanitizeNodeName`, because GLTFLoader converts the source rig's spaces and punctuation. This is animation of the original illustrative guide, not retargeted evidence motion.

An independent GLB read measured 167,084 transfer bytes, 98,842 mesh-accessor bytes, 21,836 unique animation accessor bytes, 960 inverse-bind bytes, and an 886-byte embedded PNG atlas. Expanding that 64×64 atlas to RGBA8 is 16,384 texel bytes; the listed model arrays plus expanded texels total 138,022 bytes before Three.js objects, skin pose matrices, GPU alignment, render targets, and driver overhead. This is one asset's estimate, not a measured whole-scene or GPU residency result. In `scene-document-v1.ts`, the existing 8 MiB limit applies to encoded derived/LOD scene-asset payloads; it does not enforce an 8 MiB live CPU/GPU working set. The full scene residency budget and LRU behavior remain open.

The updated `tests/e2e/evidence-upload-scene-placement.spec.ts` checks the accepted-upload link into Detective Mode, loads the real GLB, samples the selected clip, clamps at the end, returns to a prior time and compares the rendered canvas bytes at the same clip time, resumes normal playback, and completes the intercepted marker and assistant flow. From `sveltekit-frontend`, with `PLAYWRIGHT_SKIP_GLOBAL_SETUP=true`, `SCENE_PLACEMENT_TEST_CASE_ID=b8fbe1be-dad0-4986-b51d-b28338acd71a`, and `SCENE_PLACEMENT_TEST_EVIDENCE_ID=4fb1e374-ab27-489c-857b-6dd3618d1acb`, `npm exec -- playwright test tests/e2e/evidence-upload-scene-placement.spec.ts --project=chromium --workers=1 --retries=0` reported `1 passed (39.7s)`. Upload and marker writes were intercepted; this did not write case data.

The final `npm run check:fast` reported `0 errors and 7 warnings in 1 file`; the warnings are unused CSS selectors in `src/routes/(app)/analysis-center/+page.svelte`. An earlier full check found and prompted correction of three new `currentTarget` typing errors and four evidence-context typing errors; the scoped check then passed without errors. Scoped `git diff --check` passed for all seven changed implementation, test, ledger, and report files; Git emitted only existing LF-to-CRLF conversion notices.

## Initial validation

No test, typecheck, browser, database, worker, or object-store run was performed.

Exact whitespace-check command:

```text
git diff --check -- sveltekit-frontend/src/lib/splat/scene-primitive-registry-v1.ts "sveltekit-frontend/src/routes/(app)/cases/[id]/evidence/upload/+page.svelte" "sveltekit-frontend/src/routes/(app)/cases/[id]/board/+page.svelte" "sveltekit-frontend/src/routes/(app)/cases/[id]/crime-scene/+page.server.ts" "sveltekit-frontend/src/routes/(app)/cases/[id]/crime-scene/+page.svelte" sveltekit-frontend/src/lib/server/scene-document-revisions-v1.ts openspec/changes/crime-scene-reconstruction/tasks.md openspec/changes/parent-atlas-spz-detective-renderer/tasks.md
```

Observed result: exit code `0`; no whitespace errors. Git printed line-ending warnings that listed LF files may be converted to CRLF on a future write. `git rev-parse HEAD` returned `dcb643ccfeb4230bce5565b82f7cd5102f296571`; this identifies the dirty worktree's base revision, not a commit containing these changes.

## Required report fields

- `likely_cause`: The progress-row link selected an exhibit without opening its viewer, upload IDs were accepted as arbitrary strings, and scene previews lacked a named six-sided proxy in the existing primitive preset table.
- `evidence`: `sveltekit-frontend/src/routes/(app)/cases/[id]/evidence/upload/+page.svelte`; `sveltekit-frontend/src/lib/splat/scene-primitive-registry-v1.ts`; `sveltekit-frontend/src/lib/splat/reviewed-ground-plane-track-v1.ts`; `sveltekit-frontend/src/lib/components/evidence/EvidenceVideoEventTimeline.svelte`.
- `patch_targets`: `sveltekit-frontend/src/routes/(app)/cases/[id]/evidence/upload/+page.svelte`; `sveltekit-frontend/src/routes/(app)/cases/[id]/board/+page.svelte`; `sveltekit-frontend/src/lib/splat/scene-primitive-registry-v1.ts`; `openspec/changes/crime-scene-reconstruction/tasks.md`; `openspec/changes/parent-atlas-spz-detective-renderer/tasks.md`.
- `safe_next_command`: `git diff --check -- sveltekit-frontend/src/lib/splat/scene-primitive-registry-v1.ts "sveltekit-frontend/src/routes/(app)/cases/[id]/evidence/upload/+page.svelte" "sveltekit-frontend/src/routes/(app)/cases/[id]/board/+page.svelte" openspec/changes/crime-scene-reconstruction/tasks.md openspec/changes/parent-atlas-spz-detective-renderer/tasks.md`.
- `smoke_command`: `cd sveltekit-frontend; npm run check:fast` (not run; follow with a real browser flow covering upload acceptance, link navigation, hexagon render/pick, and explicit marker save/readback).
- `report_path`: `docs/reports/upload-place-in-scene-hexagon-proxy-20261117.md`.
