## Context

The installed Three.js version is 0.186.1 and includes `SPZLoader` and `GaussianSplat`. The local loader contains SPZ v4 parsing, while `GaussianSplat` requires `WebGPURenderer`; its forced WebGL2 backend is supported, but `WebGLRenderer` is not. The local relief viewer also uses `WebGPURenderer`, but creates its own renderer lifecycle; it does not currently share an instance or render Gaussian scenes. Spark is a separate Three.js-integrated splat renderer using the WebGL2 path, with SPZ input and additional splat-specific features. Thus these are two renderer architectures, not interchangeable settings: Three.js uses `WebGPURenderer` with WebGPU or its WebGL2 backend and its own `GaussianSplat`; Spark attaches its splat renderer to a Three.js `WebGLRenderer` and does not run inside the existing WebGPU renderer. A minimal local Node import smoke passed for `three/webgpu`, `SPZLoader`, and `GaussianSplat`; no fixture was decoded and no GPU/browser render was run. Three's SPZ v4 loader skips vendor extensions, so fixtures requiring such extensions need explicit rejection or another qualified decoder. Package presence and imports prove API availability only, not correct rendering, actual renderer sharing, or production readiness. The custom `src/lib/webgpu/gaussian-splat-renderer.ts` is incomplete: its sort pass has no sort bind group and does not run all bitonic stages, its `visibleCount` mirrors input count, `frameMs` measures CPU submission time, and it fetches source-tree shader URLs at runtime.

`DepthReliefViewer.svelte` remains a source-image plus matching depth-map 2.5D preview, not a Gaussian scene or measured reconstruction. The crime-reconstruction page is a distinct scene/hypothesis surface. The `evidence-relief-source-bound-annotations` change owns source/depth-bound evidence markers and explicitly excludes a parallel viewer; this proposal does not change that change's contract or scope.

SPZ v4's packed SH0 attributes total about 20 bytes per Gaussian before compression, plus file metadata. At 800,000 Gaussians, 8 MiB allows 10.49 bytes per Gaussian before header/table overhead. SPZ v4 compresses six attribute streams independently, so output size depends on each scene's distributions. `targetBytes`, opacity pruning, maximum count, and LOD are application policy, not `libspz::PackOptions`. SPZ v4 does not contain Spark's LOD tree; Spark's `.RAD` asset is a separate derived format.

## Goals / Non-Goals

**Goals:**

- Produce source-qualified, immutable SPZ scene candidates with measured size, quality, and provenance receipts.
- Qualify the installed Three.js `SPZLoader`/`GaussianSplat` path first as a minimal import/render baseline, then compare it with Spark and PlayCanvas Streamed SOG before selecting one product renderer.
- Keep original evidence, model-generated hypotheses, SPZ encodings, and renderer-specific LOD artifacts as separately identified layers.
- Execute encoding asynchronously through the existing PostgreSQL `analysis_jobs` ownership and worker lifecycle.
- Make each quality/size profile a measured policy, not an assumed splat-count guarantee.

**Non-Goals:**

- Repairing or promoting the current raw WebGPU renderer as the product path.
- Replacing `DepthReliefViewer`, the evidence annotation owner, the current multi-image reconstruction lane, or PostgreSQL task authority.
- Treating single-image completions or occluded regions as measured forensic evidence.
- Introducing a second durable queue authority, a new object store, or a parallel canonical scene database.
- Using Apple's SHARP or Flash3D in a product pipeline before the applicable code and weight licenses are cleared.
- Changing production schemas, starting services, downloading weights, or running GPU inference in this proposal phase.

## Decisions

### 1. Compare the renderer candidates before adoption

Qualify two genuinely distinct choices against the same rights-cleared fixture:

