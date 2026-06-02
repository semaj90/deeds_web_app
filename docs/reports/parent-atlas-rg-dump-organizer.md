# Parent Atlas RG Dump Organizer

Generated: 2026-06-02T02:01:34.420Z

## Inputs
- rg_turbovec: docs/reports/rg_turbovec.txt (undefined GB)
- rg_napi: docs/reports/rg_napi.txt (undefined GB)

## Summary
- raw bytes processed: 4331542258
- packets written: 50
- parsed transcript lines: 971419
- tracked sourceRefs: 20000
- featureId buckets: 2

## Primary Buckets
- rg_turbovec: packets=48, lines=941087, primaryFeature=search.qdrant_vector
- rg_napi: packets=2, lines=31668, primaryFeature=gpu.simd_bridge

## Example Packets
- rg_turbovec:chunk:0001 → search.qdrant_vector | undefined
- rg_turbovec:chunk:0002 → search.qdrant_vector | undefined
- rg_turbovec:chunk:0003 → search.qdrant_vector | undefined
- rg_napi:chunk:0001 → gpu.simd_bridge | undefined
- rg_napi:chunk:0002 → gpu.simd_bridge | undefined

## Notes
- The raw dumps are streamed, not loaded into memory.
- These packets are derived from text transcripts; simdjson remains reserved for JSON sidecars and atlas payloads.
- The canonical join spine remains sourceRef + feature_id.
