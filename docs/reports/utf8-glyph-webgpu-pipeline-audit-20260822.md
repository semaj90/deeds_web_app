# UTF-8 / glyph / WebGPU pipeline audit — 2026-08-22

## Result

The active AST sidecar boundary already preserves source bytes and the latest
LF-to-CRLF adapter is covered by Python regression tests. A separate active
UTF-16 accounting defect existed in the Parent Atlas retrieval package:
`simdjson-bridge.ts` used JavaScript string length and a `length * 2` cache-size
estimate for byte-budget decisions. That was corrected to use exact UTF-8 byte
length for the OOM limit, native-path threshold, telemetry, cache sizing, and
cache-key sampling.

## Findings

- **Fixed:** JSON transport accounting now uses UTF-8 bytes, not UTF-16 code
  units.
- **Fixed:** SIMD cache identity samples UTF-8 transport bytes, so surrogate
  pairs and multibyte glyphs do not shift the sampled coordinate.
- **Existing:** NES/CHR97 glyphs, sprite/LOD artifacts, and WebGPU visualization
  paths are derived presentation artifacts. No active path was found that
  should make them canonical identity or semantic embedding owners.
- **Gap:** the historical CHR97 design document still contains many `384`
  examples. A prominent alignment note was added; the examples remain
  historical and require a later documentation-only cleanup if the document is
  retained as an active spec.
- **Open:** WebGPU texture upload and Canvas `ImageData` pixel parity are not
  proven by a live GPU readback. A CPU staging contract now covers explicit
  RGBA order, 256-byte row stride, LOD, UTF-8 label bytes, and source-length
  rejection; no live GPU or canonical-store write is authorized by this report.
- **Open:** `N64TextureLODSystem` remains a residency scaffold: its request
  queue does not yet materialize the selected LOD texture or prove a swap and
  readback, so it is not NES memory-swap proof.

## Status

| Area | Status |
|---|---|
| UTF-8 byte accounting in SIMD bridge | WIRED / fixture test added |
| AST source-byte preservation | PROVEN on byte fixtures; corpus parity still blocked |
| Glyph/CHR97 derived identity boundary | CREATED in docs; runtime promotion not proven |
| WebGPU texture row/pixel mapping | WIRED / CPU FIXTURE-PROVEN; GPU READBACK NOT PROVEN |
| NES LOD/memory-swap runtime | WIRED / CPU-GUARDED; GPU SWAP READBACK NOT PROVEN |

The new `texture-layout-v1` contract is wired into the existing WebGPU texture
upload path. It pads rows before `writeTexture` and rejects compressed bytes
that are incorrectly labeled `rgba8unorm`. Its focused tests pass `3/3`, and
the SvelteKit TypeScript check passes with no diagnostics. The LOD request path
now rejects invalid, duplicate, and over-budget targets before queueing, stages
uncompressed RGBA8 rows, and updates resident state only after the WebGPU upload
call. Compressed assets remain blocked until a decoder exists. The combined
layout/residency/pixel-coordinate fixture passes `6/6`; GPU readback remains
unproven.
Eviction accounting now subtracts actual resident payload bytes rather than the
display `sizeKB` estimate.

The packet LOD token estimator now counts Unicode code points instead of UTF-16
code units, preventing astral glyphs from being double-counted in budget gates.
The combined UTF-8/texture/LOD/packet-LOD focused validation passes `7/7`.

The browser `webgpu-gemma-client.js` audit also found a syntactically invalid
demo file and a simulated 2048-dimensional vector labeled as a Gemma embedding.
It now parses, retains text/demo behavior, reports no embedding representation,
and rejects embedding requests with an explicit non-canonical error. No active
server retrieval or indexing import was found; browser WebGPU inference remains
demo-only and cannot enter the `semantic_768` lane.

The follow-up sweep repaired UTF-16-derived cache keys in the browser embedding
and client-cache paths by hashing UTF-8 bytes. It also changed the SOM
error-analysis CPU fallback to consume UTF-8 bytes, matching the existing
WebGPU shader input. These are derived/cache and CPU-GPU parity fixes; the
128-dimensional SOM error feature remains non-canonical.

The active `dimensional-tensor-store.ts` upload path also declared an aligned
`bytesPerRow` while passing tightly packed RGBA32F data. It now stages each row
into the declared stride and zero-fills incomplete final texels before
`writeTexture`. This fixes the CPU-side upload layout contract; live GPU
readback and resident tensor proof remain unproven.

The GPU orchestration audit found an implicit `nomic-embed-text` default on the
vector-embedding dispatch path. That default now selects `embeddinggemma:latest`
and sends explicit `semantic_768` / `768` metadata. Nomic remains an explicit
compatibility fallback only. The `/api/v1/embeddings` endpoint reachability and
response-dimension readback remain separate unproven runtime gates.

The shared `embedding-client.ts` fallback chain now rejects cached and
transport-returned vectors unless the complete batch is finite and exactly
`semantic_768` / `768` dimensions. Invalid results cannot be cached or
returned downstream. The ONNX integration suite was attempted but blocked
during module collection by the missing required `ROTORQUANT_MODEL_PATH`
environment variable; no test assertion ran.

The retrieval package focused tests pass `9/9` (UTF-8 bridge and crossencoder
fallback/contract tests). The package-wide TypeScript check remains blocked by
pre-existing SvelteKit alias resolution and stale export/dependency errors in
the retrieval package; the syntax defects in its crossencoder fixture were
repaired during this audit.

No Postgres, Qdrant, Neo4j, Valkey, Docker-volume, or GPU index mutation was
performed.
