# Parent Atlas Scene Runtime Integration Review

Date: 2026-11-20

Scope: Character Creator v2, scene renderer, indexed palette, native packer, and the current case-scene workflow.

## Integration verdict

| Area | Current state | Boundary |
| --- | --- | --- |
| Character v2 runtime | Wired into `createSceneRuntimeThreeV1` and `SceneRuntimeRecipeCanvas.svelte`. Existing actor anchors retain identity and transforms while GLB LODs replace the visual child. Material/UV edits use `SceneControllerV1` commands. | Verified on the public synthetic curfew/beach demo. This is not yet proof of an authenticated case scene save/reopen. |
| Motion and source clock | The selected source clock calls `setSourceTime`; movement cues seek the actor mixer to a deterministic clip time. | Synthetic event fixture and one clock lane; no global clock merge or evidence conclusion. |
| Character catalogs | `static/parent-atlas/catalog.json` and `motion-catalog.json` supply the public synthetic demo. The runtime contracts describe texture pages and scoped cache keys. | No database-backed searchable character/animation catalog is connected; texture page metadata is not yet an independent texture streaming path. |
| Private character reads | The case-scoped GET route checks authentication and case access, verifies an optional SHA-256, supports ranges, and returns 503 while `SCENE_PERSISTENCE_ENABLED` is off. | No private asset read was exercised against live PostgreSQL or SeaweedFS. The gate remains off. |
| 4bpp indexed palette | The TypeScript codec and palette shader have real consumers, including the existing `CrimeSceneViewer3D` floor path, scene-palette processing, and demo viewers. | This palette path is separate from `SceneRuntimeRecipeCanvas` character GLB loading. `TexturePage` has a format/key contract, not an integrated palette-page fetch/decode/upload lifecycle. |
| C++ packer | `simd-bridge/cpp/indexed_palette_4bpp.h` mirrors the TypeScript quantizer; the ledger records four Clang parity fixtures. | Scratch-harness proof only. No N-API or WASM wrapper is connected to the scene runtime, and MSVC parity is unverified. |
| GTA-style scanline rasterizer | No generic scanline rasterizer is wired into this scene path. Three.js/WebGL2 rasterizes the rendered triangles. | A CPU raster pass would be a separate optional mask/thumbnail tool and needs a measured use case before implementation. |
| Durable generation worker | The plan, job snapshot, lease functions, recipe compiler, and SeaweedFS readback helper exist. | A dispatcher/runner is not yet wired through claim → canonical revalidation → compile → completion. The job schema is still staged and no authorized job endpoint or live database proof exists. |

## Browser issue found and fixed

The first local Playwright replay returned a server error because the client imported `scene-document-v1.ts`, which transitively bundled Node `crypto` from the ontology/object registry. I extracted browser-safe scene object schemas to `scene-object-contract-v1.ts` and moved the ontology digest helper to `src/lib/server/reconstruction/scene-ontology-hash-v1.ts`. The original registry remains the owner of geometry recipe hashing and creation.

After the split, the existing scene preview route rendered successfully. The Browser proof exercised the synthetic catalog, two actors, shared motion fetches, 100 source-clock seeks, a LOD swap, material/UV hotkeys, and undo/redo. It asserted no page or console errors. The case-private API tests also continue to cover unauthorized requests, path traversal, the disabled gate, digest mismatch, and range responses.

## Verification in this review

- Focused Vitest command covered character runtime, scene runtime, scene object registry, scene document validation, and controller: **5 files passed, 52 tests passed**.
- Character asset route was included in the preceding focused run: **4 files passed, 25 tests passed**, including 2 route tests.
- Chromium command `npx playwright test -c playwright.set-the-scene.config.ts tests/e2e/parent-atlas-v2-character-runtime.spec.ts`: **1 passed** after the browser-safe schema split. The immediately preceding run failed at canvas discovery with the Node `crypto` client-bundle error.
- `npm run check:native`: **2,182 files, 0 errors, 1 warning**. The warning is the existing non-reactive `canvas` reference in `src/routes/(app)/demos/curfew-beach-scene/+page.svelte`.
- `openspec validate crime-scene-reconstruction --strict`: valid.
- No native acceleration build, authenticated staging write, PostgreSQL readback, or SeaweedFS live readback was performed in this review.

## Next integration work

1. Keep the synthetic character runtime as a renderer adapter, then connect an authorized case catalog and asset UUID/revision resolver without bypassing the existing asset owner or write gate.
2. Finish the claimed-job runner with canonical source/review checks before publish and a lease-fenced completion. Add durable dispatch only after the candidate schema is admitted.
3. Connect indexed palette pages only where a selected scene asset needs them; keep original images unchanged and record packed, decoded, and GPU memory separately.
4. Continue CASE-SCENE-E2E-10 with signed-in case browser save/reopen and independent PostgreSQL/SeaweedFS readback. The demo Playwright result does not satisfy that acceptance gate.

## OpenSpec state

`CASE-SCENE-E2E-11-character-v2-alignment` remains **partial**. Character runtime is created, wired, and proven for the synthetic demo. Case-private persistence, migration admission, and canonical skinned-retarget promotion remain open. `CASE-SCENE-LIVE-06`, `CASE-SCENE-LIVE-07`, `CASE-SCENE-E2E-07`, and `CASE-SCENE-E2E-10` remain open.
