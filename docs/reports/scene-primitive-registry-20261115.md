# Scene primitive registry implementation note — 2026-11-15

## Scope

Continued `parent-atlas-spz-detective-renderer` by adding a versioned recipe catalog for the existing pre-case SPZ renderer's box, sphere, cylinder, cone, and torus primitives. The existing `ScenePrimitiveManager` remains the in-memory placement and transform owner.

## Changes

- Added `sveltekit-frontend/src/lib/splat/scene-primitive-registry-v1.ts` with deterministic Retro, Balanced, and Detailed geometry parameters, dimensions, triangle estimates, rigid-collider recipe labels, and a separate soft-body capability marker.
- Updated `sveltekit-frontend/src/routes/(app)/demos/spz-renderer/+page.svelte` to construct geometry from the registry and include the resolved recipe in object metadata for GLB export.
- Added reusable `sveltekit-frontend/src/lib/components/ui/DossierMiniModal.svelte`, using the native HTML `<dialog>` API with UnoCSS layout utilities and dossier cream/ink tokens plus hard neo-brutalist shadows. The primitive guide displays the current recipe estimates and states that physics and soft-body simulation are not active.
- Added a Playwright screenshot test in `sveltekit-frontend/tests/e2e/spz-renderer-fixture.spec.ts` for modal content, focus, Escape, close-button and backdrop dismissal, and absence of non-read requests.
- Added `sveltekit-frontend/src/lib/splat/generated-scene-asset-provenance-v1.ts` and wired it as an optional `modelGeneration` field on derived GLB assets in the existing `SceneDocumentV1` manifest. It binds model/checkpoint digest, quantization and license status, seed/settings, output SHA-256, review state, and source evidence revision. The SPZ guide now describes this output as a hypothesis. Existing `scene_assets` and scene revision owners remain responsible for storage and readback; no parallel asset table was introduced.
- The mini-modal conditionally displays provenance from the already-loaded saved scene manifest. Ordinary user-edited meshes are never labeled model-generated based on their geometry or filename.
- Expanded `sveltekit-frontend/src/lib/splat/scene-primitive-registry-v1.ts` with flat circle/rectangle geometry, a separate five-entry material palette LUT, and deterministic sword/justice-scale composite recipes. The renderer adds the composites as groups, supports whole-group and per-mesh selection, and offers a material selector for individual primitives. Existing scene/GLB metadata and persistence owners remain in place; no database table or NES retrieval LUT was reused.
- Added manifest regression cases for matching output digest/source revision and rejection of mismatches. They have not been run.
- Updated `openspec/changes/parent-atlas-spz-detective-renderer/tasks.md`; task remains partial.

## Boundaries and status

- **CREATED:** versioned geometry recipe registry, reusable native mini-modal surface, and generated-asset provenance contract.
- **WIRED:** local editor primitive generation consumes registry recipes; its guide opens the dossier-styled dialog and explains generated-asset provenance. Existing scene manifests accept provenance on derived GLB entries.
- **PROVEN:** scoped `git diff --check` passed after the latest expansion (Git only reported its existing LF/CRLF normalization notices). The Playwright screenshot test has not run: no app listener responded on ports 5173–5178, and C: had approximately 0.11 GiB free at the earlier check. No Svelte check, focused tests, browser run, or GLB round-trip was run for the latest expansion.
- **DONE:** no. Regression cases for provenance exist but remain unrun. This does not create a persistent case-scoped recipe catalog, invoke TRELLIS inference, register/read back a generated asset, invoke Rapier/Havok, implement soft-body simulation, or establish any primitive as evidence. Collider entries are recommendations, and curved shapes use explicitly approximate collider recipes.

## Follow-up

When requested for verification, add/run focused catalog and renderer tests, then exercise local GLB export and metadata readback. Any physics integration should remain a separately reviewed simulation lane with its own deterministic settings and provenance.
