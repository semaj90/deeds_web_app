## 1. Prerequisites and audit

- [x] 1.1 Confirm `ACE-RADIX-01`'s CUB oracle (LEVEL 1) is still `DRY_RUN_PROVEN` before starting
      **Confirmed**: `docs/reports/ace-radix-01-results.json` → `overallVerdict: "DRY_RUN_PROVEN"`.
- [x] 1.2 Audit for any existing `GlyphScoreV1`/glyph-score formula before designing a new one
      (Duplication Prevention rule)
      **Confirmed clean**: `grep -in "glyphscore|glyph.score"` over `fixture-v1.mjs`,
      `fixture-v1.test.mjs`, all of `sveltekit-frontend/src`, and every archived change's
      `design.md`/`tasks.md` returned zero hits.
- [x] 1.3 Confirm `ResidencySortKeyV1`'s packing formula already exists as a CPU function in
      `fixture-v1.mjs` — reuse it as the oracle, do not re-derive
      **Confirmed**: `fixture-v1.mjs`'s `generateAceRadix01FixtureV1()` inline packing code
      (`packedKey = (tier<<56)|(lod<<48)|(utilityBucket<<40)|(recencyBucket<<32)|projectionOrdinal`).

## 2. GlyphScoreV1 CPU oracle

- [x] 2.1 Verify max possible `GlyphScoreV1` value stays well within `uint64`/JS-safe-integer range
      given the formula's weights and each field's declared bit-width bound
      **Verified**: max = 65535×4 + 65535×3 + 255×257×2 + 255×257×1 + 16×50 + 16×50 = **656,950**
      — well within `uint32` (4,294,967,295) and JS's safe-integer range.
- [x] 2.2 Add `computeGlyphScoreV1Reference()` to `scripts/atlas/ace-radix-01/` (reusing the
      existing glyph fixture, not a new one) implementing the exact formula from design.md
      Decision 1
      **Landed**: `scripts/atlas/ace-radix-01/glyph-score-v1.mjs` — named weight constants,
      `popcount16()` implemented explicitly, imports `generateAceRadix01FixtureV1` rather than
      building a new fixture.
- [x] 2.3 Unit test: regenerate scores twice for the same fixture, assert byte-identical output
      (determinism)
      **Verified live**: `node scripts/atlas/ace-radix-01/glyph-score-v1.test.mjs` — all 8 checks
      pass, including determinism at N=256/1000/4000 and a hand-computed spot check.
- [x] 2.4 Unit test: two glyphs differing only in `somCell`/`projectionOrdinal` produce identical
      scores
      **Verified live**: both isolation tests pass (same test run above). Also confirmed no
      regression in the pre-existing `fixture-v1.test.mjs` suite (5/5 still pass).

## 3. ResidencyKeyPackV1 GPU kernel + GlyphScoreV1 GPU kernel

