# Primitive Math v2 App Adaptation

## Result

Adapted the useful compact-transform, Morton-tile, and screen-size LOD logic from the downloaded primitive-math package into `sveltekit-frontend/src/lib/n64-fsm/scene-primitive-packet-v1.ts`. The adapter reads the existing `ScenePrimitiveManager` and emits a separate stable-ID sidecar. The existing polygon validator remains the owner for polygon checks and triangulation.

The packet has a 12-byte header and 32-byte records, little-endian fields, centimeter quantization, version/stride checks, parent-reference checks, and a 1 MiB total cap. The cap includes the header and allows at most 32,767 records; this corrects the downloaded helper's declared-but-unenforced byte limit.

## Boundaries

- This is an optional in-memory/runtime transport. It does not replace the manager's 16 KiB live transform arena.
- Geometry, UUIDs, case/evidence authorization, SHA-256, and provenance are not in the packet. Keep the ID sidecar and source-bound manifest separately.
- No database or object-store write path was changed. No GLB or scene revision persistence is claimed.
- LOD and Morton helpers are pure utilities; streaming/culling callers and measured performance are not yet integrated.
- Downloaded MRL and ACE retrieval-card helpers were not copied; those belong to the existing qualified embedding and packet owners.

## Verification

- Combined focused Vitest: packet and polygon mesh specs passed (7/7).
- `npm run check:native` before the polygon mesh work: 2,172 files scanned; 11 existing diagnostics in `src/lib/components/evidence/StorybookAuthorities.svelte` and `src/routes/api/cases/[id]/storybook-authorities/+server.ts`; no diagnostics on the packet module or test.
- Polygon mesh helper focused Vitest: `src/lib/splat/reviewed-polygon-mesh-v1.spec.ts` passed (3/3), including hole area preservation and immutable vertex-edit revision checks.
- A subsequent `npm run check:native` attempt terminated before producing diagnostics because the compiler process exhausted Windows virtual memory (`VirtualAlloc` errno 1455). No retry was started.
- Live browser, PostgreSQL/SeaweedFS, and scene save/reopen were not exercised.

## Current implementation progress

Added `src/lib/splat/reviewed-polygon-mesh-v1.ts`. It validates source dimensions, SHA-256 syntax, polygon rings, hole containment/intersections, and source-pixel bounds before building Three.js `ShapeGeometry`. The edit helper returns a new recipe revision and leaves the input recipe unchanged. `mesh.userData` carries source/review references as lineage labels only; callers must independently re-read authorization and current review state at a server boundary. This is not yet connected to Detective Mode selection/edit UI or scene revision persistence.

## Structured handoff

- `likely_cause`: The download contained useful pure math but no consumer; polygon validation already existed, while mesh creation/edit revisions did not.
- `evidence`: Existing `ScenePrimitiveManager`, local polygon/mask compilers, the downloaded v2 README, focused packet and mesh tests, and native-check output.
- `patch_targets`: `sveltekit-frontend/src/lib/n64-fsm/scene-primitive-packet-v1.ts`; `sveltekit-frontend/src/lib/n64-fsm/scene-primitive-packet-v1.spec.ts`; `sveltekit-frontend/src/lib/splat/reviewed-polygon-mesh-v1.ts`; `sveltekit-frontend/src/lib/splat/reviewed-polygon-mesh-v1.spec.ts`; `openspec/changes/crime-scene-reconstruction/tasks.md`.
- `safe_next_command`: `git diff --check`.
- `smoke_command`: `cd sveltekit-frontend; npm exec vitest run src/lib/n64-fsm/scene-primitive-packet-v1.spec.ts src/lib/splat/reviewed-polygon-mesh-v1.spec.ts`.
- `report_path`: `docs/reports/primitive-math-v2-app-adaptation-20261119.md`.
