# Design: CUTILE-ACE-BOUNDARY-01

## Approach

Reuse the existing CPU oracle (`scripts/atlas/ace-radix-01/glyph-score-v1.mjs`) and existing LEVEL
2/3 kernels unchanged -- this change adds ONLY a new fixture generator and its resulting binaries,
per this repo's Duplication Prevention rule. No kernel source was modified to produce this proof
(the kernels being proven must stay exactly as they were when the original LEVEL 2/3 gates passed).

## Decision 1: extract the packing formula instead of duplicating it

`generateAceRadix01FixtureV1()`'s packed-key formula was previously inlined in its generation
loop, with no way to compute a packed key for an arbitrary hand-built glyph (needed for this
boundary fixture, which is NOT randomly generated). Extracted into `packGlyphKeyV1(glyph)`,
verified behavior-preserving via `fixture-v1.test.mjs`'s existing byte-identical regeneration
check (still passes after the extraction) before building anything on top of it.

## Decision 2: one axis varied per row, plus two "everything extreme" rows

Each boundary row holds every field at a fixed baseline except the one field under test, so a
mismatch on any given row can be attributed to that specific field/value without ambiguity. Two
additional rows (all-zero glyph, all-max glyph) test every field at its extreme simultaneously --
the case most likely to reveal an integer-overflow or sign-extension bug that a single-axis sweep
could miss (e.g. a bug that only manifests when multiple large values combine in the same
addition).

## Decision 3: freeze the real bound (uint16), don't just prove "large enough"

The task was specifically to establish why the int32 cast is safe, not merely to observe that it
happens to work for the tested values. `docs/reports/cutile-ace-boundary-01-results.json`'s
`field_contract_established` section states the actual declared bound (`uint16`, 0..65535) and
explains numerically why it can never reach `INT32_MAX`. If `pagerankQuantized`/`recency`'s field
width were ever widened in the future (e.g. to `uint32` with genuine full-range use), this
workaround would need to be revisited -- that dependency is now explicit and documented, not
hidden inside an unqualified "non-negative" comment.

## Non-goals

- Modifying `glyph_fused_tile.py`'s workaround itself -- it is already correct for the real field
  contract; this change proves that, it does not change the code.
- A fourth GPU lane, environment, or toolchain -- reuses the two that already exist and pass.
