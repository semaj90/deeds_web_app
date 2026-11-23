# Reviewed Polygon Scene Preview Progress — 2026-11-20

## Result

The case scene preview now projects accepted image-storyboard mask contours into selectable Three.js image-plane meshes when the scene plan includes the same evidence ID and exact source revision. The projection also requires the chapter's segmentation-mask citation to match the mask artifact hash. Mesh metadata retains evidence ID, source hash/revision, chapter review token, geometry revision, and original image dimensions.

The polygons are shown on a separate floating image plane. They are not transformed into scene/world coordinates, do not assert metric scale or depth, and do not drive event motion. Source evidence remains unchanged.

The existing scene preview now also loads the original image through the existing case-authorized evidence download route, pinned to the case ID and exact source revision. It overlays the outer contour and holes in source-pixel coordinates. The reviewer can drag SVG vertex handles, nudge a focused handle with arrow keys, or enter numeric coordinates. Each valid edit is topology/bounds-checked, creates a new local geometry-revision draft, and supports undo/redo. Draft edits remain explicitly unreviewed. The normal scene-save action is blocked while an accepted contour differs from its local draft; the unsaved preview export includes the draft geometry and its source/review lineage. This does not accept the edited contour or persist it through the authorized scene-revision owner.

## Changed files

- `sveltekit-frontend/src/lib/reconstruction/scene-reviewed-polygons-v1.ts`
- `sveltekit-frontend/src/lib/reconstruction/scene-reviewed-polygons-v1.spec.ts`
- `sveltekit-frontend/src/lib/components/reconstruction/SceneRuntimeRecipeCanvas.svelte`
- `sveltekit-frontend/src/lib/splat/reviewed-polygon-mesh-v1.ts`
- `openspec/changes/crime-scene-reconstruction/tasks.md`

## Verification

