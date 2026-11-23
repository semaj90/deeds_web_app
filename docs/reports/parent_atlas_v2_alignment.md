# Parent Atlas Character Creator v2 — Course-Correction & Runtime Alignment Report

**Date:** 2026-11-20  
**OpenSpec Change:** `crime-scene-reconstruction` (`CASE-SCENE-E2E-11-character-v2-alignment`, `ENG-01..ENG-03`)  
**Status:** Stage 1 (Material/UV Hotkeys & Preview) and Stage 2 (Scoped Character/Motion Runtime + Deterministic Source-Clock Seeking) **VERIFIED** in Vitest (22/22) and Chromium WebGL2 Playwright (1/1). Stage 3 (PostgreSQL 18 / SeaweedFS case-private persistence & migration) remains **OPEN / STAGED ONLY**.

---

## 1. Architectural Reconciliation (Single Renderer, Single Loop, Single Authority)

Per the course-correction brief, the temporarily staged parallel `src/lib/parent-atlas/` folder was removed and replaced with a single reconciled adapter module (`sveltekit-frontend/src/lib/characters/character-runtime-v2.ts`) connected directly into the existing scene stack:

| Subsystem | Existing Repo Owner Preserved | Reconciled v2 Adapter Integration |
| :--- | :--- | :--- |
| **3D Scene & Frame Loop** | `createSceneRuntimeThreeV1` (`src/lib/reconstruction/scene-runtime-three-v1.ts`) & `SceneRuntimeRecipeCanvas.svelte` | `loadCharacterActor()` mounts GLB LODs inside the existing actor anchor `THREE.Group` while preserving `createPrimitiveAvatar` as synchronous fallback. Zero extra `WebGLRenderer` or `requestAnimationFrame` loop created. |
| **Spatial Cell Residency** | `createSceneCellResidencyV1` (`src/lib/splat/scene-cell-residency-v1.ts`) | Unchanged Morton 2D ring streaming (retro 9, balanced 16, high 25 cells) with grace-period unload and pinned edit cells. |
| **Source-Clock Evaluator** | `evaluateSceneTimelineV1` (`src/lib/splat/scene-event-visibility-v1.ts`) | `setSourceTime(clockId, sourceTimeMs)` maps active movement intervals through `cueClipSeconds()` and drives each actor's `AnimationMixer.setTime(t)` deterministically without double-advancing via `mixer.update(dt)`. |
| **Undo / Redo Command Stack** | `SceneControllerV1` & `CommandHistory` (`src/lib/scene/scene-controller-v1.ts`) | `ApplyMaterialPreviewCommand` implements `SceneCommand` (`execute`, `undo`, `toSerializable`), routing all material/UV preview edits through the existing undo/redo stack. |
| **Rigid Skin Validation & GLB Parsing** | `validateOneBoneRigidSkinV1` (`src/lib/splat/one-bone-rigid-skin-validator-v1.ts`) & `parseGlb` (`src/lib/character-animation/glb-clip-sampler-v1.ts`) | Reused to validate the separately generated Blender 4.3 `parent-atlas-rigged.glb` (11 `SkinnedMesh` parts, 7 bones, `JOINTS_0`/`WEIGHTS_0`/`TEXCOORD_0`, 21-channel `Walk`). |
| **Database & Object Storage Authority** | `scene_assets`, `scene_asset_files`, `scene_document_revisions` (`src/lib/server/scene-assets-v1.ts`, `scene-document-revisions-v1.ts`) | No parallel `parent_atlas.blob` table or unreviewed SQL migration was executed against PostgreSQL 18. |

---

## 2. Resolution of P0 & P1 Course-Correction Gaps

