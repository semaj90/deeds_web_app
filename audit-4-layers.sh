#!/bin/bash

echo "════════════════════════════════════════════════════════════════"
echo "4 Missing Visibility Layers — Quick Audit Report"
echo "════════════════════════════════════════════════════════════════"
echo

echo "LAYER 1: Packet Contract Layer"
echo "─────────────────────────────────────────────────────────────"
echo "Checking adapters for envelope wiring..."
for adapter in qdrant neo4j valkey postgres; do
  if [ -f "packages/parent-atlas/src/adapters/$adapter.ts" ]; then
    count=$(grep -c "createEnvelopeFromRow\|bitfrostKey" "packages/parent-atlas/src/adapters/$adapter.ts" 2>/dev/null || echo 0)
    if [ "$count" -gt 0 ]; then
      echo "  ✅ $adapter.ts — found canonical bridge usage ($count lines)"
    else
      echo "  ❌ $adapter.ts — NO canonical bridge usage (needs Layer 1)"
    fi
  else
    echo "  ❓ $adapter.ts — file not found"
  fi
done
echo

echo "LAYER 2: RPC/Transport Layer"
echo "─────────────────────────────────────────────────────────────"
echo "Checking for serialization telemetry..."
for target in grpc/embedding-client.ts grpc/retrieval-client.ts; do
  if [ -f "sveltekit-frontend/src/lib/server/$target" ]; then
    count=$(grep -c "encode\|decode\|protobuf\|marshal" "sveltekit-frontend/src/lib/server/$target" 2>/dev/null || echo 0)
    if [ "$count" -gt 0 ]; then
      echo "  ✅ $target — has some serialization logic ($count mentions)"
    else
      echo "  ❌ $target — NO serialization telemetry (needs Layer 2)"
    fi
  fi
done
echo

echo "LAYER 3: Resource Layer (GPU)"
echo "─────────────────────────────────────────────────────────────"
echo "Checking for GPU kernel telemetry..."
gpu_files="libtorch-bridge.ts simdjson-bridge.ts"
for file in $gpu_files; do
  if [ -f "sveltekit-frontend/src/lib/server/gpu/$file" ]; then
    kernel_count=$(grep -c "kernel\|cuda_stream" "sveltekit-frontend/src/lib/server/gpu/$file" 2>/dev/null || echo 0)
    if [ "$kernel_count" -gt 0 ]; then
      echo "  ✅ $file — GPU metrics mentioned ($kernel_count lines)"
    else
      echo "  ❌ $file — NO kernel-level telemetry (needs Layer 3)"
    fi
  fi
done
echo

echo "LAYER 4: Packet-Centric Provenance"
echo "─────────────────────────────────────────────────────────────"
echo "Checking for packet_id/feature_id tracking..."
telemetry_file="packages/atlas-core/src/telemetry/acp-mcp-telemetry.ts"
if [ -f "$telemetry_file" ]; then
  packet_mentions=$(grep -c "packet_id\|feature_id\|som_cell" "$telemetry_file" 2>/dev/null || echo 0)
  if [ "$packet_mentions" -gt 0 ]; then
    echo "  ✅ acp-mcp-telemetry.ts — packet tracking present ($packet_mentions lines)"
  else
    echo "  ❌ acp-mcp-telemetry.ts — NO packet_id/feature_id/som_cell (needs Layer 4)"
  fi
fi
echo

echo "════════════════════════════════════════════════════════════════"
echo "Summary: Run these commands to locate exact gaps"
echo "════════════════════════════════════════════════════════════════"
echo

echo "Layer 1 (Adapters):"
echo '  rg -n "createEnvelopeFromRow|bitfrostKey" packages/parent-atlas/src/adapters/'
echo

echo "Layer 2 (Serialization):"
echo '  rg -n "encode|decode|protobuf" sveltekit-frontend/src/lib/server/grpc/'
echo

echo "Layer 3 (GPU Kernels):"
echo '  rg -n "cuda_stream|kernel.*duration|GPU.*telemetry" sveltekit-frontend/src/lib/server/gpu/'
echo

echo "Layer 4 (Packet Provenance):"
echo '  rg -n "packet_id|feature_id|som_cell" packages/atlas-core/src/telemetry/'
echo