- Focused Vitest: 2 files, 6 tests passed, including immutable local edits, source-bounds rejection, and undo/redo.
- Chromium/WebGL2 Playwright: the complete focused runtime file passed 3/3. Its synthetic mask fixture proves visible contour selection, source-pixel numeric editing, exact coordinate change, undo/redo, and disabled persistence. The fixture image endpoint is intercepted with a synthetic SVG; this does not prove real evidence authorization or retrieval.
- `npm run check:native`: 2,183 files, 0 errors, 0 warnings. The demo canvas warning is fixed by holding the canvas element in Svelte state and capturing its mounted reference.
- The mask fixture's scene manifest SHA-256 is computed from the canonical scene serialization; no placeholder digest is used for that manifest.
- `openspec validate crime-scene-reconstruction --strict`: valid. Scoped `git diff --check` for the implementation, ledger, and report: no whitespace errors (the ledger may emit the repository's LF-to-CRLF notice).
- Docker Desktop was unavailable. No container, PostgreSQL, SeaweedFS, authorized source-read, or scene save/reopen checks were attempted.

## Remaining work

This advances `CASE-SCENE-E2E-06c` only partially. Synthetic browser interaction is proven, but signed-in access to an actual reviewed image is not. Still needed: reviewer revalidation against current source/mask revisions at acceptance and save, a canonical scene-revision representation for editable contour recipes, persistence/readback through the existing scene revision owner, and fresh-browser authorized reopen proof. No persistence gate was enabled.

## Required status fields

- `likely_cause`: Existing accepted mask contours and a mesh compiler had no consumer in the case scene preview.
- `evidence`: `scene-reviewed-polygons-v1.ts`, `reviewed-polygon-mesh-v1.ts`, `SceneRuntimeRecipeCanvas.svelte`, 6/6 focused Vitest tests, 3/3 focused Chromium/WebGL2 tests, and native check output with 0 diagnostics.
- `patch_targets`: `sveltekit-frontend/src/lib/reconstruction/scene-reviewed-polygons-v1.ts`, `sveltekit-frontend/src/lib/reconstruction/scene-reviewed-polygons-v1.spec.ts`, `sveltekit-frontend/src/lib/splat/reviewed-polygon-mesh-v1.ts`, `sveltekit-frontend/src/lib/components/reconstruction/SceneRuntimeRecipeCanvas.svelte`, `sveltekit-frontend/src/routes/(app)/demos/curfew-beach-scene/+page.server.ts`, `sveltekit-frontend/src/routes/(app)/demos/curfew-beach-scene/+page.svelte`, `sveltekit-frontend/tests/e2e/parent-atlas-v2-character-runtime.spec.ts`, `openspec/changes/crime-scene-reconstruction/tasks.md`, `docs/reports/reviewed-polygon-scene-preview-20261120.md`.
- `safe_next_command`: `npm exec vitest run src/lib/reconstruction/scene-reviewed-polygons-v1.spec.ts src/lib/splat/reviewed-polygon-mesh-v1.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism`
- `smoke_command`: `npm run check:native`
- `report_path`: `docs/reports/reviewed-polygon-scene-preview-20261120.md`
## Scene revision follow-up

Worktree base `2ac62dafe35`. The optional procedural draft contour section records edited source-pixel vertices as `UNREVIEWED_SCENE_EDIT`. It pins the evidence revision, chapter review token and original geometry revision. The scene document requires a unique matching reviewed base, preserves ring sizes, validates topology and image bounds, and admits at most 4,096 edit vertices in aggregate. The scene writer compares the base with the preceding persisted scene and checks the current evidence and image chapter before appending. The canvas restores the edited mesh without modifying the reviewed chapter. The saved JSON report includes the separate derivative, and unsaved edits prevent replacing the preview.

`npm exec vitest run scene-reviewed-polygons-v1.spec.ts reviewed-polygon-mesh-v1.spec.ts scene-document-v1.spec.ts scene-document-revisions-v1.spec.ts scene-revision-report-v1.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism` returned `Test Files 5 passed (5)`, `Tests 55 passed (55)`. Adversarial checks reject missing bases, mismatched review tokens, out-of-bounds vertices, and attempted review promotion. Live case save/reopen and independent PostgreSQL/SeaweedFS readback remain open.

`npm exec playwright test -- --config=playwright.set-the-scene.config.ts parent-atlas-v2-character-runtime.spec.ts --grep 'synthetic reviewed-mask fixture' --workers=1 --reporter=list` returned `1 passed (14.8s)`. Chromium exercised vertex editing and undo/redo on the synthetic route using a mocked image response. Final `npm run check:native` returned `COMPLETED 2185 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS`. Strict OpenSpec validation returned `Change 'crime-scene-reconstruction' is valid`.

## Opening a chapter-only scene from the case

Worktree base `2ac62dafe35`. Saved illustrative scenes with reviewed mask contours are now listed in the case page's Scene Builder entry. The authorized revision route returns the exact base revision, then the builder preselects its contour evidence and prepares an indoor scene on that same scene ID. It rejects incompatible coordinate frames, conflicting source revisions, removed sources, and stale source hashes. The revision save builds on the prior manifest and preserves existing evidence bindings.

`npm exec vitest run scene-reviewed-polygons-v1.spec.ts scene-document-revisions-v1.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism` returned `Test Files 2 passed (2)`, `Tests 23 passed (23)`. The source seed checks cover a chapter-only revision, a metric-frame rejection, and conflicting revisions of the same image.

`npm exec playwright test -- --config=playwright.set-the-scene.config.ts set-the-scene-workflow.spec.ts --grep 'opens a reviewed contour' --workers=1 --reporter=list` returned `1 skipped`. The authorized staging case/session and write opt-in are required along with `PW_SCENE_CONTOUR_SCENE_ID` for a chapter-only scene and `PW_SCENE_CONTOUR_EDIT_X` for a valid first vertex edit. Live browser persistence and direct service readback remain open.

`npm run check:native` returned `COMPLETED 2185 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS`. Strict OpenSpec validation returned `Change 'crime-scene-reconstruction' is valid`.
## Contour annotations

The scene preview can add or remove a note on the selected image contour. These object notes have no time coordinate. They carry the saved base geometry, evidence revision and image review token separately from timed event notes. Save uses the existing scene revision contract, checks the prior reviewed base and current case evidence, and restores the same note with the contour. The saved report exports the note and its binding. A local note prevents preview replacement until saved or removed.

`npm exec vitest run scene-reviewed-polygons-v1.spec.ts scene-document-revisions-v1.spec.ts scene-revision-report-v1.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism` returned `Test Files 3 passed (3)`, `Tests 27 passed (27)`. Adversarial checks reject a duplicate note ID and a forged review token even with no vertex edits. The staging test now checks the note in the committed revision, reopened editor and exported report.

Worktree base `2ac62dafe35`. `npm run check:native` returned `COMPLETED 2185 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS`. Strict OpenSpec validation passed. `npm exec playwright test -- --config=playwright.set-the-scene.config.ts --grep 'synthetic reviewed-mask fixture|opens a reviewed contour' --workers=1 --reporter=list` returned `1 skipped` and `1 passed (8.4s)`. Chromium added a note on the synthetic contour and retained the existing vertex edit and undo/redo coverage. The signed-in staging test remains skipped.