| Severity | Finding | Resolution Implemented & Verified |
| :--- | :--- | :--- |
| **P0-1** | `ThreeCharacterRuntime.load()` replaced the actor root, restarted animation 0, and lost actor transform/playhead. | `ThreeCharacterRuntime.load()` snapshots and restores `name`, `position`, `quaternion`, `scale`, `visible`, `userData`, `activeClipName`, and `playheadSeconds` (`mixer.setTime(desiredPlayhead)`). In `createSceneRuntimeThreeV1`, the outer `actor:{id}` anchor `THREE.Group` holds world placement and event bindings while the GLB LOD swaps cleanly inside it. |
| **P0-2** | Default character template cache used bare `sha256` as its key. | `characterTemplateCacheKey()` partitions by `scopeKind` (`public-procedural` vs `case-private`), `authorizationScopeId`, UUID `caseId`, `sceneRevision`, `revision_hash`, `tier`, and `sha256`. Missing/invalid `caseId` on private assets throws immediately. |
| **P0-3** | Motion/template cache hits could bypass a fresh authorization resolver call. | Both `ThreeCharacterRuntime.load()` and `MotionCacheThree.acquire()` await their authorization URL resolver **before** calling `cache.retain(key)`. Revoked sessions or cross-case requests throw `403` even when the identical `sha256` is resident in memory. Added `invalidateCaseScope(caseId?)` for case/session transitions. |
| **P0-4** | `MotionCacheThree` was not consumed by `ThreeCharacterRuntime` or `createSceneRuntimeThreeV1`. | `ThreeCharacterRuntime` now accepts `MotionCacheThree`, preloads external motion-only GLBs (`preloadMotion`), shares immutable `THREE.AnimationClip` instances across actors, and releases borrowed clip refs on `unload()` / `dispose()`. |
| **P0-5** | `cueClipSeconds()` was disconnected from `evaluateSceneTimelineV1`. | `createSceneRuntimeThreeV1.setSourceTime()` computes `cueClipSeconds(sourceTimeMs, cue, 1.0)` for active movement events on the selected source clock lane and calls `charRuntime.seekClip('Walk', clipSeconds)` (or `seekClip('Idle', 0)` outside movement intervals). |
| **P0-6** | Stale asset loads could overwrite a newer LOD request. | `SceneGeneration` increments an epoch and aborts the prior `AbortController` on every `load()`, releasing or destroying any late-arriving template before it can mutate the scene. |
| **P1-1** | `MaterialPreviewThree` made untracked copies without renderer ownership or undo/redo. | Wired into `createSceneRuntimeThreeV1` (`applyObjectMaterialPreview`, `resetObjectMaterialPreview`, and `dispose()`) and connected to `SceneControllerV1` via `ApplyMaterialPreviewCommand`. Shared texture `wrapS`/`wrapT`/`repeat` are never mutated; atlas subrect tiling fails closed. |
| **P1-2** | `parent-atlas-rigged.glb` was not in the v2 ZIP and needed independent verification before copying. | Kept separate from `static/parent-atlas/` (which contains only the v2 ZIP's synthetic node-animated `retro`/`balanced`/`detailed` GLBs and `Walk`/`Idle`/`Blink` node-motion GLBs). Verified `scratch/pa-rig-output/parent-atlas-rigged.glb` (146,432 B) via `parseGlb`, `GLTFLoader`, and `validateOneBoneRigidSkinV1` in Vitest. |

---

## 3. Changed & Added Paths

- `sveltekit-frontend/src/lib/characters/character-runtime-v2.ts` (NEW — reconciled v2 runtime, scoped caches, `cueClipSeconds`, hotkeys, `MaterialPreviewThree`, `ApplyMaterialPreviewCommand`)
- `sveltekit-frontend/src/lib/characters/character-runtime-v2.spec.ts` (NEW — 6 integration tests covering P0-1..P0-6, P1-1..P1-2, 100 seeks, and Blender 4.3 skin validation)
- `sveltekit-frontend/src/lib/reconstruction/scene-runtime-three-v1.ts` (MODIFIED — wired `loadCharacterActor`, `MotionCacheThree`, `cueClipSeconds` in `setSourceTime`, `MaterialPreviewThree`, and disposal)
- `sveltekit-frontend/src/lib/components/reconstruction/SceneRuntimeRecipeCanvas.svelte` (MODIFIED — mounted focus-scoped `Character LOD & Material/UV Inspector`, LOD switcher, and `SceneControllerV1` undo/redo)
- `sveltekit-frontend/src/routes/(app)/demos/curfew-beach-scene/+page.server.ts` & `+page.svelte` (MODIFIED — added `?v2=1` / toggle to mount `SceneRuntimeRecipeCanvas` in a zero-write synthetic demo route with one active renderer at a time)
- `sveltekit-frontend/static/parent-atlas/` (NEW — synthetic public demo `catalog.json`, `motion-catalog.json`, `retro`/`balanced`/`detailed` GLBs, `Walk`/`Idle`/`Blink` motion GLBs, 64×64 PNG texture page)
- `sveltekit-frontend/playwright.set-the-scene.config.ts` & `sveltekit-frontend/tests/e2e/parent-atlas-v2-character-runtime.spec.ts` (NEW — Chromium WebGL2 E2E test)
- `openspec/changes/crime-scene-reconstruction/tasks.md` (MODIFIED — logged `CASE-SCENE-E2E-11-character-v2-alignment`)

---

## 4. Verification Results, Network Counts & Memory Accounting

### 4.1 Vitest Integration Suite
Command:
```powershell
cd sveltekit-frontend
npx vitest run src/lib/characters/character-runtime-v2.spec.ts src/lib/reconstruction/scene-runtime-three-v1.spec.ts src/lib/scene/scene-controller-v1.spec.ts --pool=threads --maxWorkers=1 --minWorkers=1 --no-file-parallelism
```
- **Result:** `3 passed (3)`, `22 passed (22)` in `13.64s` (0 failures).

### 4.2 Chromium WebGL2 Playwright Proof
Command:
```powershell
cd sveltekit-frontend
npx playwright test -c playwright.set-the-scene.config.ts tests/e2e/parent-atlas-v2-character-runtime.spec.ts
```
- **Result:** `1 passed (12.2s)`, `0` page errors, `0` console errors.
- **Screenshot:** `C:/Users/james/.gemini/antigravity/brain/ba824cbc-894a-4499-859f-d05973d1056c/pa_v2_recipe_canvas_proof.png`
- **Network Request Accounting (`/parent-atlas/*`):**
  - Initial load across **2 actors** (`ACTOR-01`, `ACTOR-02`):
    - `/parent-atlas/catalog.json`: **1** request
    - `/parent-atlas/motion-catalog.json`: **1** request
    - `retro` GLB (`f8a611...glb`, 28,136 B, 368 tris): **1** request (shared by both actors)
    - `Walk` motion GLB (`92a2e2...glb`, 5,120 B): **1** request (shared by both actors)
    - `Idle` motion GLB (`7d4b4b...glb`, 3,296 B): **1** request (shared by both actors)
    - `Blink` motion GLB (`62232e...glb`, 3,864 B): **1** request (shared by both actors)
  - Across **100 consecutive source-clock slider seeks** (`0..4000 ms`): **0** additional network requests.
  - On LOD switch (`retro` → `balanced`): **1** request for `balanced` GLB (`075fa6...glb`, 37,916 B, 768 tris), preserving `ACTOR-01` selection, placement transform, and material inspector state.
- **Memory Categories (Reported Separately):**
  - Encoded synthetic `retro` GLB + 3 motion clips: `28,136 + 5,120 + 3,296 + 3,864 = 40,416 bytes` (~39.5 KiB)
  - Encoded synthetic `balanced` GLB: `37,916 bytes` (~37.0 KiB)
  - Character template `ResourceCache` budget cap: `8 MiB` (`8,388,608 bytes`)
  - Decoded motion clip `ResourceCache` budget cap: `512 KiB` (`524,288 bytes`)
  - Procedural environment residency: `9 loaded cells` (`324 repeated instances`) under the `retro` profile cap.

---

## 5. Remaining Blockers & Open Gates

1. **Authenticated Case-Private SeaweedFS & PostgreSQL 18 Asset Resolution (`CASE-SCENE-E2E-07`, `CASE-SCENE-E2E-11`):**
   - Public synthetic demo assets are served from `/parent-atlas/objects/*`. Case-private character templates and motion clips fail closed unless an authorized case URL resolver is supplied. Connecting case-private character/motion blobs to `/api/cases/[id]/scenes/[sceneId]/assets` and `SCENE_PERSISTENCE_ENABLED` remains open.
2. **Candidate PostgreSQL 18 Schema (`001_character_registry_pg18.sql`, `002_shared_motion_catalog_candidate_pg18.sql`):**
   - Kept as unapplied reference drafts in `Downloads`. Must be reconciled with existing `scene_assets` / `scene_document_revisions` ownership and RLS roles before any migration is admitted.
3. **Skinned Armature Retargeting in Production Scene (`parent-atlas-rigged.glb`):**
   - `parent-atlas-rigged.glb` was generated and validated in scratch via Blender 4.3 (`validateOneBoneRigidSkinV1` 11/11 meshes OK), while the active `static/parent-atlas/` demo uses the v2 node-animated GLBs so `Walk`/`Idle`/`Blink` match the extracted node-rig signature (`0c5cb35f...`).

---

## 6. Safe Rollback Commands

To revert only the Parent Atlas v2 alignment changes without disturbing unrelated worktree edits:
```powershell
git checkout -- sveltekit-frontend/src/lib/reconstruction/scene-runtime-three-v1.ts sveltekit-frontend/src/lib/components/reconstruction/SceneRuntimeRecipeCanvas.svelte sveltekit-frontend/src/routes/(app)/demos/curfew-beach-scene/+page.server.ts sveltekit-frontend/src/routes/(app)/demos/curfew-beach-scene/+page.svelte sveltekit-frontend/playwright.set-the-scene.config.ts
Remove-Item -Recurse -Force sveltekit-frontend/static/parent-atlas, sveltekit-frontend/src/lib/characters/character-runtime-v2.ts, sveltekit-frontend/src/lib/characters/character-runtime-v2.spec.ts, sveltekit-frontend/tests/e2e/parent-atlas-v2-character-runtime.spec.ts, docs/reports/parent_atlas_v2_alignment.md
```
