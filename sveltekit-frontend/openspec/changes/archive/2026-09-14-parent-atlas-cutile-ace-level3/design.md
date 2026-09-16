# Design: CUTILE-ACE-01 LEVEL 3 attempt

## Approach

Port LEVEL 2's two kernels (`GlyphScoreV1`, `ResidencySortKeyV1` packing --
`native/cutile-ace-level2/glyph_kernels_bench.cu`) into a single `__tile_global__` kernel using
WSL2's real `cuda::tiles` C++20 API, reading the SAME 16-byte glyph binary fixtures LEVEL 2 already
uses (`scripts/atlas/ace-radix-01/write-cutile-level2-fixtures.mjs`) -- no new fixture generation.

Gate criterion (unchanged from LEVEL 1/2's own precedent): exact-match determinism against the
SAME CPU oracles already used (`scripts/atlas/ace-radix-01/glyph-score-v1.mjs`,
`generateAceRadix01FixtureV1()`'s `packedKeys`). A passing compile alone is explicitly NOT treated
as proof, per this repo's Status Language rules and the handoff document's own step 4.

## Decision 1: structure-of-arrays input, not the LEVEL 2 packed struct

LEVEL 2's `PackedGlyphInputV1` struct (16-byte `#pragma pack`) is read via a raw `fread()` into an
array-of-structs on the host, then dereferenced field-by-field per GPU thread. `cuda::tiles`
kernels load contiguous per-field arrays via `load`/`load_masked` over pointer-tiles, which is
naturally structure-of-arrays. The wrapper harness unpacks the AoS binary fixture into SoA host
arrays before upload -- this is a harness-level adaptation, not a change to the fixture format or
the CPU oracle.

## Decision 2: real API discovery via compiler diagnostics, not documentation

No usage examples for `cuda::tiles` exist anywhere on this filesystem (searched exhaustively:
`find / -iname '*.cu' | xargs grep -l 'cuda::tiles'` returned zero hits), and the header itself
(4064 lines of C++20-concepts template metaprogramming with compiler-magic `__tile_builtin__`
attributes) is not self-documenting for a first-time user. The design decision here was to attempt
a plausible reconstruction based on the header's own type signatures, then iterate strictly off
real `nvcc` compiler error messages -- never guessing past what a diagnostic actually said. Six
real, distinct errors were found and fixed this way (see tasks.md 2.x). This is slower than working
from documentation but produces verified-correct usage rather than plausible-looking code of
unknown correctness.

## Decision 3: stop at the toolchain-version-skew blocker, do not attempt an environment fix inline

Once the C++ frontend compiled cleanly, the remaining blocker (`tileiras` CUDA-13.2-vs-13.3
version skew, see tasks.md 3.x for the full isolation trail) was root-caused as precisely as
possible using only read-only diagnostic commands (`strings`, manual pipeline reconstruction via
`nvcc -dryrun`, direct `tileiras` invocation) -- but installing a new package to fix it was
deliberately NOT attempted in this change. Per this repo's `DEPENDENCY-CAPABILITY-GUARD-01` rule,
a dependency mutation needs an explicit recorded justification
(CAPABILITY/CURRENT_OWNER/AVAILABLE/MINIMAL_NEW_DEPENDENCY) before being applied, and a separate,
unexplained WSL2 pip failure (`C:/Program Files/...: No such file or directory` on bare `pip index`
invocation) was hit when checking package availability -- diagnosing that is its own open item, not
something to paper over by working around it mid-investigation.

## Non-goals

- Building a second, independent RAPIDS or cuTile environment to route around the version skew --
  per this repo's existing "keep the three environments separate" rule
  (`atlas-rapids-cu13` / `atlas-cutile-cu132` / Windows-native CUDA 13.0), a fourth environment is
  not the answer; the two existing ones need to either be reconciled (matched frontend+backend
  versions) or one of them needs a compatible component added.
- Runtime correctness proof of the fused kernel's logic -- deferred entirely until a binary can be
  produced.
