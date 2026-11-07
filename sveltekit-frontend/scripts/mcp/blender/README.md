# Parent Atlas Blender Models MCP

This is a local stdio MCP server for creating and editing `.blend` files. It is
registered as `blender-models` in the repository root `.mcp.json`.

## Architecture choice

- Node.js hosts MCP and validates tool arguments with Zod, matching the repo's
  existing MCP SDK. This process imports `zod/v3` because installed MCP SDK
  `1.22.0` expects Zod v3 while the app root resolves Zod v4.
- Blender's embedded Python API (`bpy`) performs scene operations in a separate
  Blender process.
- Tool operations are allow-listed. The server does not accept or execute
  arbitrary Python.
- LangChain is not needed: MCP exposes tools directly to the connected client.
- Pydantic is not needed in the Blender subprocess: the Node boundary uses Zod
  and the Python bridge repeats key numeric and operation checks using only the
  standard library.
- Node-API is not needed: Blender is already the geometry engine and process
  isolation is a clearer boundary than embedding native Blender libraries in
  Node.

## Available tools

- `blender_status`: report workspace and executable configuration without
  launching Blender.
- `blender_create_model`: create a new scene from up to 100 cubes, UV spheres,
  cylinders, cones, or toruses, with transforms and base colors.
- `blender_synthesize_scene_dag`: validate and instantiate a bounded, typed
  primitive recipe DAG in stable parent-before-dependent order. Cycles,
  duplicate/missing IDs, invalid transforms, and triangle-budget violations are
  rejected before scene files are written. It emits a `.blend` plus a matching
  `.glb`, reporting measured triangles, bytes, SHA-256, and the default 8 MiB
  target result. Dependency IDs are retained as Blender/glTF extras; recipe
  dependencies do not silently become Blender transform parenting. An
  optional `metadata` object preserves up to 16 bounded scalar key/value
  properties on each primitive as `atlas_meta_*` Blender custom properties
  and GLB extras. These are descriptive recipe metadata, not case evidence or
  authorization fields. Primitive materials support base colors and an
  optional bounded generated checker texture with a generated UV map; arbitrary
  source-image textures and texture baking are not part of this recipe boundary. Optional
  bounded skeleton recipes create up to 32 named, parented bones and
  rigidly bind declared primitive meshes with vertex weights. Optional object
  and bone transform tracks export as GLB animation clips. The skeleton path
  was round-tripped through Blender 4.3.2 on a synthetic three-bone fixture;
  this does not provide Mixamo retargeting, automatic weight painting,
  character-rig compatibility, or evidence chronology. Output is synthetic,
  not evidence; visual quality is not assessed.
- `blender_create_mesh`: create one bounded custom mesh with up to 5,000
  vertices and 5,000 triangle/quad faces.
- `blender_create_memory_fabric`: create a synthetic hot/warm/cold cache scene
  with bounded 4,096-token tiles, caller-declared domain colors, rotations,
  optional CPU RAM/GPU VRAM/Valkey/PostgreSQL residency labels, acyclic packet/DAG links,
  and ordered cache-move arrows tied to packet keys and optional phase gate IDs.
  Typed transfer labels (host-to-device, device-to-host, Valkey/PostgreSQL read,
  CPU copy, or GPU-local) are checked against the declared endpoint residencies.
  Blocks may declare a token, embedding-vector, or packet payload. Embedding
  profiles derive the byte count from dimension and FP32/FP16/BF16/INT8/packed
  INT4/2-bit representation (for example, 768D FP16 = 1,536 bytes, INT8 = 768,
  and packed INT4 = 384); these are payload-only arithmetic, not measured cache
  allocations or proof that an encoding or GPU kernel is wired. `FP8_STORAGE_ONLY`
  is an explicitly labeled byte-size illustration; it does not imply FP8 Tensor
  Core execution on the RTX 3060 Ti.
  The optional `gpuProfile: "RTX_3060_TI_8GB"` adds a declared 8 GiB RTX 3060 Ti
  label to the scene. It explicitly reports free VRAM as unmeasured; it does not
  reserve or claim an available 2 GiB vector/index budget.
  Optional `indexBuilds` cards compare pgvector
  HNSW and cuVS CAGRA as separate build lanes; planned cards show no timings,
  while measured cards require dataset revision, hardware, build time,
  Recall@10, and a receipt reference. Cache moves are supplied plans, not live
  residency telemetry or evidence of a search vote. It enforces the requested `maxTriangles`
  ceiling (default 100,000; hard maximum 1,000,000) before writing, then reports
  mesh vertex, polygon, and triangle counts with the budget result. It writes a
  new `.blend` and matching `.glb`, records output hashes, and labels the result
  as synthetic. Geometry counts do not measure shader throughput, GPU occupancy,
  SIMT/warp scheduling, or frame time. It never reads live KV, ACE, taxonomy, or
  prefill state.
