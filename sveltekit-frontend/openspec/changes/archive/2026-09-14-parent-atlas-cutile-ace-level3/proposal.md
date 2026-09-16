# Proposal: CUTILE-ACE-01 LEVEL 3 attempt (fused cuTile kernel)

## What

Attempt LEVEL 3 of `CUTILE-ACE-01` (`parent-atlas-gpu-mini-fabric-01`'s GPU-primitive-LEVEL
discipline): fuse `GlyphScoreV1` + `ResidencySortKeyV1` packing -- LEVEL 2's two separate, simple
CUDA kernels (`parent-atlas-cutile-ace-level2`, DRY_RUN_PROVEN) -- into a single `cuda::tiles`
tile-programming-model kernel, in WSL2 where a real `cuda_tile.h` API exists (unlike this dev
host's Windows-native CUDA 13.0 toolkit, whose `cuda_tile.h` is a 60-line compiler-intrinsic stub).

## Why

`CUTILE-ACE-01` LEVEL 3 was the one substantial open item left after this session's earlier work
(BITFROST-SIM-01, SOM-CACHE-01, BITFROST-L2-01, CUTILE-ACE-01 LEVEL 1+2, all archived 2026-09-14).
The prior handoff document
(`next_steps/active/2026-09-14_gpu-mini-fabric-cutile-level3-and-tests.md`) recorded a finding that
WSL2's `atlas-rapids-cu13` conda environment ships a genuine 4064-line `cuda::tiles` C++20 API and
recommended attempting LEVEL 3 there. This change is that attempt.

## Result

**BLOCKED_TOOLCHAIN_VERSION_SKEW** -- not a simple stub-header problem this time, but a deeper and
more specific one. Full detail in `docs/reports/cutile-ace-level3-attempt-v1.json` and this
change's `tasks.md`. Summary:

- A real fused `cuda::tiles` kernel was written
  (`native/cutile-ace-level3/glyph_fused_tile.cu`) and its **C++ frontend compiles with zero
  errors** against WSL2's genuine CUDA 13.3 header, after finding and fixing 6 real API-usage
  errors via actual compiler diagnostics (not guessed) -- see tasks.md for the full list
  (`__tile_global__` vs `__global__`, `bid()` vs `blockIdx`, no `popcount` builtin, tile-code
  cannot call plain `__device__`/`__host__` helper functions, `constexpr` vs `__device__
  __constant__`).
- **Device-code generation is blocked**: the only `cuda_tile.h` header available (CUDA 13.3, from
  `atlas-rapids-cu13`) and the only `tileiras` Tile-IR backend compiler available anywhere on this
  WSL2 filesystem (CUDA 13.2, from the separate `atlas-cutile-cu132` pip venv) are cross-version
  incompatible. Isolated via manual pipeline reconstruction (bypassing nvcc's own driver logic):
  the `.tilebc` intermediate bytecode CUDA 13.3's `cicc` produces encodes the target GPU
  architecture in a form ("86") that CUDA 13.2's `tileiras` rejects outright as invalid --
  regardless of which CLI flag spelling is used (`-arch=sm_86` and the corrected
  `--gpu-name=sm_86` both fail identically against the real generated `.tilebc`, even though
  `sm_86` is confirmed present in `tileiras`' own embedded architecture table).
- This corrects and sharpens the prior handoff note: "WSL2 has a real `cuda_tile.h`" was true but
  incomplete -- it does not by itself mean WSL2 can compile cuTile device code. The frontend
  (header + `cicc`) and backend (`tileiras`) are split across two independently-versioned,
  independently-installed environments that were never verified to interoperate before this
  attempt, and in fact do not.

## Non-goals

- Installing a new package/environment to fix the version skew -- flagged as an explicit next step
  requiring its own `DEPENDENCY-CAPABILITY-GUARD-01`-style justification, not done in this change.
- Runtime execution or exact-match verification of the fused kernel against the CPU oracle --
  moot until a matched-version toolchain produces a binary.
