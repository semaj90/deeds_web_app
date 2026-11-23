# Procedural scene helpers · 2026-11-20

## Implemented

- Added `sveltekit-frontend/src/lib/splat/scene-primitive-three-v1.ts`, a browser-side adapter from the existing versioned primitive registry to Three.js geometry. It supports box, sphere, cylinder, cone, torus, circle, rectangle, and validated polygon-prism recipes.
- Added a schematic room shell assembled from those primitives. It is explicitly generated, illustrative, non-source-derived, and uncalibrated.
- Added a bounded spatial-cell residency planner using the existing tile/Morton helpers, with resident limits and grace-period unload planning for large city/coast environments.
- Added source-clock-bound event visibility so a time-limited scene element (for example, a bonfire) is active only during its half-open interval on the matching source clock. The helper never aligns clocks or treats visibility as review/evidence.
- Replaced the fixed room in the demo with selectable urban/beach environments built from deterministic per-cell `InstancedMesh` batches. Camera movement drives bounded 32 m cell residency with a 1.5 s unload grace; the inspector shows resident cells and static instance counts. The 256-slot manager remains reserved for the scene's editable actor placeholders.
- Added a synthetic beach timeline control. Its demo bonfire is visible only from 18–42 seconds on `BEACH-CAM-A`; selecting `BEACH-CAM-B` hides it because the two clocks are unaligned.
- Integrated the downloaded `avatar-primitives-v1.ts` generator into the Morrow Bay synthetic fixture demo. Neutral low-poly placeholders now render by default; verified static fixture GLB remains a selectable alternative. Both use the existing single renderer, scene, and actor transform manager.
- Generated actors are static in this view; no inferred movement is animated from provisional event text. Missing fixture GLB bytes now leave the procedural route available. No Blender invocation, native addon, database write, or production asset registration is required for this path.
- Updated CASE-SCENE-E2E-06 task ledger with a completed procedural-preview subtask. Polygon selection/editing, scene persistence, streaming, and browser proof remain open.

## Verification

- `npx vitest run src/lib/splat/scene-primitive-three-v1.spec.ts src/lib/splat/scene-scale-temporal-v1.spec.ts`: 6 tests passed.
- `git diff --check`: passed.
- `npm run check:native` was not run in this continuation; the prior run exhausted Windows virtual memory (VirtualAlloc error 1455). Svelte type checking and browser rendering therefore remain unverified.
- No database, SeaweedFS, Redis/Valkey, or other datastore was accessed or changed.

## Remaining

The preview is still read-only and synthetic. The residency planner is connected to camera movement, but the renderer has not been exercised in a browser or profiled with city-scale instance populations; no measured frame-time or memory claim is made. LOD is not wired yet. The demo does not yet expose polygon editing, case-evidence event playback, authorized source uploads, canonical scene revision writes, or fresh-session save/reopen. The avatar meshes are grouped primitives, not a skinned rig. GLB is optional for the procedural representation; when present it is still hash-validated before its alternate view is offered.
