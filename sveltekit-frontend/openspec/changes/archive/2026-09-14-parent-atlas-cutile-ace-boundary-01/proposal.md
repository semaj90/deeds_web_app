# Proposal: CUTILE-ACE-BOUNDARY-01 -- explicit range proof for the LEVEL 3 division workaround

## What

Prove, with an explicit boundary-value fixture (not just seeded-random coverage), that the LEVEL 3
Python `cuda.tile` kernel's signed-int32-division workaround is mathematically safe for the real
admitted field contract, and simultaneously close the separately-recorded "CUDA boundary-value
tests not pursued" gap for LEVEL 2.

## Why

External review of the `parent-atlas-cutile-ace-level3-python` result (same day) correctly
identified a real gap: `glyph_fused_tile.py` casts `pagerankQuantized`/`recency` from `uint32` to
`int32` before dividing by 257 (working around a real `cuda.tile` backend limitation where
`ct.floordiv` rejects unsigned operands with a "rounding mode 'negative_inf' is not allowed with
'unsigned' flag" error). The prior comment justifying this ("all operands here are non-negative")
is true but incomplete -- a non-negative `uint32` value can still exceed `INT32_MAX` and wrap when
cast to `int32`. The fix needed an explicit range proof, not a plausibility comment.

## Result

**DRY_RUN_PROVEN.** The real field contract for both fields is `uint16` (max 65535) -- established
directly from `fixture-v1.mjs`'s own docstring ("sampled uniformly within its declared bit-width
bounds") and `native/cutile-ace-level2/glyph_kernels_bench.cu`'s `PackedGlyphInputV1` struct
declaring both fields `uint16_t`. 65535 is roughly 32,767 times smaller than `INT32_MAX`
(2147483647), so the cast can never overflow for any value either field is contractually permitted
to hold.

A 26-glyph explicit boundary fixture (`scripts/atlas/ace-radix-01/boundary-fixture-v1.mjs`) --
sweeping `pagerankQuantized`/`recency` through {0, 1, 256, 257, 258, 65535}, `featureBits`/`flags`
through their bit-pattern extremes, `lod`/`residency` through their `uint8` bounds,
`projectionOrdinal` through its `uint32` bounds, plus dedicated all-zero and all-max glyphs -- was
run through all 3 available lanes: the CPU oracle, LEVEL 2's CUDA C++ kernel, and LEVEL 3's Python
`cuda.tile` kernel. **All 3 lanes exactly match at every row**, including both extreme rows.

## Non-goals

- Reopening the CUDA-13.3/13.2 `tileiras` toolchain skew (`parent-atlas-cutile-ace-level3`) --
  deliberately left closed per this repo's own "close audit, recheck only if a matched toolchain
  appears" discipline.
- Latency/throughput comparison between LEVEL 2 and LEVEL 3 -- still not measured, still not
  claimed.