- **Three.js WebGPU:** use `SPZLoader` plus `GaussianSplat` with `WebGPURenderer`. The app already uses this renderer class for depth relief, and it can use WebGPU or force its WebGL2 backend. Reuse of the same renderer *technology* is feasible, but sharing the current viewer's actual canvas, renderer instance, lifecycle, scene, and camera is not implemented and must be demonstrated; the loader/render object do not provide that integration automatically. Verify decode, extension handling, sorting, picking, interaction with the mesh scene, disposal, browser support, memory, and measured GPU/frame behavior.
- **Spark WebGL2:** attach `SparkRenderer` to a Three.js `WebGLRenderer`, load SPZ with `SplatMesh`, and test its splat-specific controls and LOD path. Its published setup is a WebGL2 renderer integration; it cannot be dropped into the existing `WebGPURenderer` instance unchanged. Verify Three.js version compatibility, scene composition, picking, disposal, browser support, memory, and the same measurements.

Choose one renderer after the browser comparison; do not treat switching a flag as an equivalent configuration or layer full render engines together. PlayCanvas Streamed SOG is a separate spatially streamed delivery alternative, not an SPZ v4 feature or an assumed replacement for a small single-asset scene.

Keep `DepthReliefViewer` as the existing low-cost preview/fallback when no eligible Gaussian scene exists. Leave the current custom WebGPU renderer unpromoted until its sort, shaders, GPU timing, and visibility counters have independent browser proof.

### 2. Separate source SPZ from LOD derivatives

Store each source-qualified SPZ encoding as a derived artifact. If Spark LOD is generated, store its `.RAD` output as a separate rebuildable render projection with its own object key, hash, builder version, and source-SPZ hash. If PlayCanvas Streamed SOG is qualified, treat its `.sog` bundle and `lod-meta.json` as a distinct derived delivery format with its own manifest and provenance. Do not describe either renderer-specific derivative as an SPZ level or let it replace the source SPZ candidate. Preserve original uploaded photographs and measured multi-image reconstructions in their evidence/provenance lane.

### 3. Make byte budgets a measured application loop

Call Niantic `libspz` v4 with a pinned source revision and explicit `PackOptions` (`version`, coordinate system, `sh1Bits`, and `shRestBits`). Perform count pruning and opacity pruning before packing; treat those and `targetBytes` as application-level controls. Iteratively prune/quantize, encode, measure actual bytes, decode, and compare fixed camera views. A profile is eligible only when both its byte ceiling and its independently reviewed quality thresholds pass. If no candidate passes both, return `BUDGET_NOT_MET` with the best candidate receipt; never silently lower quality past the profile threshold.

Keep the original input and every promoted source revision addressable. Failed candidates remain non-canonical scratch artifacts; cleanup is a separate policy and must not delete originals or receipts.

### 4. Keep durable jobs and scene manifests in PostgreSQL

Extend the current `analysis_jobs` worker/job-type owner for SPZ processing if its schema permits. If a schema change is needed, propose and rehearse it in a disposable database before implementation; PostgreSQL remains the canonical job and manifest owner. RabbitMQ may provide a wake-up signal through the existing outbox pattern, but cannot own duplicate retry, completion, or identity state.

The SvelteKit request path validates authorization and input, creates/reuses an idempotent durable job, and returns status. A separate worker process runs native encoding off-request. Node-API is acceptable inside that worker if it uses the stable Node-API surface and has supported prebuilt artifacts, but its ABI guarantee does not remove OS/architecture builds or external-library compatibility obligations. A CLI/process boundary is an alternative if it proves simpler to deploy and isolate.

The PostgreSQL table `atlas_artifacts` and SeaweedFS bucket `atlas-artifacts` are separate resources with different roles: the former is a candidate metadata/lineage registry; the latter holds derived object bytes. The current Drizzle declaration has generic `content_hash` and `storage_location` fields but no explicit SPZ artifact type or bucket/key contract, so task 4.2 must first check whether the existing registry can represent the required immutable receipt or whether a reviewed schema extension is needed. Do not assume that the table and bucket are interchangeable or that the current table is already sufficient. Original evidence remains in the evidence bucket and is never moved as part of this change. Promotion/readback verifies the exact bucket and key, SPZ version, source revision/hash, output hash, and file size before the manifest marks an artifact eligible. S3 upload success alone is not proof. Existing objects under the artifact bucket's `evidence/` prefix are out of scope for migration or cleanup; inventory and object-level provenance review would be required before any future disposition.

### 5. Keep measured and inferred geometry visibly distinct

