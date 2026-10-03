## ADDED Requirements

### Requirement: The fused LEVEL 3 kernel source compiles cleanly at the C++ frontend level
The system SHALL provide a `cuda::tiles`-based fused kernel source
(`native/cutile-ace-level3/glyph_fused_tile.cu`) that produces zero C++ compile errors when
processed by WSL2's CUDA 13.3 `nvcc` frontend (`cicc`/`cudafe++` stages) with `-enable-tile`.

#### Scenario: Frontend compilation reaches the tileiras backend stage without error
- **WHEN** `nvcc -std=c++20 -arch=sm_86 -enable-tile` is run against `glyph_fused_tile.cu`
- **THEN** the compiler reaches the `tileiras` invocation step (i.e., every prior frontend stage --
  preprocessing, `cudafe++`, `cicc` -- succeeds with no errors)

### Requirement: A real backend blocker is root-caused, not assumed
The system SHALL NOT report a `cuTile` compilation failure as an unexplained or assumed
environment gap when a more specific root cause can be established through direct diagnostic
commands (`strings`, manual pipeline reconstruction, direct tool invocation).

#### Scenario: The tileiras architecture-string error is isolated to an IR version mismatch
- **WHEN** `tileiras` rejects a `.tilebc` file compiled by CUDA 13.3's `cicc` with "invalid GPU
  architecture: 86", despite `sm_86` being present in `tileiras`' own embedded architecture table
- **THEN** the finding record states the specific mechanism (an IR-encoding version skew between
  the 13.3 frontend and 13.2 backend), not merely "tileiras failed" or "cuTile not supported here"

### Requirement: A passing compile is never reported as a passing LEVEL 3 gate on its own
The system SHALL require exact-match verification against the existing CPU oracles
(`scripts/atlas/ace-radix-01/glyph-score-v1.mjs`'s `computeGlyphScoresV1Reference`,
`generateAceRadix01FixtureV1()`'s `packedKeys`) before `CUTILE-ACE-01` LEVEL 3 may be reported as
`DRY_RUN_PROVEN`, matching the same bar LEVEL 1 (`ACE-RADIX-01`) and LEVEL 2 already met.

#### Scenario: No binary was ever produced in this attempt
- **WHEN** device-code generation is blocked before a runnable binary exists
- **THEN** the attempt's result is recorded as `BLOCKED_TOOLCHAIN_VERSION_SKEW`, never as
  `DRY_RUN_PROVEN` or any status implying the gate was met
