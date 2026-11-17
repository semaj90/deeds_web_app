# TurboVec native export and bit-order alignment — 2026-11-13

## Scope

Validated the three CPU native add-ons that are relevant to this slice, checked their actual exports under the current Node runtime, reconciled TurboVec's MSB0 sign-bit packing with Atlas's LSB0 descriptor, and made the existing TurboVec package smoke command exercise dHash and Hamming search. No GPU lane, database, media worker, or production retrieval route was run.

## Finding and change

- Atlas's `BitsetSliceDescriptorV1` requires `LSB0`.
- `packages/atlas-native-core/include/turbovec_pack.hpp` emits sign-bit bytes in `MSB0` order (`1 << (7 - (index & 7))`). Its 2-bit and 4-bit quantized lanes are also packed high bits first. Endianness is a separate property.
- Added `convertPackedBitOrderV1()` to `sveltekit-frontend/src/lib/server/atlas/tensors/bitset-slice-descriptor-v1.ts`. It reverses each byte only when converting bit numbering, preserves logical bit indices, returns an owned copy, checks exact byte length, and rejects nonzero padding according to the source bit order.
- Added unit tests for the 128-bit boundary pattern and adversarial tail padding.
- Added `crates/turbovec-napi/test.mjs`, using the package's existing `npm test` script. The test requires dHash and Hamming exports to exist, verifies a known dHash, stable equal-distance order, typed-array subviews with nonzero byte offsets, and malformed input rejection.

## Native binary and ABI check

Runtime: Node `22.23.3`, Node module ABI `127`, N-API `10`, Windows x64.

The original `atlas_native_core.node`, TurboVec N-API binary, and Atlas packet parser N-API binary loaded successfully under this runtime. Their observed exports were:

- `atlas_native_core.node`: `assembleLodTextureBlockV1`, `asymmetricDot2Bit`, `asymmetricDot4Bit`, `bitset128JaccardSimilarity`, `detectRfcOrLanguage`, `packTurboVecMrl128`, `radixSortSomCandidateIndicesV1`, `scoreHamming128Batch`, `unpackPgvectorBinary768`.
- `turbovec-napi`: existing binary loaded, but did not export `computeDhash64` or `batchHammingSearchTopK`, although the current Rust source and generated JS/type wrapper declare them.
- `atlas-packet-parser`: `parseLargeJsonToMsgpack`.

Built the current `crates/turbovec-napi` source into the isolated target directory `C:\Users\james\AppData\Local\Temp\atlas-turbovec-native-proof-20261113`, loaded that binary, and confirmed all ten expected exports including dHash and Hamming. The verified build was copied to the existing ignored Windows x64 `.node` path so the package's existing wrapper now resolves the functions. The previous binary was preserved as `C:\Users\james\AppData\Local\Temp\atlas-turbovec-native-proof-20261113\turbovec-napi.prebuild.node`.

The TensorRT bridge was not loaded: it is a separate GPU-capable lane and remains subject to the repository's operator-controlled GPU gate.

## Exact verification

1. `node -e "...require the three native files and print process.versions plus Object.keys(addon)..."` returned Node `22.23.3`, module ABI `127`, N-API `10`; all three CPU add-ons loaded. The TurboVec binary lacked the two declared media exports.
2. `cargo build --release --locked --manifest-path crates/turbovec-napi/Cargo.toml --target-dir C:\Users\james\AppData\Local\Temp\atlas-turbovec-native-proof-20261113` exited 0: `Finished release profile [optimized] target(s) in 1m 04s`. Cargo reported four existing unused/dead-code warnings in `turbovec/src/search.rs` and `turbovec/src/lib.rs`.
3. Native adversarial probe against the isolated Rust build and existing C++ add-on: expected dHash was `ffffffffffffffff`; Hamming results were `[[0,0],[1,1],[3,1],[2,2]]`; typed subviews with nonzero byte offsets passed; 71-byte dHash input and 7-byte Hamming query were rejected. C++ output for set bits `{0,7,8,127}` was MSB0 bytes `81 80 00 ... 01`; converted Atlas LSB0 bytes were `81 01 00 ... 80`.
4. In `crates/turbovec-napi`, `npm test` exited 0 with `turbovec_native_smoke=PASS dhash=64-bit hamming=stable byteOffset=PASS invalid-length=PASS`.
5. In `sveltekit-frontend`, `npm exec -- vitest run src/lib/server/atlas/tensors/bitset-slice-descriptor-v1.spec.ts` passed 15/15 tests.
6. Scoped `git diff --check` passed for the two Atlas bitset files. Git only reported LF/CRLF normalization notices.

Worktree revision at verification: `eadae008484bcf5318071912afd830daa35e6743`. The generated `.node` file is ignored by Git; native source/wrapper edits already present in the shared worktree were preserved.

## Proof boundary

- **CREATED:** Explicit MSB0-to-LSB0 conversion and regression tests.
- **WIRED:** TurboVec package exports are now loadable through its existing wrapper; no new package or ABI was introduced.
- **PROVEN:** Current Node runtime loads the three CPU add-ons; the built TurboVec dHash/Hamming operations pass exact known-vector and adversarial checks; C++ TurboVec sign bits convert to Atlas LSB0; focused descriptor tests pass.
- **DONE:** No. This does not wire these operations into an authorized evidence retrieval or FFmpeg media worker. It does not prove video scene detection, PostgreSQL/SeaweedFS indexing, PyTorch ingestion, GPU parity, or end-to-end case authorization.

## Handoff

- `likely_cause`: The sign-bit byte order was implicit and incompatible between TurboVec's MSB0 producer and Atlas's LSB0 descriptor, while the installed TurboVec binary lagged its current Rust export declarations.
- `evidence`: `sveltekit-frontend/src/lib/server/atlas/tensors/bitset-slice-descriptor-v1.ts`; `packages/atlas-native-core/include/turbovec_pack.hpp`; `crates/turbovec-napi/src/lib.rs`; observed N-API exports; focused smoke results above.
- `patch_targets`: `sveltekit-frontend/src/lib/server/atlas/tensors/bitset-slice-descriptor-v1.ts`; `sveltekit-frontend/src/lib/server/atlas/tensors/bitset-slice-descriptor-v1.spec.ts`; `crates/turbovec-napi/test.mjs`; local ignored binary `crates/turbovec-napi/turbovec-napi.win32-x64-msvc.node`.
- `safe_next_command`: `rg -n "ingestVideoEvidence|extractAudioTrack|ffprobe|scene.?cut|keyframe|analysis_jobs|workflow_outbox" sveltekit-frontend/src/lib/server/features/evidence/video sveltekit-frontend/src/lib/server/queue sveltekit-frontend/src/routes/api/evidence/video`.
- `smoke_command`: `cd crates/turbovec-napi; npm test; cd ../../sveltekit-frontend; npm exec -- vitest run src/lib/server/atlas/tensors/bitset-slice-descriptor-v1.spec.ts`.
- `report_path`: `docs/reports/turbovec-native-bitorder-alignment-20261113.md`.
