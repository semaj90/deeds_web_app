## Why

`parent-atlas-gpu-mini-fabric-01` staged `BITFROST-L2-01` (section 10) as the last item in its
proving-ground sequence, explicitly gated on `AtlasAceResidencyV1`'s logical residency policy being
proven first — that gate is now closed (`parent-atlas-bitfrost-sim-01`, archived, real PASS with
lift 0.53425). This change runs the actual CUDA `cudaAccessPropertyPersisting` L2 set-aside
benchmark for the HOT tier that `BITFROST-L2-01` names, on real hardware, honestly accounting for
this host's live GPU contention (verified at proposal time: only 328MB free VRAM on the shared RTX
3060 Ti, with `llama-server.exe` actively holding the rest for the loaded chat model).

## What Changes

- Build a standalone CUDA microbenchmark (matching `ACE-RADIX-01`'s existing convention: no
  Node/N-API bindings, no dependency on the fragile `simd-bridge/cpp/binding.cc`, JSON-line output)
  that measures whether `cudaAccessPropertyPersisting` L2 set-aside for a small "HOT tier" buffer
  measurably reduces repeated-read latency versus the same access pattern with no persistence
  policy (normal/streaming access).
- Query `cudaDevAttrMaxPersistingL2CacheSize` live and size the benchmark's buffers to fit safely
  within both that device limit and this host's actual current free VRAM headroom — never a
  hardcoded buffer size assumed safe.
- Record a `GpuContentionSnapshotV1` (free/total VRAM, other GPU processes present) alongside the
  benchmark result, since this device is shared and a controlled, isolated benchmark is not
  possible here (unlike `ACE-RADIX-01`'s determinism-only gate, this benchmark's raw magnitude is
  measurement, not a hard pass/fail correctness claim).
- Report the measured persisting-vs-normal latency lift as characterization data (following this
  repo's established Status Language: `DRY_RUN_PROVEN` for a working, safe, real measurement —
  never "production-ready" from a benchmark run on one contended host).

## Capabilities

### New Capabilities
- `atlas-bitfrost-l2-persistence-benchmark`: the CUDA L2 set-aside benchmark contract — device-limit-
  aware buffer sizing, contention-snapshot recording, and the persisting-vs-normal measurement.

### Modified Capabilities
(none)

## Impact

- New standalone CUDA source under `native/bitfrost-l2-01/` (mirrors `native/ace-radix-01/`'s
  existing layout and build convention — direct `nvcc` invocation, no CMake/node-gyp target).
- No production code path touched. No canonical Postgres/Qdrant/Redis/Neo4j data touched.
- Runs on the Windows-native CUDA 13.0 toolkit (same environment `ACE-RADIX-01`'s CUB oracle used),
  kept deliberately separate from the WSL2 `atlas-rapids-cu13` RAPIDS environment per root
  CLAUDE.md's "keep the three environments separate" rule.
