# Parent Atlas face and mesh primitives v1

Copied from the operator-provided `parent_atlas_mesh_culling_native_starter/parent_atlas_face_primitives` download on 2026-11-19.

This folder provides an importable TypeScript source library:

- `face-math.ts` creates bounded, deterministic procedural face geometry and landmarks.
- `face-three.ts` adapts that geometry to Three.js groups.
- `mesh-culling.ts` computes WebGL/WebGPU frustum planes and conservative AABB visibility masks.
- `mesh-packer.ts` encodes and decodes the starter ATMP v1 POSITION/INDEX cache format.
- `mesh-three.ts` adapts ATMP to `BufferGeometry` and offers read-only visibility planning.
- `mesh-wasm.ts` provides an optional WASM culling adapter with TypeScript fallback.

The sample assets live in `/static/models/parent-atlas-face-primitives/`; `catalog.json` records the copied bytes and SHA-256. Recipes and meshes are unreviewed procedural fixtures, not source evidence or measured people.

Integration boundary: use the application's existing Three.js renderer and scene. `planVisibleMeshAssets` is a preload/diagnostic hint only. It is not authorization, occlusion culling, or proof of geometry. ATMP v1 is a disposable POSITION/INDEX cache; preserve the original GLB and do not use ATMP as an evidence artifact. The native C and WASM C files are retained as source references only; no addon or WASM binary was built or activated. The package's separate renderer, package manager files, generated `dist`, tests tied to that `dist`, and demo queue were not copied into the app.
