# Tasks: CUTILE-ACE-01 LEVEL 3 attempt

## 1. Environment verification

- [x] 1.1 Verify WSL2 g++/nvcc toolchain availability (g++ 13.3.0, nvcc 13.3.73 confirmed live)
- [x] 1.2 Locate the real `cuda_tile.h` header and confirm it is not the 60-line stub
      (`/home/james/miniforge3/envs/atlas-rapids-cu13/targets/x86_64-linux/include/crt/cuda_tile.h`,
      4064 lines, real `cuda::tiles` C++20-concepts API)

## 2. Kernel authoring and frontend compilation (real errors found and fixed)

- [x] 2.1 Write `native/cutile-ace-level3/glyph_fused_tile.cu` -- a single `cuda::tiles` kernel
      fusing `GlyphScoreV1` scoring and `ResidencySortKeyV1` packing, reading LEVEL 2's existing
      16-byte glyph binary fixtures (no new fixture format)
- [x] 2.2 Fix: `__tile__` builtin operators cannot be called from a plain `__host__`/`__device__`
      helper function -- inlined the SWAR popcount algorithm via macro instead of a function
- [x] 2.3 Fix: `cuda::tiles` has no `popcount` builtin (confirmed via exhaustive grep against the
      full header) -- implemented standard SWAR bit-count manually using tile arithmetic operators
- [x] 2.4 Fix: the tile-kernel entry-point qualifier is `__tile_global__`, not `__global__`
      (confirmed via `host_defines.h`'s own macro definitions)
- [x] 2.5 Fix: `blockIdx`/`threadIdx`/`blockDim`/`gridDim` are inaccessible inside tile code --
      `cuda::tiles::bid()` (returns `uint3`) is the tile-native equivalent
- [x] 2.6 Fix: `__device__ __constant__` variables (LEVEL 2's weight-constant convention) cannot be
      referenced from tile code -- switched to `constexpr` compile-time literals
- [x] 2.7 Confirm zero remaining C++ frontend errors: `nvcc -std=c++20 -arch=sm_86 -enable-tile`
      reaches the `tileiras` backend invocation cleanly (all prior stages pass)

## 3. Backend blocker isolation (root-caused, not assumed)

- [x] 3.1 Observe first backend failure: `tileiras: not found` (missing from `atlas-rapids-cu13`'s
      PATH) -- located the only `tileiras` binary anywhere on this WSL2 filesystem, in the separate
      `atlas-cutile-cu132` pip venv (CUDA 13.2)
- [x] 3.2 Observe second failure with that binary on PATH: `error: invalid GPU architecture: 86`
- [x] 3.3 Confirm `tileiras` itself is functional standalone (`--version` succeeds, exit 0) --
      ruling out a broken/corrupt binary
- [x] 3.4 Confirm `sm_86` IS present in `tileiras`' own embedded architecture table
      (`strings tileiras | grep sm_86`)
- [x] 3.5 Discover the real CLI contract mismatch: `tileiras` uses an LLVM `cl::opt`-style parser
      requiring `--gpu-name=sm_86` (full spelling), not nvcc's default abbreviated `-arch=sm_86`
- [x] 3.6 Reconstruct nvcc's full internal build pipeline via `-dryrun` to isolate each stage
- [x] 3.7 Manually re-run the corrected `tileiras --gpu-name=sm_86` directly against the REAL
      `.tilebc` file CUDA 13.3's `cicc` produced for this kernel -- **still fails identically**,
      proving the issue is not a CLI flag-naming mismatch
- [x] 3.8 Root-cause conclusion: the `.tilebc` intermediate bytecode format itself carries a
      version-specific architecture encoding that CUDA 13.2's `tileiras` cannot parse, independent
      of any CLI flag -- a genuine Tile-IR version skew between the 13.3 frontend (header + `cicc`,
      only in `atlas-rapids-cu13`) and the 13.2 backend (`tileiras`, only in `atlas-cutile-cu132`)

## 4. Recording (per this repo's evidence-not-guessing discipline)

- [x] 4.1 Write `docs/reports/cutile-ace-level3-attempt-v1.json` with the full finding, including
      every real compile error fixed and the exact backend isolation trail
- [x] 4.2 Write this OpenSpec change (proposal.md, design.md, specs/, tasks.md) documenting the
      attempt as `BLOCKED_TOOLCHAIN_VERSION_SKEW`, not silently amending the archived LEVEL 2 change
- [x] 4.3 Update `next_steps/active/2026-09-14_gpu-mini-fabric-cutile-level3-and-tests.md` and
      root `CLAUDE.md` with the corrected, more specific finding (header presence != working
      toolchain)
- [x] 4.4 Explicitly flag as NOT done in this change: installing a matched-version `tileiras`
      package (requires its own `DEPENDENCY-CAPABILITY-GUARD-01` justification and first
      diagnosing an unrelated WSL2 `pip`/`C:/Program Files/...` path error hit while checking
      package availability)

## 5. Non-goals confirmed unattempted

- [x] 5.1 No new conda/pip environment created to route around the version skew
- [x] 5.2 No runtime execution or CPU-oracle exact-match verification attempted (moot -- no binary
      was ever produced)
- [x] 5.3 No package installation attempted in this change
