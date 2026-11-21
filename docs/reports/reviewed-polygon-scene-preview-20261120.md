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
