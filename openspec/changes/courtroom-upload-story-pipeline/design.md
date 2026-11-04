## Context

The case board already stores case evidence in PostgreSQL and original bytes in SeaweedFS. The project also has a timeline-to-reconstruction bridge and a separate Detective Mode renderer qualification change. These pieces do not yet form a durable workflow from selected evidence to an eligible case scene. The existing synthetic Streamed SOG conversion proves a format path only; it does not prove that uploaded evidence can be reconstructed, streamed, or rendered in the application.

The existing image-synthesis service configures `depth-anything/Depth-Anything-V2-Small-hf` for single-image monocular depth estimation. Its output is relative estimated depth, not a surveyed measurement. The same service's “Stable Diffusion” reference is only in prompt-writing text; the inspected pipeline does not use Stable Diffusion to refine a depth map, and it does not show a SAM-derived depth workflow. Keep any future depth-conditioned image generation as a separately versioned **HYPOTHESIS** visual. It must not replace the original, the stored depth estimate, or a source-bound marker anchor.

The target flow is user initiated: an authorized case member chooses **Set the scene** on selected evidence. A durable job builds a source-qualified reconstruction, stores derived assets separately from originals, and opens Detective Mode in a pending state. The viewer loads only after the manifest and renderer/loader pass their gates.

## Goals / Non-Goals

**Goals:**

- Preserve case authorization and evidence-to-case membership at the scene request boundary.
- Keep original evidence immutable in `legal-evidence`; store derived assets in the purpose-specific artifact bucket.
- Make PostgreSQL the authority for scene job, revision, provenance, and eligibility state.
- Reuse the existing reconstruction lane and use pinned SplatTransform conversions for explicitly admitted Streamed SOG output.
- Label generated geometry and inferred timeline actions as **HYPOTHESIS**, distinct from measured source photos or frames.
- Gate viewer integration on the separate renderer/loader qualification work.

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