Each scene manifest records an origin class such as `MEASURED_MULTI_IMAGE`, `SINGLE_IMAGE_HYPOTHESIS`, or `SYNTHETIC_FIXTURE`, plus source IDs/revisions, exact hashes, camera/coordinate metadata, model/revision/license, and producer versions. The UI displays that class in the scene controls and asset details. Hypothesis splats, especially model-completed occlusions, cannot be presented as observed geometry or become evidence anchors. Source-image/depth annotations continue to use the existing evidence-relief contract.

### 6. Gate reconstruction models on rights and evidence quality

Apple's SHARP model license is research-only and excludes product development and commercial products/services. Flash3D's upstream code/weight licensing remains unresolved. Keep both out of production selection until rights are documented. A future commercially cleared single-image model is a separate adapter and must identify model/checkpoint revision and license in every receipt. Multi-image reconstruction remains a separate calibrated lane; the existing reconstruction endpoint is not silently repurposed for single-image inference.

### 7. Measure real costs and quality

Record separate metrics for encoding CPU wall time, worker peak memory, compressed bytes, bytes per splat, SH degree/bit settings, decode/load time, first-frame time, actual GPU render duration where available, rendered visible splats, frame latency, and quality comparisons. Do not report CPU submission duration as GPU time or input count as visibility. Profile the proposed 150K–300K preview, 350K–650K interactive, and 650K–1.1M inspect ranges on a frozen, rights-cleared cohort; treat the ranges as hypotheses until the resulting receipts justify them.

## Risks / Trade-offs

- [Scene distributions may not reach 8 MiB at the target count] → Gate on actual encoded bytes and quality; return `BUDGET_NOT_MET` instead of claiming a guaranteed count.
- [Spark/WebGL2 behavior may vary across browsers and GPUs] → Pin the version, test representative browser/device tiers, and retain the 2.5D viewer as a clearly labeled fallback.
- [`.RAD` and SPZ can be confused as equivalent deliverables] → Store different artifact types and source hashes; identify `.RAD` as a rebuildable Spark projection.
- [SPZ v4 output may not open in older clients] → Version-gate loaders and retain explicit v2/v3 read fixtures before enabling v4 delivery.
- [A native addon can fail on unsupported OS/architecture or external library ABI changes] → Build and test each supported target; ship the addon only inside the worker process and retain a CLI boundary as fallback.
- [Single-image synthesis can hallucinate occluded geometry] → Keep a visible hypothesis state separate from measured evidence and prohibit evidence anchoring to inferred surfaces.
- [Model or dataset terms may prevent product use] → Fail closed on unresolved code, model, and input-data rights.
- [Splat-count reduction can meet bytes while harming scene fidelity] → Require both a size gate and reviewed render-quality gate; preserve profile candidates and receipts.

## Migration Plan

1. Freeze a rights-cleared benchmark cohort and establish reference renders, source hashes, camera poses, and device/browser tiers.
2. Benchmark the current stack and a pinned Spark/Three combination without replacing the existing viewer.
3. Specify the PostgreSQL scene manifest and job linkage; rehearse any schema work only in a disposable database.
4. Build the SPZ worker and output receipt on fixtures, then compare encoded bytes and render quality at the proposed tiers.
5. Add read-only asset delivery and viewer selection behind an explicit eligible-manifest gate; leave originals and the relief viewer available.
6. Promote only after independent DB/object readback, browser screenshots/errors, performance receipts, and rights review pass. Roll back by disabling scene selection and routing users to the existing relief preview; retain all source objects and receipts.

## PlayCanvas Streamed SOG Research Input

The attached research note proposes SPZ v4 as a compact source asset and PlayCanvas Streamed SOG as an optional spatially streamed derivative and viewer path. Official PlayCanvas documentation confirms that SplatTransform reads SPZ v2–v4 and PLY, writes Streamed SOG using `lod-meta.json`, and supports explicit `-l`/`--tag-lod` inputs. Its documented decimation workflow first writes lower-detail PLY files, then bundles those files in a second command. LOD 0 is highest detail. SuperSplat's hosted publishing documentation says scenes over one million Gaussians are streamed progressively; that hosted behavior is not proof of an identical threshold or automatic behavior in a self-hosted SvelteKit integration.

