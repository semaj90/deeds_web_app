# Tasks: CUTILE-ACE-BOUNDARY-01

## 1. Extract the reusable packing formula

- [x] 1.1 Extract `packGlyphKeyV1(glyph)` out of `generateAceRadix01FixtureV1()`'s inline loop
      logic in `scripts/atlas/ace-radix-01/fixture-v1.mjs`
- [x] 1.2 Verify behavior-preserving via `fixture-v1.test.mjs` (still passes: byte-identical
      regeneration at N=256/1000/4000, every field within declared bit-width bounds)

## 2. Establish the real field contract

- [x] 2.1 Confirm `pagerankQuantized`/`recency` are declared `uint16_t` in
      `native/cutile-ace-level2/glyph_kernels_bench.cu`'s `PackedGlyphInputV1` struct
- [x] 2.2 Confirm `fixture-v1.mjs`'s own docstring states fields are "sampled uniformly within
      its declared bit-width bounds" -- i.e. the uint16 bound is the intended contract, not an
      artifact of the random generator happening to stay small
- [x] 2.3 State the numeric relationship: 65535 (uint16 max) vs 2147483647 (INT32_MAX) -- the cast
      cannot overflow for any legally-held value

## 3. Build and run the explicit boundary fixture

- [x] 3.1 Write `scripts/atlas/ace-radix-01/boundary-fixture-v1.mjs` -- 26 glyphs covering
      pagerankQuantized/recency at {0, 1, 256, 257, 258, 65535}, featureBits/flags bit-pattern
      extremes, lod/residency uint8 bounds, projectionOrdinal uint32 bounds, an all-zero glyph,
      and an all-max glyph
- [x] 3.2 Generate the CPU oracle reference (scores + packed keys) for this fixture
- [x] 3.3 Run LEVEL 2's `native/cutile-ace-level2/glyph_kernels_bench.exe` against the fixture --
      `DRY_RUN_PROVEN`, exact match on both outputs at N=26
- [x] 3.4 Run LEVEL 3's `native/cutile-ace-level3/glyph_fused_tile.py` against the same fixture --
      `DRY_RUN_PROVEN`, exact match on both outputs at N=26

## 4. Record the result

- [x] 4.1 Write `docs/reports/cutile-ace-boundary-01-results.json` with the full field-contract
      justification and per-lane results
- [x] 4.2 Write this OpenSpec change (proposal.md, design.md, specs/, tasks.md)
- [x] 4.3 Update root `CLAUDE.md`'s LEVEL 3 section and the handoff `next_steps` doc to close both
      previously-recorded gaps this change addresses (the boundary-value test gap, and the
      unqualified "non-negative" comment)

## 5. Explicitly not attempted

- [x] 5.1 Did not reopen the CUDA-13.3/13.2 `tileiras` toolchain skew
- [x] 5.2 Did not measure or claim any LEVEL 2 vs LEVEL 3 performance difference
