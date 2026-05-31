Run the simd-rs prototype test

1. Build the Rust crate:

```bash
# from repo root
cd simd-bridge/rust-simdjson
cargo build --release
```

2. Run the Node test harness:

```bash
node scripts/simdtest/run_test.js
```

If the native addon isn't found, the harness falls back to `JSON.parse` and prints a summary. To use the native addon from Node properly, produce a `.node` binary via the napi build conventions or require the appropriate platform shared library path shown by the harness.
