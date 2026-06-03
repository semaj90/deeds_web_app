# NAPI-RS / Rust Bridge & Production Native Layer Roadmap

Date: 2026-05-31
Author: automated roadmap (paired)

Goals
- Replace current C++ N-API hotspot areas with a Rust-based napi-rs layer to enable safe multi-threaded parsing and native workers.
- Integrate simdjson parsing into OpenCode ingestion to speed up parsing large `.opencode/cards/*` batches.
- Provide a unified production base image that shares CUDA / LibTorch / cuBLAS runtimes across services to avoid ABI/DLL drift and reduce VRAM duplication.

Milestones

1) simdjson integration (OpenCode ingestion)
- Replace Node `JSON.parse` ingestion path with `fastJsonParse` wrapper (existing simdjson bridge) as a first step.
- Benchmark inputs: run batch parse (n=9k cards) and measure CPU/time vs JSON.parse.
- Add a small wrapper `lib/ingest/fast-parse.js` that exposes `parseBatch(strings: string[]) => Array<object>`.
- Validate: write each parsed object directly into Postgres `parent_atlas_records.payload` using prepared COPY or `pg-copy-streams` to benefit PG18 JSONB optimizations.

2) Prototype napi-rs Rust N-API bridge
- Create `simd-bridge-rs/` cargo workspace with a napi-rs crate exposing:
  - `parse_batch(views: ArrayBuffer[]) -> Array<String>` (zero-copy) or `parse_batch_strings(strings: string[]) -> JsArray`.
  - `compute_centroids(batch_vectors: Float32Array[], k: usize) -> { centroids: Float32Array[], assignments: Uint32Array }` (via Rayon + ndarray)
- Use `simd-json` crate for parsing and `rayon` for parallelism.
- Provide an async background worker API using Tokio (spawn blocking worker threads that return via Promise).
- Unit tests: `cargo test` + Node-side harness `npm run test:simd-rs` to validate interoperability.

3) Zero-copy memory sharing and GPU handoff
- Agree on ABI: use `Float32Array` / `ArrayBuffer` typed buffers to pass embeddings from Node → Rust → Cuda (via shared host-mapped buffers or pinned memory) for autoencoder / SOM training.
- Prototype a small end-to-end: Node reads raw JSONB, Rust extracts embedding arrays, hands over buffers to the existing `tensorrt_bridge.node` (or a Rust CUDA shim) without copying.

4) Unified Docker base image
- Create `docker/native-base:cuda-13.0-libtorch` based on `nvidia/cuda:13.0` with preinstalled:
  - LibTorch (CUDA 13.0 build)
  - libsimdjson.so (release build)
  - libcuvs.so (if needed)
  - tensorrt_bridge dependencies
- Rebuild services to link to system libs (Go microservices, Node napi-rs addon, bifrost proxy) to avoid multiple copies of the same shared objects.
- CI: add `build-native-base` pipeline job that produces the base image and pushes to the private registry.

5) Rollout plan (safe by default)
- Stage 0: Benchmark current parsing and ingestion performance (baseline metrics).
- Stage 1: Integrate `fastJsonParse` JS wrapper (no native change) to get immediate parse speedups.
- Stage 2: Deploy napi-rs prototype to a canary worker (use feature-flagged endpoint) and compare performance/resilience.
- Stage 3: Replace ingestion path and enable zero-copy flows for heavy offline pipelines (SOM/KMeans/autoencoder).
- Stage 4: Build and test unified base image in staging, validate native addon loading and TensorRT runs.
- Stage 5: Promote to production with traffic gating and health checks.

Testing & Observability
- Add microbench harnesses under `scripts/bench/`:
  - `bench/parse_benchmark.js` for JSON.parse vs simdjson (node native wrapper)
  - `bench/rust_napi_roundtrip.js` for napi-rs latency
- Add telemetry traces for parse latency, worker queue times, and GPU allocation metrics.

Risks & Mitigations
- ABI / LibTorch mismatch: pin and document exact LibTorch + CUDA versions in the base image; include an automated `smoke_gpu` health check.
- Windows dev differences (WSL2 vs Docker): document dev-run steps and ensure base image supports CUDA or provide CPU-only fallback for dev.
- Native crashes: keep the JS fallback `JSON.parse` path and a small rate-limited kill-switch to revert to safe parsing.

Deliverables
- `simd-bridge-rs/` prototype crate + Node test harness
- `lib/ingest/fast-parse.js` wrapper and migration PR for OpenCode ingestion
- `docker/native-base:cuda-13.0-libtorch` build pipeline and Dockerfile
- Benchmarks and CI smoke tests

Estimated timeline
- Proof-of-concept simdjson JS integration: 1-2 days
- napi-rs prototype (parse_batch + tests): 4-7 days
- Zero-copy & GPU handoff prototype: 3-5 days (depends on LibTorch ABI complexity)
- Containerization + CI: 2-3 days

---

If you want, I can scaffold `simd-bridge-rs/` with a minimal `napi-rs` crate and a `bench/parse_benchmark.js` harness next. Which would you prefer I do first: (A) add the JS `fastJsonParse` wrapper and migrate OpenCode ingestion (fast wins), or (B) scaffold the Rust `napi-rs` prototype (longer, higher ROI)?
