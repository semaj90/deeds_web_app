# Blender material and scene helpers

`material-preset-swatch.py` creates a rights-clean synthetic Blender scene with four Parent Atlas demonstrative PBR colors, renders a PNG with Eevee, saves the `.blend`, and exports a GLB. It writes a hash and geometry/material receipt beside the outputs. Run it with the repository Blender executable:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 4.3\blender.exe' --background --python scripts/blender/material-preset-swatch.py -- --output-dir .tmp/blender-material-swatches
```

`build-shader-reference-index.mjs` hashes standalone shader sources under `sveltekit-frontend/src` and records likely host modules with markers for embedded WGSL, Three.js shader materials/hooks, and WebGPU shader-module creation. The host-module list is a review index, not proof every match contains shader code. It does not compile shaders or write to PostgreSQL, pgvector, Qdrant, or SeaweedFS:

```powershell
node scripts/blender/build-shader-reference-index.mjs
```

`procedural-humanoid-v1.py` builds an original, synthetic 21-bone humanoid, packs a small palette texture, authors a 3-second 24 fps wave, exports a GLB, and reopens it in a fresh Blender scene for structural/animation readback. It writes a `.blend`, `.glb`, preview PNG and JSON receipt to a temporary output directory; it does not access case evidence or a datastore:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 4.3\blender.exe' --background --python scripts/blender/procedural-humanoid-v1.py -- --output-dir .tmp/atlas/procedural-humanoid-v1-fixed-time
```

The browser preflight separately checks local GLB loading, rig/texture/clip inventory, play/stop controls and absence of case-write requests. This is a demonstrative fixture: its scene units are uncalibrated, and the browser run is not a character-quality or deterministic-frame-render qualification.

The preset colors are an application palette, not a forensic standard. The green swatch is named “Green Status Accent,” not a claim that a measurement has been calibrated. Blender's Principled BSDF and glTF metallic-roughness material parameters can be represented in the browser by Three.js `MeshStandardMaterial`; arbitrary Blender node graphs, Cycles-only effects, render settings, and compositing do not transfer as equivalent browser shaders. The stable interchange is the exported geometry, UVs, texture images, and supported glTF material properties.

`tessellated-cube-material-v1.py` builds a synthetic rounded cube using a subdivided grid and an applied bevel, unwraps UVs, applies the same demonstrative Principled-BSDF preset, renders it with Eevee/AgX, exports a GLB, then imports the GLB into a clean Blender scene to verify mesh/material/UV survival. The word “tessellated” describes baked polygon density here: glTF export does not preserve a hardware tessellation stage. UV unwrap is not texture baking; this fixture has no atlas texture. It writes only under `.tmp` and performs no model training:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 4.3\blender.exe' --background --python scripts/blender/tessellated-cube-material-v1.py -- --output-dir .tmp/atlas/tessellated-cube-material-v1
```

## Tiny renderer examples

```ts
// Three.js PBR surface; this is a material, not a ray tracer.
const material = new THREE.MeshStandardMaterial({ color: '#F59E0B', metalness: 0, roughness: 0.78 });
const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.82, 32, 20), material);

// Pointer picking is a separate CPU query over geometry.
raycaster.setFromCamera(pointerNdc, camera);
const hits = raycaster.intersectObjects(pickableMeshes, true);
```

Blender creates the corresponding `Principled BSDF` node and sets Base Color, Metallic and Roughness. glTF exports the supported metallic-roughness values so the browser can reproduce that material family. A custom Blender compositor, simulation modifier or Cycles node graph needs baking or a browser-side reimplementation.

## Rendering boundaries

- **Three.js raycasting/BVH** answers which proxy triangle a pointer ray intersects. It is picking, not a lighting effect or path tracer.
- **Blender Cycles path tracing** is an offline render engine. It can produce reference images but the Cycles node graph does not execute inside Three.js. Three.js has a separate community `three-gpu-pathtracer` project/example; qualify it independently from the default renderer.
- **DLSS** is a separate NVIDIA rendering feature that needs a supported native integration and motion/depth inputs. It is not a Three.js raycaster, generic browser WebGPU feature, or Blender material node. Browser resolution scaling must be labeled as sampling/upscaling unless a real DLSS integration is present.
- **Eevee** in this helper is a deterministic preview renderer for the material fixture, not a proof of Cycles parity or target-GPU performance.

## PostgreSQL boundary

The existing `atlas_nes_lut_v1` stores taxonomy/routing bytes and labels; it is not the source of renderer PBR materials or a standard color table. The separate candidate `atlas_render_material_presets_v1` SQL/Drizzle schema remains unapplied and unseeded. It stores small typed color and scalar fields plus source hash; shader source and compiled binaries/textures remain versioned files or object assets, never JSONB/base64 or pgvector payloads. No migration is applied by these helpers. A small B-tree classification index is sufficient for preset metadata; PostgreSQL AIO/bitmap scans are planner choices, not a schema requirement.

The source-backed quick reference is [`blender-shader-cheatsheet.v1.okf.yaml`](./blender-shader-cheatsheet.v1.okf.yaml). The four sample colors are Parent Atlas presentation choices, not industry or forensic standards. Use the portable Blender Principled BSDF → glTF metallic-roughness → Three.js `MeshStandardMaterial` subset for interchange; bake or separately implement effects outside that subset. Keep raycast/BVH picking, path tracing, and DLSS as distinct techniques and qualification paths. The material candidate table has not been rehearsed or applied: the configured local database is `legal_ai_db`, so it is not a safe scratch target.

## Procedural hair-card authoring fixture

`generate_procedural_hair_primitive.py` creates an upright low-poly card with a local +Y pinned root edge, Blender Cloth settings, and a procedural Principled-BSDF checker material. Run it in a fresh/background Blender process; it clears that process's scene before creating the synthetic fixture. Optional `--out` exports a static GLB card. GLB does not preserve Blender's cloth modifier or pin-group simulation, so the exported file is not animated hair. The 2026-11-07 smoke produced 45 vertices, 64 triangles, 5 pinned root vertices, and a 2,956-byte GLB; a clean Blender import recovered the mesh and material.
