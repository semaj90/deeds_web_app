## Context

The case board already stores case evidence in PostgreSQL and original bytes in SeaweedFS. The project also has a timeline-to-reconstruction bridge and a separate Detective Mode renderer qualification change. These pieces do not yet form a durable workflow from selected evidence to an eligible case scene. The existing synthetic Streamed SOG conversion proves a format path only; it does not prove that uploaded evidence can be reconstructed, streamed, or rendered in the application.

The existing image-synthesis service configures `depth-anything/Depth-Anything-V2-Small-hf` for single-image monocular depth estimation. Its output is relative estimated depth, not a surveyed measurement. The same service's “Stable Diffusion” reference is only in prompt-writing text; the inspected pipeline does not use Stable Diffusion to refine a depth map, and it does not show a SAM-derived depth workflow. Keep any future depth-conditioned image generation as a separately versioned **HYPOTHESIS** visual. It must not replace the original, the stored depth estimate, or a source-bound marker anchor.

### Video and image generators are not geometry reconstruction

The current `docker/image-synthesis/app.py` still implements FLUX.1-schnell for generated keyframes and Wan2.1 1.3B for video. The crime-reconstruction demo exposes that FLUX→Wan path. This confirms source wiring, not current runtime use; do not describe FLUX as retired until its callers/configuration are deliberately removed or disabled. FLUX is an optional appearance/keyframe lane, not a required input to evidence-derived depth or multi-view reconstruction.

Wan 3.0 is an evaluation candidate for reference-driven video, scene continuity, and visual storyboarding. The sources reviewed describe audiovisual video generation/editing from text and multimodal references; they do not establish camera-calibrated geometry, a 3D mesh, Gaussian splats, or Streamed SOG output. Treat its frames as generated **HYPOTHESIS** assets. The official-facing model material and repository inspected here do not establish reproducible local weights/runtime artifacts suitable for replacing the configured Wan2.1 worker; verify availability, API/data handling, and model/service terms before any integration. Do not replace FLUX or Wan2.1 in application configuration based only on a video-quality claim.

For Detective Mode geometry, preserve the separate path: uploaded source photos/video frames → qualified multi-view reconstruction (or clearly labeled single-image relative depth) → measured/provenance-bearing derived artifacts → separately qualified splat/mesh encoding and viewer. A generated Wan video may help storyboard a proposed sequence, but cannot fill missing camera views or prove scene geometry.

### Detective Mode scene and contextual assistant

