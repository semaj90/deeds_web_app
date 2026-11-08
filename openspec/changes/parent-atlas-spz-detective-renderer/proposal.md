## Why

Parent Atlas has an experimental raw `.splat` WebGPU renderer whose sort pass, measurements, and shader loading are incomplete, while the evidence relief viewer is intentionally a single-image 2.5D preview. Detective Mode needs a source-qualified Gaussian scene path with honest size/quality gates and a maintained browser renderer; SPZ v4 supplies a suitable interchange format, but it does not itself provide LOD or a byte-budget guarantee.

## What Changes

- Add a revisioned scene-asset contract that records source identity, reconstruction provenance, encoder settings, byte counts, hashes, quality evidence, and synthetic-versus-measured classification.
- Add an offline SPZ v4 processing lane that runs outside SvelteKit request handlers and records durable state through the existing PostgreSQL `analysis_jobs` owner.
- Profile a maintained WebGL2 renderer, using Spark as the leading candidate, and keep `DepthReliefViewer` as the 2.5D preview/fallback.
- Store original evidence separately from derived SPZ and renderer-specific LOD artifacts; treat Spark `.RAD` files as rebuildable projections, not SPZ payloads or canonical truth.
- Gate preview, interactive, and inspect profiles on measured file size and rendered quality; the proposed splat-count ranges and 8 MiB target remain profiling inputs, not guarantees.
- Keep single-image or otherwise inferred geometry visibly marked as a hypothesis. Do not use SHARP or Flash3D in a product lane until both code and model-weight rights are confirmed.

## Capabilities

### New Capabilities
- `gaussian-splat-scene-rendering`: Source-qualified Gaussian scene assets, budgeted SPZ encoding, derived LOD delivery, and evidence/hypothesis separation in Detective Mode.

### Modified Capabilities

## Impact

- Browser scene surfaces: `src/lib/webgpu/gaussian-splat-renderer.ts`, `DepthReliefViewer.svelte`, and the crime-reconstruction/Detective Mode viewer.
- Backend: existing PostgreSQL analysis-job worker, SvelteKit job/status APIs, and SeaweedFS artifact storage.
- New native worker integration around Niantic libspz; deployment still requires separately built supported OS/architecture artifacts.
- No live database schema, service, storage bucket, or production model change is included in this proposal.
