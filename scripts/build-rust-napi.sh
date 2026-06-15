#!/bin/bash

# Build Rust N-API crates and wire to SvelteKit
# Phase 2 integration: atlas_packet_parser + turbovec-napi + omni-bridge

set -e

echo "🦀 Building Rust N-API crates (Phase 2 integration)"
echo ""

RUST_CRATES=(
  "crates/atlas_packet_parser"
  "crates/turbovec-napi"
  "crates/omni-bridge"
  "simd-bridge/rust-simdjson"
)

for crate_dir in "${RUST_CRATES[@]}"; do
  crate_name=$(basename "$crate_dir")

  echo "📦 Building $crate_name..."

  cd "$crate_dir"

  # Check syntax
  cargo check

  # Build release
  cargo build --release

  cd - > /dev/null

  echo "✅ $crate_name built"
  echo ""
done

echo ""
echo "🎯 N-API binaries ready at:"
echo "  crates/atlas_packet_parser/target/release"
echo "  crates/turbovec-napi/target/release"
echo "  crates/omni-bridge/target/release"
echo "  simd-bridge/rust-simdjson/target/release"
echo ""
echo "Next: Wire to npm scripts in package.json"
