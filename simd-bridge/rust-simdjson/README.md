simd-bridge (napi-rs prototype)

Purpose
-------
This directory contains a minimal napi-rs prototype that exposes a fast JSON parse helper to Node.js using `simd-json` (with a `serde_json` fallback).

Build & test (Windows / Linux)
------------------------------
Prerequisites:
- Rust toolchain (stable)
- Node.js (16+)
- `npm` installed

Steps:

1. Build the native library (release):

```bash
# from this directory
cargo build --release
```

On success, the compiled shared library will appear under `target/release/` (e.g. `target/release/simd_bridge_rs.dll` on Windows or `target/release/libsisd_bridge_rs.so` on Linux). Depending on your Node loader, you may rename the output to `simd_bridge_rs.node` or use `napi-rs` build helpers.

2. Use via Node (example harness provided in `../simdtest/run_test.js`).

Notes
-----
- This is an initial prototype. For production use, wrap with a proper `package.json` and `npm` build hooks that run `cargo build --release` and emit a `.node` binary via `napi` conventions.
- The crate uses `simd-json` for faster parsing and falls back to `serde_json` on error.
- Next steps: add Rayon-based batch parsing, zero-copy buffer handoff, and a Node worker pool to parse many OpenCode cards in parallel.
