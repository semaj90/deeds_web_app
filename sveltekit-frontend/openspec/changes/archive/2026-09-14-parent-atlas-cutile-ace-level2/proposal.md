## Why

`parent-atlas-gpu-mini-fabric-01` staged `CUTILE-ACE-01` as a LEVEL 3 fused cuTile challenger
(score → key-pack → partition), explicitly gated behind two prerequisites: `ACE-RADIX-01`'s CUB
oracle (LEVEL 1, already `DRY_RUN_PROVEN`) and "LEVEL 2 simple custom CUDA glyph-score +
residency-key-pack kernels" (not yet built). Per this repo's GPU-primitive-LEVEL discipline (root
CLAUDE.md), no level may be skipped — LEVEL 2 must prove each unfused operation correct on its own
before LEVEL 3 attempts to fuse them. This change builds and proves LEVEL 2.

Auditing the existing contracts first (Duplication Prevention rule): `ResidencySortKeyV1`'s packing
formula already exists as a CPU oracle in `scripts/atlas/ace-radix-01/fixture-v1.mjs`
(`packedKey = (tier<<56)|(lod<<48)|(utilityBucket<<40)|(recencyBucket<<32)|projectionOrdinal`) —
that generator computes it on CPU to produce `ACE-RADIX-01`'s fixture files, but no GPU kernel
computes it. `GlyphScoreV1` (the other LEVEL 2 kernel named in the parent task list) has no
existing formula anywhere in this repo — it is designed fresh in this change, not recovered from an
existing spec.

## What Changes

- Design `GlyphScoreV1`: a new, explicit, pure-integer scoring formula over `PacketGlyphV1` fields
  (a cheap GPU-local utility score for reordering large candidate scans, per `PacketGlyphV1`'s own
  documented purpose) — CPU oracle (JS) + GPU CUDA kernel, gated on exact integer match.
- Build `ResidencyKeyPackV1`'s GPU-side computation: a CUDA kernel that computes the SAME packed
  64-bit sort key `fixture-v1.mjs` already computes on CPU, directly from raw `PacketGlyphV1`
  fields (not from pre-packed input) — gated on exact match against that existing CPU oracle.
- Both kernels are simple, unfused, single-purpose CUDA kernels (LEVEL 2) — explicitly NOT the
  fused `score → key-pack → partition` LEVEL 3 cuTile challenger, which stays gated behind this
  change passing.
- Standalone benchmark harness matching `ACE-RADIX-01`/`BITFROST-L2-01`'s existing convention (no
  Node/N-API bindings, JSON-line output, direct `nvcc` build).

## Capabilities

### New Capabilities
- `atlas-glyph-score-v1`: the new `GlyphScoreV1` pure-integer scoring contract (CPU oracle + GPU
  kernel, exact-match gate).
- `atlas-residency-key-pack-gpu`: GPU-side computation of the existing `ResidencySortKeyV1` packing
  formula from raw glyph fields, exact-match gated against the existing `fixture-v1.mjs` CPU oracle.

### Modified Capabilities
(none — this change adds a GPU-side computation of an existing formula and a wholly new formula; it
does not change `PacketGlyphV1`/`ResidencySortKeyV1`'s own field definitions)

## Impact

- New standalone CUDA source under `native/cutile-ace-level2/` (mirrors `native/ace-radix-01/` and
  `native/bitfrost-l2-01/`'s layout).
- New CPU oracle addition to `scripts/atlas/ace-radix-01/` (the existing fixture module) for
  `GlyphScoreV1` — reuses the existing `generateAceRadix01FixtureV1()` glyph generator rather than
  building a new one.
- No production code path touched. No canonical Postgres/Qdrant/Redis/Neo4j data touched. No cuTile
  in this change — cuTile stays LEVEL 3, gated behind this change's LEVEL 2 proof.
