# atlas-glyph-score-v1 Specification

## Purpose
TBD - created by archiving change parent-atlas-cutile-ace-level2. Update Purpose after archive.
## Requirements
### Requirement: GlyphScoreV1 is a pure-integer formula excluding non-utility fields
The system SHALL compute `GlyphScoreV1` using only integer arithmetic (no floating point), and
SHALL NOT use `somCell` or `projectionOrdinal` as scoring inputs.

#### Scenario: The formula uses only integer operations
- **WHEN** `GlyphScoreV1` is computed for any `PacketGlyphV1` value
- **THEN** every intermediate and final value is an integer type on both the CPU oracle and the GPU kernel

#### Scenario: somCell and projectionOrdinal never influence the score
- **WHEN** two glyphs differ only in `somCell` or `projectionOrdinal`, with all other fields identical
- **THEN** their `GlyphScoreV1` values are identical

### Requirement: GlyphScoreV1 GPU output exactly matches the CPU oracle
The system SHALL verify that the GPU kernel's `GlyphScoreV1` output is bit-identical to the CPU
oracle's output for every glyph in a test fixture, and SHALL NOT accept a tolerance-based match for
this comparison.

#### Scenario: A fixture-wide exact-match run
- **WHEN** the GPU kernel and CPU oracle are run over the same fixture of glyphs
- **THEN** every glyph's GPU-computed score equals its CPU-computed score exactly

### Requirement: Weights are named constants, not inlined literals
The system SHALL define every weight used in the `GlyphScoreV1` formula as a named constant,
identically named and valued in both the CPU oracle and the GPU kernel source.

#### Scenario: A weight change is auditable in both places
- **WHEN** a reviewer inspects the CPU oracle and GPU kernel source for the weight constants
- **THEN** each weight constant's name and value can be directly compared between the two

