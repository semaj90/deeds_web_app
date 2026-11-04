## 1. Rights and benchmark admission

- [ ] 1.1 Record intended commercial and research uses for scene generation, rendering, and benchmark data; verify rights for every candidate model and source cohort. Current design sets commercial product use as the target and keeps research separate; SHARP is research-only, the repo-qualified `eldar/flash3d` code/weights remain unlicensed or unverified, and no source cohort is admitted. Keep open until candidate/checkpoint identities and source-data rights are fully recorded. Verified locally 2026-11-04: installed `three` 0.186.1 is MIT; installed `@babylonjs/core` 9.23.0 is Apache-2.0; PlayCanvas engine is not installed, so its license is unverified here; `@playcanvas/splat-transform` (used in 2.5) was not license-checked. Three.js is a separate project from PlayCanvas.
- [x] 1.2 Keep SHARP and Flash3D blocked from product execution until their model/code terms are verified for the intended use. The current tree has no product runner for either; SHARP's model license is research-only and Flash3D code/weight terms are unverified.
- [ ] 1.3 Freeze a rights-cleared benchmark cohort with exact source IDs, revisions, hashes, camera views, and a fixed evaluation view set.

## 2. Renderer and asset format qualification

- [ ] 2.1 Build a read-only browser spike for Three.js `SPZLoader`/`GaussianSplat` with `WebGPURenderer` in the Detective Mode scene; prove whether it can share the relief viewer lifecycle or needs its own canvas, and record v4 fixture decode, extension behavior, sorting, picking, disposal, and measured rendering.
- [ ] 2.2 Build a separate read-only browser spike for Spark `SplatMesh`/`SparkRenderer` with Three.js `WebGLRenderer`; record the same scene, interaction, disposal, and performance measures. Do not assume it can run within `WebGPURenderer`.
- [ ] 2.3 Compare the two renderer tracks on the same rights-cleared SPZ fixture and browser/device matrix; choose one product renderer only after evaluating output quality, compatibility, LOD, memory, load behavior, and runtime metrics.
- [ ] 2.4 Verify Spark `.RAD`/`.RADC` LOD derivation and readback against a source SPZ hash; preserve separate format, tool version, byte count, and output hash.
- [x] 2.5 Verified SplatTransform Streamed SOG generation/readback with a synthetic 1,024-Gaussian SPZ fixture and pinned `@playcanvas/splat-transform@3.10.3` (CLI commit `4f90012`). Readback reports four LODs with counts `[1024, 512, 256, 102]`; the bundle is 57,523 bytes. The receipt records source SPZ SHA-256, `lod-meta.json`, every chunk hash and byte count at `.tmp/atlas/spz-sog-preflight-2026-11-04/receipt.json`. Scratch format proof only; no browser/runtime, production asset, rights-cleared cohort, or quality proof.
- [ ] 2.6 Define supported browsers, device/resource limits, and explicit behavior when WebGL2, WebGPU, or a derived asset is unavailable.

## 3. Encoding and quality gates

- [ ] 3.1 Implement or select a pinned native SPZ v4 encoder boundary and record platform-specific build inputs and library revision.
- [ ] 3.2 Measure actual encoded sizes and quality for the frozen cohort across declared Gaussian-count and SH-degree profiles, including the 8 MiB target; do not infer size from count.
- [ ] 3.3 Define the fixed-view quality measures, thresholds, and expert review needed for each quality profile.
- [ ] 3.4 Implement the bounded prune/encode/measure loop and emit `BUDGET_NOT_MET` or `QUALITY_NOT_MET` when size and quality cannot both pass.
- [ ] 3.5 Produce a versioned scene manifest with source/model/rights/encoder provenance, format, settings, counts, measured bytes, quality receipt, and source/output hashes.

## 4. Durable job and storage integration

- [ ] 4.1 Reconcile scene generation with the existing PostgreSQL `analysis_jobs` lifecycle and define idempotency, retry, terminal failure, and artifact eligibility transitions.
- [ ] 4.2 Define PostgreSQL `atlas_artifacts` registry metadata separately from SeaweedFS `atlas-artifacts` byte storage, including immutable keys and exact-object readback checks for SPZ and LOD assets; leave original evidence identifiers and existing objects unchanged.
- [ ] 4.3 Keep RabbitMQ as an optional worker wake-up transport; prove PostgreSQL remains the canonical job and completion state.
- [ ] 4.4 Add source-qualified worker tests for success, retry, duplicate delivery, missing source, rights rejection, and object hash mismatch using fixtures or isolated scratch infrastructure.

## 5. Detective viewer integration

