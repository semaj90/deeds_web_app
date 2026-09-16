## Context

`parent-atlas-ace-radix-residency` built `PacketGlyphV1`/`ResidencySortKeyV1` (TypeScript contracts,
`sveltekit-frontend/src/lib/server/atlas/residency/packet-glyph-v1.ts`) and proved CUB radix-sort
determinism on already-packed keys (`ACE-RADIX-01`, `DRY_RUN_PROVEN`). It never built a GPU kernel
that computes the packing itself, or any glyph-scoring kernel — both were left as LEVEL 2 future
work, explicitly required before `CUTILE-ACE-01`'s LEVEL 3 fused challenger may be attempted (GPU-
primitive-LEVEL discipline: LEVEL 1 vendor primitives prove architecture, LEVEL 2 simple custom
CUDA proves a fusion opportunity exists, LEVEL 3 cuTile fuses what LEVEL 2 proved worth fusing — no
level skipped).

`ResidencySortKeyV1`'s packing formula already exists as a CPU function
(`scripts/atlas/ace-radix-01/fixture-v1.mjs`'s inline packing code, used to produce `ACE-RADIX-01`'s
fixture files) — this change's job for that half is only to compute the SAME formula on GPU and
prove exact agreement, not to design a new formula.

`GlyphScoreV1` has no existing formula anywhere in this repo (verified via `rg` across `src/`,
`scripts/`, and every archived change's `design.md`/`tasks.md`) — this change designs one fresh.

## Goals / Non-Goals

**Goals:**
- Design `GlyphScoreV1`: a new, pure-integer (no floating point) scoring formula over
  `PacketGlyphV1` fields, with a CPU oracle and a matching GPU kernel proven to agree exactly.
- Build the GPU-side computation of `ResidencySortKeyV1`'s existing packing formula, proven to
  exactly match `fixture-v1.mjs`'s existing CPU output.
- Keep both as simple, unfused, single-purpose kernels — explicitly not the LEVEL 3 fusion.

**Non-Goals:**
- Do not attempt cuTile in this change — LEVEL 3 (`score → key-pack → partition` fused) stays
  gated behind this change's own LEVEL 2 proof passing, per the parent roadmap.
- Do not change `PacketGlyphV1`/`ResidencySortKeyV1`'s field definitions or bit-width bounds.
- Do not wire either kernel into any production BitFrost/ACE code path — standalone proof only,
  matching `ACE-RADIX-01` and `BITFROST-L2-01`'s own explicit Non-Goals.
- Do not use `somCell` or `projectionOrdinal` as scoring inputs (see Decision 1) — both are
  explicitly non-canonical/non-utility fields per this repo's existing governance comments in
  `packet-glyph-v1.ts` (SOM is "never retrieval truth"; `projectionOrdinal` is "a non-canonical
  GPU-local coordinate, same treatment as `gpuNodeId`").

## Decisions

### 1. `GlyphScoreV1` formula: pure-integer, additive-only, excludes non-utility fields
```
glyphScore (uint64) =
    pagerankQuantized * 4
  + recency * 3
  + (residency * 257) * 2
  + (lod * 257) * 1
  + popcount(featureBits) * 50
  + popcount(flags) * 50
```
- **Pure integer, no floats**: enables an EXACT (bit-identical) CPU/GPU match, the same
  determinism bar `ACE-RADIX-01`'s CUB-vs-CPU comparison uses — a floating-point formula would only
  ever achieve a tolerance-based match (like `BITFROST-SIM-01`'s residency simulation), which is a
  strictly weaker guarantee this change doesn't need to accept given the formula can be integer-only.
- **Additive-only, no subtraction**: avoids any unsigned-integer-underflow class of bug entirely —
  every term is non-negative, so there is no ordering-dependent overflow/underflow risk to reason
  about on either the CPU (JS `Number`, safe up to 2^53) or GPU (`uint64_t`) side. Max possible
  value is bounded (~657,000 given the field bit-widths — see verification in tasks.md), far below
  either representation's overflow point.
- **`pagerankQuantized`/`recency`/`residency`/`lod` are the utility signals** — the same fields
  `fixture-v1.mjs` already derives `tier`/`utilityBucket`/`recencyBucket` from for the sort key,
  consistent with this contract's own stated purpose ("cheap GPU-local scans... before
  dereferencing heavier representations"). `residency` and `lod` are pre-multiplied by 257 to
  bring their 0-255 range onto comparable scale with the 0-65535 range of `pagerankQuantized`/
  `recency` (the same 257 scaling factor `fixture-v1.mjs` already uses in the opposite direction
  for its bucket quantization — reusing an established scaling convention, not inventing a new one).
- **`featureBits`/`flags` contribute via `popcount`** — both are documented as bitmask-shaped
  16-bit fields; the number of set bits (not their raw integer value, which is not ordinally
  meaningful for a bitmask) is the standard, well-defined way to turn "how many flags/features are
  set" into a scalar contribution. `__popc()` is a single fast CUDA intrinsic; the CPU oracle
  implements the identical bit-counting algorithm explicitly (not via a different, possibly-
  divergent library function) to keep the two sides trivially auditable against each other.
- **`somCell` and `projectionOrdinal` are excluded entirely** — per the Non-Goals above, neither is
  a utility signal in this repo's existing governance: `somCell` is explicitly "never retrieval
  truth" (root CLAUDE.md), and `projectionOrdinal` is explicitly "a non-canonical GPU-local
  coordinate" in `packet-glyph-v1.ts`'s own docstring. Including either in a utility-scoring
  formula would silently promote a non-authoritative field into a decision input.

**Alternative considered**: a weighted floating-point formula (e.g. normalized 0.0-1.0 contributions
summed with float weights, closer in spirit to the `AtlasAceResidencyV1` recency-weighted-frequency
formula from `parent-atlas-bitfrost-sim-01`). Rejected for LEVEL 2 specifically — LEVEL 2's entire
purpose is proving a fusion opportunity exists via exact correctness (matching `ACE-RADIX-01`'s own
exact-match philosophy), and floating-point CPU/GPU parity is inherently tolerance-based (IEEE 754
summation order can differ), which would weaken this specific proof's bar for no real benefit here
— the formula does not need floating-point precision to be a useful cheap-scan heuristic.

### 2. GPU-side `ResidencySortKeyV1` packing computes the SAME formula `fixture-v1.mjs` already uses, verified exact
```
tier            = residency
lodField        = lod
utilityBucket   = floor(pagerankQuantized / 257)
recencyBucket   = floor(recency / 257)
packedKey       = (tier << 56) | (lodField << 48) | (utilityBucket << 40) | (recencyBucket << 32) | projectionOrdinal
```
This is not a new design decision — it is `fixture-v1.mjs`'s existing formula, verbatim, just
computed on GPU from raw fields instead of on CPU. The CPU oracle for this half is the EXISTING
`generateAceRadix01FixtureV1()` function (imported, not reimplemented) — its `packedKeys` output is
the ground truth the GPU kernel's output must exactly match, per the Duplication Prevention rule.

### 3. Reuse the existing glyph fixture generator; do not build a new one
Both kernels' CPU oracles run against the SAME `generateAceRadix01FixtureV1(n)` fixture already
built for `ACE-RADIX-01` (imported from `scripts/atlas/ace-radix-01/fixture-v1.mjs`) — this change
adds a `computeGlyphScoreV1Reference()` function to that module (or an adjacent module importing
from it) for the new `GlyphScoreV1` CPU oracle, rather than generating a second, parallel glyph
fixture.

## Risks / Trade-offs

- **[Risk]** `GlyphScoreV1`'s specific weights (4, 3, 2, 1, 50, 50) are a first-pass design choice
  with no production tuning behind them — this change proves the KERNEL is correct (GPU computes
  what the formula specifies), not that the WEIGHTS are well-chosen for any real workload.
  → **Mitigation**: weights are named constants in both the CPU oracle and the CUDA kernel, not
  inlined magic numbers, so retuning later does not require re-deriving the exact-match proof
  structure — only re-running it with new constants.
- **[Trade-off]** Choosing a brand-new formula (rather than reusing `AtlasAceResidencyV1`'s
  recency-weighted-frequency formula from `parent-atlas-bitfrost-sim-01`) means these two "utility
  score" concepts are not unified. Accepted — `AtlasAceResidencyV1`'s formula depends on simulation
  STATE (visit counts, last-touched step) that has no analogue in a stateless per-glyph GPU scan;
  `GlyphScoreV1` is deliberately a stateless, single-glyph-in/single-score-out function, a
  different shape of problem specifically suited to LEVEL 2's "simple custom CUDA kernel" scope.

## Migration Plan

No production migration — standalone benchmark/proof code, zero canonical-data impact, zero
production code path touched. Both kernels remain unfused, single-purpose LEVEL 2 proofs; LEVEL 3
fusion (a separate, later change) is explicitly out of scope here.

## Open Questions

- Whether `GlyphScoreV1`'s weights should eventually be derived from real production candidate data
  rather than chosen a priori — deferred; this change's scope is proving the kernel computes its
  own specified formula correctly, not validating the formula's real-world usefulness.