- [x] 3.1 Write `native/cutile-ace-level2/glyph_kernels_bench.cu`: standalone, no Node/N-API
      bindings, matching `native/ace-radix-01/`/`native/bitfrost-l2-01/`'s convention
      **Landed**: `native/cutile-ace-level2/glyph_kernels_bench.cu`. Also needed a raw-glyph binary
      encoding not previously built — added `glyphsToBuffer()`/`glyphScoresToBuffer()` to
      `scripts/atlas/ace-radix-01/glyph-score-v1.mjs` (16-byte-per-glyph little-endian layout
      matching `PacketGlyphV1`'s own documented size) and
      `scripts/atlas/ace-radix-01/write-cutile-level2-fixtures.mjs` to write the `.bin` files —
      reuses `generateAceRadix01FixtureV1()`, does not build a new fixture generator.
- [x] 3.2 Implement the `GlyphScoreV1` GPU kernel — same named-constant weights as the CPU oracle
      **Landed**: `glyphScoreV1Kernel()`, weights as `__device__ __constant__` values with names
      matching the CPU oracle exactly (`GLYPH_SCORE_W_PAGERANK`, etc.). Uses `__popc()` for the
      featureBits/flags popcount terms.
- [x] 3.3 Implement the `ResidencySortKeyV1` GPU packing kernel — same formula as `fixture-v1.mjs`,
      computed from raw glyph fields
      **Landed**: `residencyKeyPackV1Kernel()` — identical shift/OR formula, reading raw
      `PackedGlyphInputV1` struct fields (never a pre-packed key as input).
- [x] 3.4 Build via `nvcc` directly (no CMake/node-gyp target)
      **Built**: `nvcc -arch=sm_86 -o glyph_kernels_bench.exe glyph_kernels_bench.cu`, same
      MSVC `cl.exe` 14.43.34808 PATH setup as `BITFROST-L2-01`. Compiled cleanly, zero warnings.

## 4. Exact-match verification (the LEVEL 2 gate)

- [x] 4.1 Run both GPU kernels against the same fixture(s) `fixture-v1.mjs` already generates
      (reuse existing fixture files under `scripts/atlas/ace-radix-01/fixtures/`, or regenerate via
      the existing generator — do not build new fixtures)
      **Landed**: `scripts/atlas/ace-radix-01/run-cutile-level2-bench.mjs` runs the `.exe` against
      all 3 existing `ACE-RADIX-01` fixture sizes (256, 1000, 4000).
- [x] 4.2 Verify `GlyphScoreV1`: GPU output exactly matches the CPU oracle (task 2.2) for every
      glyph, at multiple fixture sizes
      **Result: PASS at all 3 sizes** — `glyphScoreV1ExactMatch: true` for N=256, N=1000, N=4000
      (real runs on this host's RTX 3060 Ti, CUDA 13.0 toolkit, sm_86).
- [x] 4.3 Verify `ResidencySortKeyV1` GPU packing: GPU output exactly matches `fixture-v1.mjs`'s
      existing `packedKeys` output for every glyph, at multiple fixture sizes
      **Result: PASS at all 3 sizes** — `residencyKeyPackV1ExactMatch: true` for N=256, N=1000,
      N=4000, matching the SAME `packedKeys` `fixture-v1.mjs` already produces (not a second,
      independently-generated reference).
- [x] 4.4 Produce `docs/reports/cutile-ace-level2-results.json` with both exact-match verdicts,
      fixture sizes tested, and `RESULT: DRY_RUN_PROVEN` (or `FAIL` with the first mismatching
      glyph's fields, if any mismatch is found — do not silently retry or smooth over a failure)
      **Result: `docs/reports/cutile-ace-level2-results.json`** —
      `gate.all_exact_match: true`, `gate.RESULT: "DRY_RUN_PROVEN"`.

## 5. Documentation and handoff

- [x] 5.1 Update root CLAUDE.md's GPU-primitive-LEVEL-discipline section with this change's real
      result, per Status Language rules
- [x] 5.2 Confirm `CUTILE-ACE-01`'s LEVEL 3 gate (LEVEL 1 + LEVEL 2 both proven) is genuinely
      closed, or explicitly record which half failed
      **Both halves now real and passing**: LEVEL 1 = `ACE-RADIX-01`'s CUB oracle, `DRY_RUN_PROVEN`
      (pre-existing). LEVEL 2 = this change's `GlyphScoreV1` + `ResidencySortKeyV1`-GPU exact-match,
      `DRY_RUN_PROVEN` (this report). **`cutile_ace_01_level3_unblocked: true`** in the result
      JSON — but LEVEL 3 itself is NOT attempted here, and still requires a CUDA 13.2+ host with a
      real cuTile programming API per `ACE-RADIX-01`'s own finding (this dev host's native Windows
      CUDA 13.0 toolkit only ships a compiler-intrinsic stub). "Unblocked" means the prerequisite
      proofs are done, not that LEVEL 3 has been run or would necessarily pass.
- [x] 5.3 Do NOT attempt any cuTile code in this change — confirm it remains separately staged
      **Confirmed**: no cuTile code, no `__tile_builtin__`, no tile-programming-model code anywhere
      in this change. Both kernels are plain unfused CUDA (`__global__` functions with simple
      per-thread scalar work) — the LEVEL 2 scope this change committed to.
