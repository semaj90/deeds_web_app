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
