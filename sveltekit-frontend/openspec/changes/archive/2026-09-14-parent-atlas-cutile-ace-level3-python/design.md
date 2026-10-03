# Design: CUTILE-ACE-01 LEVEL 3 via Python cuda.tile

## Approach

Same fusion target as the C++ attempt: `GlyphScoreV1` scoring + `ResidencySortKeyV1` packing in
one `@ct.kernel`. Same input contract (LEVEL 2's existing 16-byte glyph binary fixtures, no new
fixture format) and same gate (exact match against `scripts/atlas/ace-radix-01/glyph-score-v1.mjs`'s
CPU oracle and `generateAceRadix01FixtureV1()`'s `packedKeys`).

## Decision 1: tile-space partitioned load/store, not flat-pointer-plus-mask

The C++ `cuda_tile.h` header's model is flat-pointer + `iota()` + mask (closer to raw CUDA). The
Python `cuda.tile` API's model is different: `ct.load(array, index, shape)` treats the array as
pre-partitioned into a grid of fixed-size tiles, and `ct.bid(0)` selects which tile-space block
this kernel invocation handles -- boundary padding is handled by `padding_mode` rather than an
explicit mask tile. This is a genuinely different (higher-level) programming model, discovered
empirically via real `TileTypeError` messages (see tasks.md 2.x), not assumed transferable from
the C++ header's own idioms.

## Decision 2: signed-int32 division workaround, not a library patch

`ct.floordiv` on `uint32`-dtype tiles produces a real compiler backend error on this build
(`'cuda_tile.divi' op rounding mode 'negative_inf' is not allowed with 'unsigned' flag`) --
apparently an unimplemented/unsupported codegen path for unsigned floor-division specifically, not
a usage mistake. Since every value dividing through this formula (`pagerankQuantized`, `recency`)
is non-negative by construction (they come from `uint16` glyph fields), truncating division and
floor division are mathematically identical for this input domain -- so the workaround (cast to
`int32`, divide, cast back to `uint64`) produces bit-identical results to what unsigned floor
division would produce, without depending on a compiler behavior that doesn't currently work.

## Decision 3: this result stands alongside, not instead of, the C++ finding

The `parent-atlas-cutile-ace-level3` (C++) change's toolchain-version-skew finding remains
recorded and true -- it is not deleted, retracted, or edited in light of this success. Two
different findings coexist: (1) this specific dev environment's CUDA-13.3-header +
CUDA-13.2-tileiras combination is genuinely broken for the C++ `cuda_tile.h` path, and (2) the
Python `cuda.tile` package in the same overall `atlas-cutile-cu132` venv works because it ships
its own internally-consistent compiler pair, sidestepping the mixed-version problem entirely
rather than fixing it. A future attempt at the C++ path (e.g. after installing a matched
`tileiras`) would be a distinct, still-open piece of work.

## Non-goals

- Performance/latency benchmarking of the fused kernel.
- Backporting this Python kernel's logic into the C++ `.cu` file, or vice versa -- the two source
  files are independent artifacts of two independent (one blocked, one successful) attempts at the
  same specification.