Use Three.js as the first integration target because it is already present in the app, while keeping renderer qualification as a gate. Treat these formats as different scene layers rather than alternatives that all mean “3D”: GLB/glTF is the preferred runtime format for triangle meshes, transforms, materials, and animation; FBX is a supported interchange/import path that should be converted and validated for runtime delivery; OBJ is a simple static-mesh interchange format and does not carry a complete animated scene; SPZ is compressed Gaussian-splat appearance data and is loaded with `SPZLoader` plus `GaussianSplat` under the qualified Three.js `WebGPURenderer` path. A scene may combine a GLB collision/navigation proxy and SPZ appearance, but each asset has separate type, source hash, derivation receipt, and hypothesis status. Use a runtime asset manifest to choose and load formats; do not assume SPZ contains a mesh or that mesh formats contain splats. See the [Three.js format guidance](https://threejs.org/manual/pages/loading-3d-models.html), [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html), [FBXLoader](https://threejs.org/docs/pages/FBXLoader.html), and [SPZLoader](https://threejs.org/docs/pages/SPZLoader.html).

Detective Mode should keep a small, non-blocking contextual chat composer docked over or beside the viewer. Expanding it opens a larger panel without disposing the scene or resetting the camera, so the user can continue orbiting and inspecting while talking. The conversation is case-scoped and grounded in authorized evidence summaries and source references already available to that case; loading summaries may run in parallel with scene/LOD loading but must have independent progress/failure states and must not delay basic scene interaction. Show concise suggestion/proposal chips (for example, summarize this view, compare selected exhibits, explain this marker, or draft a timeline question). A proposal is a draft until the user explicitly accepts it; chat cannot silently move markers, add facts, alter timeline events, or modify evidence. An optional NPC/guide presentation is a visual shell for the same assistant contract, not another agent or source of authority. Replies distinguish sourced facts from generated hypotheses and link claims to evidence IDs/chunks. Closing or expanding the panel preserves camera and marker state.

For character authoring, use Blender as the rigging/retargeting and animation preparation workstation when assets or Mixamo clips need cleanup, then export runtime-ready GLB/glTF with skeleton and animation clips where supported. Keep FBX as an interchange path when Unreal/Mixamo workflows provide it; Three.js can load FBX, but it is not the preferred web delivery format. OBJ is static mesh interchange only. Unreal commonly uses FBX for skeletal meshes and animation transfer, but Detective Mode runs in the browser and does not need Unreal Engine. Validate skeleton, scale, axes, clip names, and license before admitting a character. Three.js recommends glTF for runtime delivery and provides separate FBX/OBJ loaders; Epic documents FBX skeletal mesh/animation import. See [Three.js format guidance](https://threejs.org/manual/pages/loading-3d-models.html) and [Unreal FBX pipeline](https://dev.epicgames.com/documentation/unreal-engine/fbx-content-pipeline).

Evidence markers need stable visual sizing and semantically correct anchors. Render the clickable icon as a screen-space overlay centered on a 3D projected anchor: target a 40–48 CSS-pixel hit area with a 24–32 CSS-pixel glyph, independent of camera distance and scene scale. A thin leader line connects it to the exact anchor; labels may reposition to avoid overlap. Persist a source-grounded evidence annotation against the original source pixel/UV plus evidence ID, source hash/revision, and marker revision. If the user drops a pin on inferred scene geometry, store a distinct hypothesis hotspot against the scene/reconstruction revision and transform; never label it as a measured source anchor. For mesh proxies, use raycast intersections and triangle/barycentric coordinates only as revision-bound navigation anchors. For splat-only surfaces, do not imply mesh-precise picking unless the selected renderer supplies and passes a picking-accuracy test; an optional collision mesh remains an approximate hypothesis interaction proxy.

The network target and GPU residency are separate budgets. An initial downloadable preview may target 8 MiB, but actual encoded bytes must be measured; the limit is not a per-splat promise or GPU-memory limit. Keep LOD/texture streaming and retro pixel treatment as later delivery/rendering layers. NVIDIA DLSS/TensorRT are not browser Three.js features; any browser upscaling is a separate WebGPU-compatible dynamic-resolution/upscaling experiment and must not alter source images or evidence markers. Use GPU capabilities as measured runtime diagnostics; do not require an RTX/Tensor-core browser path.

The target flow is user initiated: an authorized case member chooses **Set the scene** on selected evidence. A durable job builds a source-qualified reconstruction, stores derived assets separately from originals, and opens Detective Mode in a pending state. The viewer loads only after the manifest and renderer/loader pass their gates.

## Goals / Non-Goals

**Goals:**

- Preserve case authorization and evidence-to-case membership at the scene request boundary.
- Keep original evidence immutable in `legal-evidence`; store derived assets in the purpose-specific artifact bucket.
- Make PostgreSQL the authority for scene job, revision, provenance, and eligibility state.
- Reuse the existing reconstruction lane and use pinned SplatTransform conversions for explicitly admitted Streamed SOG output.
- Label generated geometry and inferred timeline actions as **HYPOTHESIS**, distinct from measured source photos or frames.
- Gate viewer integration on the separate renderer/loader qualification work.
- Let users inspect an eligible case scene and ask case-grounded questions in a resizable/expandable assistant panel without blocking scene navigation.
- Keep GLB/glTF mesh assets, imported FBX/OBJ interchange assets, and SPZ splat assets explicitly typed and independently provenance-bound.
- Keep evidence-marker hit targets visually consistent at every camera distance and distinguish source-image anchors from pins on reconstructed hypothesis geometry.

**Non-Goals:**

- Start reconstruction automatically during upload or evidence viewing.
- Choose PlayCanvas, Babylon.js, Spark, or Three.js as the product renderer in this change.
- Treat a collision mesh as a measured surface, evidentiary anchor, or proof of physical geometry.
- Claim that one photograph reconstructs hidden or occluded geometry.
- Change live storage routing, existing evidence records, or production schema before a reviewed migration and isolated rehearsal.

## Decisions

1. **Use an explicit case-board command.** The UI sends the case ID and selected evidence IDs only after the user chooses **Set the scene**. The server repeats case authorization and verifies every evidence-to-case link before creating a durable job. Upload success alone never starts scene work. This keeps expensive generation out of the request path and makes the trigger auditable.

2. **Keep job and provenance state in PostgreSQL.** Use the existing `analysis_jobs` lifecycle as the durable authority if its schema can represent the new job kind and idempotency contract. A queue may wake a worker, but queue delivery is not completion. If the existing schema cannot express case-linked scene jobs safely, add a reviewed migration rather than overloading `upload_pipeline` or hiding state in SeaweedFS metadata.

3. **Reuse reconstruction, then derive formats.** Send qualified source inputs through the existing reconstruction bridge/worker. Apply pinned SplatTransform as separate post-processing operations: explicit LOD inputs produce the Streamed SOG bundle and `lod-meta.json`; optional voxel/collision output is a separate derivation with separate settings and hashes. These tools do not choose the browser renderer.

4. **Separate evidence bytes from generated assets.** Original evidence remains addressed by its evidence bucket/key and source SHA-256. Scene outputs use immutable artifact keys in the configured artifact bucket. PostgreSQL stores the case association, scene revision, input evidence revisions, model and rights identity, tool version, manifest, and output hashes. Eligibility requires exact object readback and recomputed hashes.

5. **Treat scene geometry as a hypothesis.** Preserve measured source references and inferred geometry/events as different types in the manifest and UI. A marker on inferred geometry cannot be represented as a source-grounded anchor. Only a measured source can ground that type of anchor.

6. **Record the depth estimator as a derived input.** When the existing Depth Anything V2 Small path contributes a depth map, bind the estimator/checkpoint revision, source image hash, depth artifact hash and dimensions in the manifest; label the map `relative_monocular`. Do not infer metric distance or absolute room scale from this model alone. Any Stable Diffusion/ControlNet output is an optional visual derivative and is excluded from geometric or evidentiary authority.

7. **Defer runtime choice to renderer qualification.** Streamed SOG is an asset format and does not imply that Three.js `WebGPURenderer` can load it. The separate Detective Mode change must qualify the parser, renderer lifecycle, LOD selection, fallback, and disposal before an asset can be promoted to viewer eligibility. Until then the case board retains depth relief or shows a clear unavailable state.
8. **Prefer glTF/GLB for runtime mesh delivery; retain import adapters for FBX/OBJ.** Three.js has loaders for these formats, but the application should normalize approved scene meshes to GLB where practical. SPZ remains a distinct splat representation with its own loader and renderer constraints. All inputs remain subject to asset-size, extension, rights, and provenance checks.
9. **Make chat contextual and non-blocking.** Reuse the case chat/retrieval authority rather than adding a parallel NPC memory store. The compact composer expands in place; case summaries and scene assets load independently; answers carry source references; suggestions are user-reviewed drafts. The guide/NPC is optional presentation only. Camera motion and scene inspection remain available while chat is open.
10. **Separate character interchange from browser runtime assets.** Use Blender to rig/retarget and validate skeletal assets as needed; prefer GLB/glTF for browser delivery, accept FBX as a conversion/import source, and use OBJ only for static mesh interchange. Do not require Unreal Engine in the browser architecture.
11. **Keep marker display size separate from anchor coordinates.** Use a fixed CSS hit target and glyph over a projected scene anchor. Store source-image anchors separately from revision-bound hypothesis-surface hotspots. A collision mesh may help raycast placement but does not make a generated surface evidentiary.
12. **Defer graphics enhancements behind measurement.** Treat the 8 MiB figure as a measured network target, not a guaranteed SPZ compression ratio or VRAM budget. LOD/texture streaming and retro rendering are later layers. Browser dynamic-resolution/upscaling is a future WebGPU experiment; native DLSS/TensorRT are not assumed available in the web viewer.

## Risks / Trade-offs

- **A reconstruction may imply unsupported geometry** → Label it as a hypothesis, preserve source links, and do not claim hidden geometry or exact actor placement from a single view.
- **Upload and scene requests could cross case boundaries** → Recheck membership for every selected evidence ID before job creation and before asset delivery; test with two private cases.
- **Worker retries could duplicate scene assets** → Use command idempotency and immutable revisioned artifact keys; verify replay behavior in isolated storage.
- **SOG may not fit the ultimately selected renderer** → Keep conversion independent of runtime selection and require the renderer change's browser qualification before promotion.
- **Collision output may be mistaken for evidence** → Keep it optional, separately typed and hashed, and use it only as a navigation/interaction proxy for a hypothesis.
- **Source model or input rights may not permit product use** → Fail closed until candidate model, weights, and source cohort have recorded rights status.

## Migration Plan

1. Audit the live and Drizzle `analysis_jobs`/scene asset contracts read-only; identify whether a scene job can be represented without schema changes.
2. Implement and unit-test the explicit authorized command and idempotent job creation against isolated fixtures.
3. Implement the worker handoff and artifact manifest/readback against dedicated scratch PostgreSQL and SeaweedFS endpoints.
4. Qualify reconstruction, rights, and SplatTransform outputs using synthetic fixtures first, then a rights-cleared source cohort.
5. Integrate the viewer only after the renderer/loader browser gate passes. Keep depth relief as fallback.
6. Promote no live schema or storage change until the migration is reviewed, rehearsed, and approved. Roll back by disabling the scene command and leaving immutable prior artifacts untouched; do not delete source evidence.

## Open Questions

- Can `analysis_jobs` safely represent a case-linked scene-generation job, or is a new registry/table required?
- Which reconstruction model and source cohort are rights-cleared for product use?
- Which qualified renderer/loader will consume Streamed SOG, and what device/network budgets will it enforce?
- Which timeline fields are source-backed enough to inform a proposed scene without turning narrative text into precise positions?