Renderer source checks: Three.js documents that `GaussianSplat` requires `WebGPURenderer` and supports that renderer's WebGL2 fallback, and its r186 line includes SPZ v4 loader support. The loader skips vendor extensions, which remains a fixture admission constraint. Spark's published example constructs `THREE.WebGLRenderer`, attaches `SparkRenderer`, and loads SPZ with `SplatMesh`; the README describes its WebGL2 target. These references establish distinct viable integration paths, not application-level browser proof. See [Three.js GaussianSplat API](https://threejs.org/docs/pages/GaussianSplat.html), [Three.js WebGPURenderer guide](https://threejs.org/manual/pages/webgpurenderer), [SPZ v4 loader fix merged to r186](https://github.com/mrdoob/three.js/pull/34222), and [Spark repository and getting-started example](https://github.com/sparkjsdev/spark).

Local source audit of the current working tree (HEAD `d43b8950520c9cf41b8f8633db17b54c2f15e139`, with unrelated uncommitted edits present) searched `sveltekit-frontend/src`, `packages`, `scripts`, and `docs` outside Markdown, plus tracked filenames. It found no `lod-meta.json`, `splat-transform`, Streamed SOG, or PlayCanvas implementation/artifact references. `sveltekit-frontend/package.json` declares Three.js `0.186.1`; no direct PlayCanvas, SplatTransform, or Spark dependency was found. This bounded search does not establish absence from ignored files, transitive packages, or runtime caches.

Primary-source references checked 2026-11-03: [SplatTransform CLI and supported formats](https://github.com/playcanvas/splat-transform), [Generating Streamed SOG](https://developer.playcanvas.com/user-manual/splat-transform/streamed-sog/), [SuperSplat formats and hosted publishing behavior](https://github.com/playcanvas/developer-site/blob/main/docs/user-manual/supersplat/editor/import-export.md), and [SuperSplat overview](https://github.com/playcanvas/developer-site/blob/main/docs/user-manual/supersplat/index.md).

Still unverified for Parent Atlas and requiring a pinned package plus fixture/browser evidence:

- Reproducible local conversion and readback behavior at an immutable SplatTransform version.
- Streamed SOG's first-display byte budget, progressive replacement behavior, and browser/runtime compatibility when embedded in SvelteKit.
- The proposed four-tier bundle, 8 MiB first-display target, decode concurrency, and GPU-residency limits on the supported device cohort.

No SplatTransform command was run, package was installed, asset was generated, or renderer benchmarked for this audit.

## Rights and Source Admission

For this plan, the product path must be suitable for commercial deployment. Non-commercial research may be conducted only as a separate lane whose models, inputs, and outputs cannot be promoted into the product path without a fresh rights review. Case evidence is not an automatically eligible benchmark dataset; no source cohort is admitted until the rights and permissions for each input are recorded.

- Apple SHARP source code has a separate Apple software license, but its model weights and model derivatives are governed by `LICENSE_MODEL`, which limits them to research purposes and explicitly excludes product development and commercial products or services. Do not use SHARP in product generation.
- The Flash3D repository's current file listing has no `LICENSE` file, and its pretrained checkpoint is distributed separately without an identified weight license. Treat both code and weights as blocked for product use until the owner provides terms.
- Repository identity matters: the paper implementation discussed here is [`eldar/flash3d`](https://github.com/eldar/flash3d), whose README offers pretrained weights but whose current file listing has no license file. A separate [`FlashVision/Flash3D`](https://github.com/FlashVision/Flash3D) repository advertises an MIT code license; that does not establish rights for `eldar/flash3d`, its `re10k_v2` checkpoint, or the datasets used to train either model. Do not treat the shared project name as a rights grant.
- Niantic SPZ's repository identifies its library as MIT licensed. PlayCanvas documents SplatTransform as MIT licensed. These are tool-code licensing signals only; pinning, dependency notices, model/dataset rights, and the PlayCanvas runtime integration still require review before product promotion.
- No rights-cleared photographic benchmark cohort has been selected. Keep benchmark task 1.1 and cohort task 1.3 open; use synthetic fixtures only for format/contract checks until an authorized cohort is identified.

Primary references checked 2026-11-03 and rechecked 2026-11-04: [Apple SHARP model terms](https://github.com/apple-aiml-research/ml-sharp/blob/main/LICENSE_MODEL), [Apple SHARP code license](https://github.com/apple-aiml-research/ml-sharp/blob/main/LICENSE), [paper implementation `eldar/flash3d`](https://github.com/eldar/flash3d), [separate `FlashVision/Flash3D` repository and its code license](https://github.com/FlashVision/Flash3D), [Niantic SPZ repository](https://github.com/nianticlabs/spz), [PlayCanvas SplatTransform repository](https://github.com/playcanvas/splat-transform), and [PlayCanvas SuperSplat licensing and streaming notes](https://github.com/playcanvas/developer-site/blob/main/docs/user-manual/supersplat/index.md).

The local code search found no SHARP or Flash3D product runner, model integration, or dependency (the `sharp` dependency is the unrelated image-processing package). Their model rights therefore remain blocked from product execution in this change.

Workstation preflight on 2026-11-04 found no globally installed `splat-transform` command and no `.spz`, `.sog`, `.rad`, `.radc`, or `.ply` fixture under the app's source, public, or test directories. Task 2.5 was then verified using an ephemeral, exact-version `npm exec` of `@playcanvas/splat-transform@3.10.3` and synthetic scratch assets: PLY → SPZ v4 → PLY → four LOD PLYs → Streamed SOG. Readback returned `lodCounts: [1024, 512, 256, 102]`; hashes and byte counts are recorded in `.tmp/atlas/spz-sog-preflight-2026-11-04/receipt.json`. No dependency was added to the project, and no browser renderer, service, database, storage bucket, or case evidence was used. This closes the format-generation/readback fixture task only; it does not establish browser streaming, visual quality, performance, or product eligibility.

## Chat Analysis Flow (proposed 2026-11-04, not started)

Ornith is the reasoning layer. It does not process geometry, and it never receives raw splats or BVH nodes.

- **Worker (offline, `analysis_jobs`):** decode SPZ, build the BVH, compute bounds and marker-to-geometry relations, and write a bounded analysis artifact with a SHA-256. PostgreSQL holds job state and eligibility.
- **Web worker (browser):** ray picking and nearest-marker queries against a transferable BVH buffer. It keeps clicks responsive and is not the chat engine.
- **llama-server `:8090` (Ornith 1.5):** chat and tool calling, always `stream: true`, through the existing tool loop.
- **Tools:** typed, read-only, bounded JSON results such as `scene_nearest_markers(radius)`, `scene_ray_pick`, `scene_bounds`, and `evidence_card(id)`.
- **Transport:** SvelteKit 2 `+server.ts` routes (or tRPC for typed browser calls), with Zod validation, authorization through `locals`, and a stable GET shape on failure.
- **Output:** answers cite evidence IDs and source revisions. Inferred claims are labeled HYPOTHESIS. Raw model output and rejected citations are preserved.

Mastra is not used. The repo already has an orchestration owner, and adding a second orchestrator would duplicate it.

## Open Questions

- What fixed view set and quality measures (for example, PSNR/SSIM/LPIPS plus expert review) are acceptable for each profile?
- Which rights-cleared reconstruction model, if any, will supply single-image hypothesis scenes?
- What benchmark cohort may be used, and which source images have rights to train/evaluate/render?
- Does the current analysis worker need a new `analysis_jobs.job_type` constraint or only a TypeScript job-type extension?
- Is the 8 MiB target a per-scene cap including headers/LOD, or only the base SPZ artifact? This design assumes an explicit cap per artifact and separate accounting for `.RAD`.
- After the installed Three.js SPZ path is qualified, should the first larger-scene comparison prioritize Spark `.RAD` or PlayCanvas Streamed SOG delivery on the same fixture?
- Which browsers/devices are supported for WebGL2 and what minimum GPU-memory budget applies?
- What native packaging targets are required: Windows x64, Linux x64, or Linux ARM64, and does an N-API addon outperform a standalone worker executable enough to justify it?
