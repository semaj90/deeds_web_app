# Atlas Video WASM Frame Preview

Status: implemented as a browser-side preview helper; not a durable analysis pipeline.

## What is wired

- A standalone, dependency-free Rust crate builds to `wasm32-unknown-unknown`.
- SvelteKit runs the build and compiled-module smoke check before `dev` and `build`.
- The evidence video viewer can analyze the currently displayed frame on user request.
- The module computes a 64-bit dHash from a 9x8 grayscale sample and converts the frame timestamp to the FilmCraft integer tick timebase.
- The viewer labels output as local preview only. It does not persist hashes or alter source evidence.

## Verification

- Rust unit tests: 4 passed.
- Client Vitest: 3 passed.
- Svelte compiler check for `EvidenceViewModal.svelte`: 0 warnings.
- Release WASM build: passed; artifact size 15,686 bytes.
- Compiled WASM smoke: passed ABI, 1-second tick conversion, XOR/popcount and gradient dHash checks.
- Scoped `git diff --check`: passed (only Git line-ending notices).

## Boundaries and next work

- Generated WASM is ignored by Git and is recreated by the package `predev`/`prebuild` scripts. A machine building the app needs Rust and the `wasm32-unknown-unknown` target.
- This is not object detection, face recognition, scene-cut detection, transcription, keyframe persistence, or source-grounded analysis.
- Durable video analysis still needs admission into the existing leased analysis worker, bounded FFprobe/FFmpeg processing, revision-bound frame/transcript persistence, and independent storage readback.
- Browser frame sampling is blocked for cross-origin media without suitable CORS headers.