- [ ] 5.1 Add the measured-versus-hypothesis-versus-fixture scene status to the scene manifest and viewer UI.
- [ ] 5.2 Integrate the qualified renderer behind an eligible-manifest gate while retaining the depth-relief viewer as an explicit fallback.
- [ ] 5.3 Prevent annotations on inferred geometry from being stored or displayed as evidence-grounded source anchors.
- [ ] 5.4 Add browser coverage for supported rendering, visible source/status labels, failure fallback, interaction cleanup, and asset provenance display.

## 6. Promotion evidence

- [ ] 6.1 Run the focused encoding, worker, storage-readback, and browser suites against fixtures or isolated scratch services; retain complete outputs and environment versions.
- [ ] 6.2 Review source-object, SPZ, and derived-LOD hashes and quality receipts independently before any scene is eligible for broader use.
- [ ] 6.3 Document performance, quality, rights, resource, and rollback evidence; keep product promotion blocked until every required gate is reviewed.

## 7. Research inputs and proposed milestone (2026-11-04, unverified)

Source: a pasted NVIDIA/SuperSplat review. Claims below are unverified unless marked. Nothing here is a completed gate.

- [~] 7.1 Verify the NVIDIA and SuperSplat claims before citing them. Partial (2026-11-04, web search, not a fetched source): SplatTransform docs confirm a sparse voxel octree (`.voxel.json`/`.voxel.bin`), an optional `.collision.glb` via `--collision-mesh`, and Streamed SOG built from LOD inputs (https://developer.playcanvas.com/user-manual/splat-transform.md, https://developer.playcanvas.com/user-manual/splat-transform/collision.md). The docs do not tie the collision octree to the Streamed SOG output. 3DGRUT (nv-tlabs/3dgrut) confirms a Playground that traces rays against a BVH of mesh primitives; its BVH build details were not found (https://github.com/nv-tlabs/3dgrut/wiki). SuperSplat Editor 3.0 is confirmed (2026-11-04): a WebGPU rewrite of the renderer and data model, MIT-licensed, WebGPU-only with WebGL2 removed (v2 branch kept for WebGL2), and a reported idle heap drop on a 4.4M-splat scene from 1,557 MB to 105 MB (https://github.com/playcanvas/supersplat/releases/tag/v3.0.0, https://blog.playcanvas.com/new-in-supersplat-editor-3-0-rebuilt-on-webgpu). That makes WebGPU a hard requirement for SuperSplat 3.0 in the browser. Still unchecked: SuGaR, Lyra. Record tool versions when checked.
- [~] 7.2 Verify GPU support claims for the target RTX 3060 Ti. Partial (2026-11-04, web search): DLSS 5 is officially on RTX 50-series desktop and laptop GPUs per NVIDIA's September 3, 2026 FAQ as reported; RTX 40 support is said to come later with no date, and sources disagree on whether that is official; RTX 30 is not listed (https://www.tweaktown.com/news/113418/dlss-5-is-officially-coming-to-rtx-40-series-gpus-after-optimizations-are-fine-tuned-for-rtx-50-series/index.html, https://www.guru3d.com/story/nvidia-reverses-course-dlss-5-is-now-officially-coming-to-rtx-40series-gpus/). DLSS Super Resolution on RTX 30 (including the RTX 3060 Ti) has only secondary-source support: a Sportskeeda DLSS 4 article lists RTX 3060 Ti with Super Resolution labelled "Beta", though its list is truncated (https://sportskeeda.com/gaming-tech/all-gpus-confirmed-get-nvidia-dlss-4). No official NVIDIA support page was found in search, so this stays unverified until NVIDIA's own DLSS page is checked. Even if confirmed, DLSS is a native-engine integration, not a drop-in WebGPU feature.
- [ ] 7.3 Keep geometry as an interaction proxy only. Markers store the original image pixel or UV anchor, source revision, reconstruction revision, and marker revision in PostgreSQL, so anchors survive a mesh change.
- [ ] 7.4 Keep generated or enhanced content (single-photo 3D generation, generative lighting) out of the evidentiary display. Original source images stay available alongside any enhanced render.
- [ ] 7.5 Proposed milestone, not started: add streamed splat LOD and a separate collision and marker geometry layer to `Evidence3DModal.svelte`, keeping the scratch-tested marker persistence and readback unchanged. Benchmark GPU memory, frame time, picking error, and annotation stability before any custom temporal renderer.
- [ ] 7.6 Marker persistence is already implemented in `Evidence3DModal.svelte` (scratch-tested earlier). Re-verify it before 7.5 relies on it.
