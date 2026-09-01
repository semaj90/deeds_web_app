## ADDED Requirements

### Requirement: ACE-RADIX-01 fixture is frozen and deterministic
The system SHALL provide a frozen `PacketGlyphV1` fixture generator producing deterministic
candidate sets at N ∈ {256, 1000, 4000, 16000, 64000}, seeded so repeated generation at the same N
produces byte-identical output.

#### Scenario: Fixture regeneration is idempotent
- **WHEN** the fixture generator is run twice at the same N with the same seed
- **THEN** both runs produce byte-identical `PacketGlyphV1` sets

### Requirement: ACE-RADIX-01 compares CPU baseline, CUB oracle, and cuTile challenger
The system SHALL benchmark, at every fixture N, a CPU `std::sort` reference ordering, a CUB radix
sort ordering (oracle), and a cuTile fused-kernel ordering (challenger), each producing an ordering
over the same `ResidencySortKeyV1`-derived packed keys.

#### Scenario: Oracle matches reference exactly
- **WHEN** CUB radix sort output is compared to the CPU `std::sort` reference ordering at any tested N
- **THEN** the orderings SHALL be exactly equal (bit-for-bit key equality, `projectionOrdinal` as stable tie-break)

#### Scenario: Challenger matches oracle exactly
- **WHEN** cuTile output is compared to CUB radix sort output at any tested N
- **THEN** the orderings SHALL be exactly equal, or the challenger is marked NOT_PROVEN at that N

### Requirement: Determinism gates production eligibility, not raw performance
The system SHALL treat exact-ordering-match (per the two scenarios above) as the sole pass/fail
criterion for `ACE-RADIX-01`. Latency, kernel time, H2D/D2H bytes moved, cache-hit lift, and
coalescing/materialization lift SHALL be recorded for every run but SHALL NOT by themselves cause a
PASS verdict when determinism fails, nor block a PASS verdict when determinism holds.

#### Scenario: Fast but non-deterministic challenger fails the gate
- **WHEN** cuTile produces a faster but differently-ordered result than CUB at some N
- **THEN** `ACE-RADIX-01` records that N as NOT_PROVEN for cuTile eligibility, regardless of the latency numbers

#### Scenario: Passing gate is a prerequisite for production wiring
- **WHEN** a future change proposes wiring radix-sort-based reorganization into live BitFrost cache materialization
- **THEN** that change SHALL cite an `ACE-RADIX-01` PASS result (determinism holding across all tested N) as a prerequisite, per this repo's evidence-based status language rules (no "production-ready" claims from unproven benchmarks)
