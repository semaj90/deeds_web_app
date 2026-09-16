## ADDED Requirements

### Requirement: AtlasAceResidencyV1 is named to avoid the NVIDIA ACE collision
The system SHALL name every residency-policy contract with an `AtlasAceResidency`-prefixed
identifier (e.g. `AtlasAceResidencyV1`), and SHALL NOT use a bare `Ace*` name for any residency,
cache, or promotion contract, to avoid collision with NVIDIA's unrelated cuVS "ACE" (Augmented Core
Extraction) HNSW-build terminology.

#### Scenario: A residency contract name is checked before merge
- **WHEN** a new residency/cache/promotion contract is added under this capability
- **THEN** its exported type name begins with `AtlasAceResidency`, not a bare `Ace`

### Requirement: Query-sequence traces are generated deterministically from GraphFixtureV1 adjacency
The system SHALL generate its query-sequence trace via a seeded biased random walk over the
existing `GraphFixtureV1` node/edge adjacency (10K nodes, 50K typed edges), and SHALL NOT construct
a new, separate synthetic graph for this purpose.

#### Scenario: Trace regeneration is byte-identical for a fixed seed
- **WHEN** the query-sequence generator is run twice with the same seed, `TRACE_LENGTH`, and
  `LOCALITY_PROBABILITY`
- **THEN** the two generated `nodeKey` sequences are identical

#### Scenario: A shuffled control trace shares the exact node-visit multiset
- **WHEN** a shuffled control trace is derived from a locality trace
- **THEN** every `nodeKey` appears in the control trace exactly as many times as in the locality
  trace, in a randomly permuted order

### Requirement: Residency utility score is tested against predicted reuse, not plausibility
The system SHALL evaluate `AtlasAceResidencyV1`'s utility scoring by measuring whether promoting a
retrieved candidate's graph-neighborhood to WARM residency predicts that those neighbors are
actually re-requested on the immediately following query, using the query-sequence trace over
`GraphFixtureV1`-derived adjacency. The system SHALL NOT accept a score formula as validated merely
because its output values look plausible.

#### Scenario: Prefetch precision is measured against actual next-query reuse
- **WHEN** a candidate A is retrieved at query N and its graph neighbors B, C, D are promoted to WARM
- **THEN** the simulation records whether B, C, or D were actually requested at query N+1, contributing to `precisionOfPrefetch`

#### Scenario: Reported metrics include both benefit and cost
- **WHEN** a `BITFROST-SIM-01` run completes
- **THEN** the result artifact reports `hitRate`, `precisionOfPrefetch`, `bytesPromoted`, `bytesWasted`, `promotionLatency`, `evictionRate`, and `queryLatencyDelta` — not hit rate alone

### Requirement: The residency gate is a locality-lift comparison against a same-frequency control, not an absolute threshold
The system SHALL run `AtlasAceResidencyV1` with identical configuration and seed against both the
locality trace and its shuffled control trace, and SHALL gate PASS/FAIL on
`hitRate(locality) - hitRate(control) >= MIN_LOCALITY_LIFT`, where `MIN_LOCALITY_LIFT` is a
documented positive constant, not on `hitRate(locality)` alone.

#### Scenario: A residency policy with no real graph-awareness fails the gate
- **WHEN** a utility formula produces statistically indistinguishable hit rates on the locality
  trace and its shuffled control (lift below `MIN_LOCALITY_LIFT`)
- **THEN** the run is recorded as FAIL, even if the absolute `hitRate` value looks high

#### Scenario: The eviction policy is configurable without duplicating the harness
- **WHEN** the residency simulation is run in `lru` eviction mode versus `utility-score` eviction mode
- **THEN** both modes execute through the same simulation harness, differing only in eviction
  selection logic
