# Parent Atlas Avatar Enhancement Kit Review

## Scope and revision

Read-only review of `C:/Users/james/Downloads/parent_atlas_avatar_enhancement_kit/parent_atlas_avatar_kit` against the local `CrimeSceneViewer3D.svelte` at repository revision `c07890601d2ad6f8c50617aba79436b44b808510`. The viewer target had no reported working-tree changes, and `sveltekit-frontend/src/lib/characters/` does not exist locally. No app code or datastore was changed.

## Stage assessment

| Stage | Finding |
|---|---|
| CREATED | Kit contains generated Three.js face/full-avatar helpers, GLB loader, coat-tail and spring-cape demos, Ammo soft-cloth example, Blender generator, and standalone AvatarLab. |
| WIRED | Nothing from the kit is copied into the local app. The local viewer already creates a crouched primitive detective, registers it as `INVESTIGATOR_PAWN` in slot 4, keeps its hitbox in BVH pickables, and animates within one requestAnimationFrame loop. |
| PROVEN | Kit validation reports Python syntax and TypeScript transpile-only checks. It explicitly did not run Blender, full Svelte/TypeScript checks, Vitest, Playwright, browser rendering, or physics. No local integration proof exists. |
| DONE | No avatar-enhancement feature is done in the app. |

## Full-scene actor fit

For reconstruction scenes with several people, the primary reusable helper is `createPrimitiveAvatar()`, not `enhanceExistingDetective()`. The factory returns a fresh root, face controls, head/arm/leg pivots, and deterministic `setWalk(phase)` pose control. Call it once per illustrative appearance, add each root to the existing scene, and associate it with the app's scene/appearance data through an adapter. Derive pose phase from the selected event's absolute source time so replay and scrubbing are deterministic.

The generated mesh is a stylized placeholder, not evidence-derived geometry, a calibrated body measurement, an identification result, or a legal person record. The kit has no scene actor/person registry, event-to-actor binding, scene-revision serializer, or authorized evidence relationship. The local scene document owns serializable scene objects, but I did not find a case-scoped POI/appearance registry in the inspected scene path; that relationship still needs a clear owner. `courtroom-actor-binding-v1.ts` maps story roles to courtroom meshes and is not a case-person identity registry. Keep source observations and reviewer decisions in their existing evidence/review owners, and keep independent scenes in separate coordinate frames until calibration/review supports a transform.

The local `CrimeSceneViewer3D` investigator is one demo actor; it is not the scene-wide POI system. `enhanceExistingDetective()` can remain an optional compatibility adapter for that investigator, but must not define the reconstruction architecture.

This avatar kit fills only the **people/placeholder** part of a full reconstruction. It does not construct rooms, compile source masks into scene geometry, align clocks/cameras, bind people to reviewed events, or save and reopen a complete case scene.

Implementation cautions for multiple actors:

- `ScenePrimitiveManager` only exposes 256 transform slots. It cannot be the sole registry for a scene document that permits 10,000 objects; use it for a bounded active set and the existing scene document/residency owners for saved/streamed content.
- Each avatar factory call creates many separate geometries and materials. Four demo actors are plausible; large crowds need draw-call and GPU-memory profiling before instancing or shared-resource changes.
- `disposeAvatar(root)` traverses and disposes every descendant mesh resource. This is safe only when that actor owns those resources. A cloned/shared-resource actor needs a shared owner or reference-counted disposal.
- Use neutral art direction unless a reviewer explicitly selects a visual style. Never infer style, identity, gender, conduct, or guilt from evidence.
- Keep mouth motion closed by default. `activeMotion !== 'none'` is not a speech cue; only reviewed, timestamp-bound transcript playback may drive speech-like motion.

## Other kit paths

- `createPrimitiveAvatar()` is the candidate for multiple scene placeholder people. It has group pivots and a sine-based walk pose, but is not a skin-bound rig, calibrated human model, or evidence identity. Adapt it to existing scene objects; do not replace the detective's `userData.torso/rArm/lArm` contract with it.
- The Blender GLB is an output of a generator, not included as a verified built artifact. The generator and GLB shape-key/rig readback were not run. Its combined three-rig scene and `loadAvatarGLB(url)` URL-only metadata are not a production authorized asset flow. Do not put evidence portraits or private assets in `static/avatars`.
- The spring cape is an optional CPU cloth demonstration with no collision; it is unrelated to the present face-only quick hit. The skinned coat-tail is authored for a separate skeleton. Ammo cloth is dependency-injected experimental code with no verified WASM runtime and should remain deferred.
- The standalone `AvatarLab.svelte` is a separate renderer/demo surface; it is not needed to extend the existing viewer.

## Recommended implementation sequence

1. Copy only `avatar-primitives-v1.ts` into the app as a generated actor factory. Add a typed adapter for app-owned `actorId`, `appearanceId`, scene, transform, and illustrative status; never let client-supplied identity/review flags authorize a durable write.
2. Instantiate multiple actors in one synthetic multi-scene fixture, with deterministic actor positions and absolute-time walk phases. Register only the active bounded subset in `ScenePrimitiveManager`; preserve stable IDs in the scene document and keep scenes' coordinate frames distinct.
3. Add focused tests for independent roots/resources, pose determinism, disposal ownership, bounded slot admission, and persistence serialization that does not promote a generated avatar to evidence.
4. Run the supported Svelte check and browser smoke for multiple actors, selection/picking, timeline scrub, and teardown. Do not start memory-heavy checks in parallel while workstation memory is constrained.
5. Keep `enhanceExistingDetective()` as optional compatibility only. Defer GLB production, garment skinning, and cloth physics until their asset/runtime paths are separately verified.

## Evidence inspected

- Local: `sveltekit-frontend/src/lib/components/evidence/CrimeSceneViewer3D.svelte` (actor construction around lines 578-730; registration around 1107-1159; existing render loop around 1185-1256; teardown around 1545-1574).
- Kit: `src/lib/characters/avatar-primitives-v1.ts`, `avatar-glb-v1.ts`, `skinned-coat-tail-v1.ts`, `cloth-spring-v1.ts`, `ammo-soft-cloth-example.ts`, `integration/CrimeSceneViewer3D-integration.md`, and `VALIDATION.md`.
- Local package versions: `three` 0.186.1 and `@types/three` 0.186.0.
- Validation record explicitly says Blender execution, full type-check, Svelte, Vitest, Playwright, browser rendering, Ammo compatibility, persistence, and authorization were not run/proven.

## Structured handoff

- `likely_cause`: The kit is a generated prototype and integration recipe, while the local viewer has not consumed any kit module.
- `evidence`: Downloaded kit sources and validation record; local viewer actor, single animation loop, slot-4 registration, BVH pickable hitbox, and teardown; repository revision above.
- `patch_targets`: No application files changed. Review targets: `sveltekit-frontend/src/lib/components/evidence/CrimeSceneViewer3D.svelte` and the downloaded `avatar-primitives-v1.ts`.
- `safe_next_command`: `git status --short -- sveltekit-frontend/src/lib/components/evidence/CrimeSceneViewer3D.svelte sveltekit-frontend/src/lib/characters`.
- `smoke_command`: Not run; this was a read-only package review. After integration, use focused avatar tests plus the viewer's existing browser smoke.
- `report_path`: `docs/reports/avatar-enhancement-kit-review-20261119.md`.
- `datastore_side_effects`: None; PostgreSQL, SeaweedFS, Redis/Valkey, Qdrant, and case evidence were not accessed or changed.
