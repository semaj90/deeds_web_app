# Tasks: CUTILE-ACE-01 LEVEL 3 via Python cuda.tile

## 1. Discover the alternate toolchain path

- [x] 1.1 After the C++ `cuda_tile.h` attempt hit a toolchain version skew, inspect
      `atlas-cutile-cu132`'s venv for a Python-native `cuda.tile` package rather than immediately
      attempting a `tileiras` package install
- [x] 1.2 Confirm `cuda.tile` (`cuda_tile==1.5.0`) is real and importable, with a documented API
      surface (`help()` output for every function used, unlike the C++ header's undocumented
      compiler-magic attributes)
- [x] 1.3 Confirm PyTorch 2.14.0+cu132 + CUDA are live in this venv, targeting the real
      RTX 3060 Ti (sm_86)

## 2. Prove the toolchain works at all (minimal smoke test before porting real logic)

- [x] 2.1 Write and run a minimal `@ct.kernel` elementwise-add test using PyTorch tensors as
      device buffers -- fixed 2 real API errors along the way:
      - `bid()` requires an explicit `axis` argument (not a C++-style `uint3` struct with `.x`)
      - `load`/`store` use tile-space-partitioned indexing (`index`, `shape`), not flat-pointer +
        mask -- a genuinely different (higher-level) programming model than the C++ header's
- [x] 2.2 Confirm the smoke test passes with exact match (`torch.allclose`, `max_abs_diff: 0.0`) on
      real hardware before proceeding to port the real kernel

## 3. Port the real fused kernel

- [x] 3.1 Write `native/cutile-ace-level3/glyph_fused_tile.py`, fusing `GlyphScoreV1` scoring and
      `ResidencySortKeyV1` packing into one `@ct.kernel`, reading LEVEL 2's existing 16-byte glyph
      fixtures (unpacked into SoA host tensors, same convention as the earlier C++ attempt)
- [x] 3.2 Implement the same SWAR popcount workaround as the C++ attempt (`cuda.tile` has no
      `popcount` builtin either -- confirmed by checking `dir(cuda.tile)`, matching the earlier
      finding)
- [x] 3.3 Fix a real backend codegen error: `ct.floordiv` on `uint32` tiles fails with
      `'cuda_tile.divi' op rounding mode 'negative_inf' is not allowed with 'unsigned' flag` --
      worked around by dividing as signed `int32` (values are always non-negative, so truncating
      and floor division are identical) then casting the result back to `uint64`
- [x] 3.4 Fix `store()`'s positional argument order (`store(array, index, tile)`, not
      `store(array, tile, index=...)`)

## 4. Verify against the CPU oracle at every fixture size

- [x] 4.1 Run against the N=256 fixture -- `DRY_RUN_PROVEN`, exact match on both score and
      packed-key outputs
- [x] 4.2 Run against the N=1000 fixture -- `DRY_RUN_PROVEN`
- [x] 4.3 Run against the N=4000 fixture -- `DRY_RUN_PROVEN`
- [x] 4.4 Write `docs/reports/cutile-ace-level3-results.json` recording the full result, the
      toolchain identity (`cuda_tile==1.5.0`, `torch==2.14.0+cu132`, RTX 3060 Ti sm_86), and every
      real error found and fixed while porting

## 5. Record the relationship to the superseded C++ attempt

- [x] 5.1 Write this OpenSpec change explicitly stating it supersedes, but does not retract or
      edit, `parent-atlas-cutile-ace-level3`'s C++ toolchain-version-skew finding -- both are true,
      independent findings about this environment
- [x] 5.2 Explicitly record what remains unproven: fusion performance benefit (only correctness is
      proven here) and the C++ path's toolchain fix (still open, now lower priority since the
      Python path already meets the gate)
