## ADDED Requirements

### Requirement: The fused LEVEL 3 kernel exactly matches the CPU oracle
The system SHALL verify that the fused `GlyphScoreV1` + `ResidencySortKeyV1` cuTile kernel's
output is bit-identical to the CPU oracle's output (`scripts/atlas/ace-radix-01/glyph-score-v1.mjs`,
`generateAceRadix01FixtureV1()`'s `packedKeys`) for every glyph in a test fixture, at every tested
fixture size, and SHALL NOT accept a tolerance-based match.

#### Scenario: A fixture-wide exact-match run at every tested size
- **WHEN** the fused kernel is run against the 256/1000/4000-glyph fixtures
- **THEN** every glyph's GPU-computed score and packed key equal the CPU-computed values exactly,
  at all three sizes

### Requirement: The kernel runs on real Ampere hardware via the working toolchain
The system SHALL execute the fused kernel on this host's actual GPU (RTX 3060 Ti, sm_86) through a
toolchain confirmed to produce a running binary, not merely a passing frontend compile.

#### Scenario: A binary actually launches and produces output
- **WHEN** `ct.launch()` is called with the fused kernel
- **THEN** device execution completes (`torch.cuda.synchronize()` returns without error) and
  produces real output tensors, not merely a compiled-but-unexecuted artifact

### Requirement: Fusion correctness is not conflated with fusion performance
The system SHALL NOT report a fusion performance benefit (reduced kernel-launch count, reduced
memory traffic, latency improvement) as proven by this capability's exact-match gate alone.

#### Scenario: No latency claim accompanies the correctness result
- **WHEN** this capability's result is recorded as `DRY_RUN_PROVEN`
- **THEN** the record explicitly notes that no latency/throughput comparison against the unfused
  LEVEL 2 kernels was measured