- `blender_inspect_scene`: read object names, types, transforms, and dimensions.
- `blender_export_gltf`: export a `.blend` scene to a new binary glTF (`.glb`)
  asset for Three.js.
- `blender_import_gltf`: import an edited `.glb` from the isolated workspace and
  save it as a new `.blend` scene (64 MiB input cap; no overwrite).
- `blender_import_model`: import a workspace-local `.glb`, `.gltf`, `.fbx`, or
  `.obj` into Blender, then save a new editable `.blend` and a Three.js-ready
  `.glb`. The source is read-only, input is capped at 64 MiB, triangles are
  bounded, and the 8 MiB GLB target is reported separately from visual quality.
  Rig/clip retention depends on the source and exporter; this is format
  conversion, not Mixamo retargeting. This local asset conversion does not
  establish case provenance or make the output evidence.
  Run `node scripts/mcp/blender/rigged-glb-readback-smoke.mjs` for the focused
  two-pass Blender MCP import/readback check of the synthetic textured rig.
  Run `node scripts/mcp/blender/import-model-smoke.mjs` to create a synthetic
  OBJ, static FBX, and a generated one-bone animated/skinned FBX, and exercise
  the repository's animated GLB through the real stdio MCP and Blender process.
  It verifies rig/clip readback after FBX-to-GLB and GLB-to-Blender round trips,
  leaves uniquely named proof outputs in the isolated workspace, and checks
  that source files remain unchanged.
- `blender_add_primitive`: add a primitive to an input scene.
- `blender_generate_mesh_lod`: create a new decimated copy of a `.blend` scene,
  export a separate `.glb`, and report actual triangle count, bytes, SHA-256,
  and whether the default 8 MiB byte target was met. Geometry/byte budgets are
  measured; visual quality is reported as `NOT_ASSESSED`. The source scene is
  unchanged.
- `blender_transform_object`: set a named object's transform.
- `blender_remove_object`: remove one named object from an output copy.

The memory-fabric tile uses an 8×8 visual grid; each visible cell stands for 64
token positions. This is a rendering abstraction, not a claim about GPU warp
layout, an actual cache residency policy, or token contents. The Three.js SPZ
fixture route separately demonstrates worker decoding into the maintained
`GaussianSplat` geometry format. Blender GLBs can be loaded by Three.js, but
case authorization, asset admission, and board persistence are separate gates.
The synthetic Three.js fixture route also provides local translate/rotate/scale
gizmos for an imported Blender GLB and downloads the edited result as a new copy.
These in-memory edits do not modify the Blender source file or any case record;
the edited copy can be placed in the isolated MCP workspace and imported with
`blender_import_gltf`. Browser verification of the editor/export path and the
GLB-to-Blender round trip remains open.

Every editable operation writes a **new** `.blend` file. It refuses to replace
an existing output. Input/output paths are relative to
`BLENDER_MCP_WORKSPACE`; path traversal and symlink escapes are rejected.

## Configure Blender

Put Blender on `PATH`, or set `BLENDER_EXECUTABLE` in the MCP client config to
the full executable path. The server itself does not start Blender until a
creation, inspection, or edit tool is called. The default workspace is
`deeds-web-app/.tmp/blender-mcp-workspace`.

Example call:

```json
{
  "outputPath": "drafts/evidence-room-v1.blend",
  "objects": [
    { "name": "Room floor", "primitive": "cube", "location": [0, 0, -0.1], "scale": [8, 6, 0.2], "color": [0.12, 0.16, 0.2, 1] },
    { "name": "Evidence table", "primitive": "cube", "location": [0, 0, 0.8], "scale": [2, 1, 0.08], "color": [0.58, 0.39, 0.16, 1] }
  ]
}
```

This MCP creates Blender scene files and derived `.glb` files only. The exported
mesh is a Blender-authored asset, not a Gaussian splat or a reconstruction of
case evidence. It does not upload assets, link case evidence, write PostgreSQL
records, or claim that generated geometry represents measured evidence. The
fixture viewer has a local `.glb` picker for Blender-authored meshes; browser
proof of that GLB path and authorized case-scene integration remain open.
