# Capability: RRF Combiner

## ADDED Requirements

### Requirement: Merge ranked hits from multiple lanes into unified final score via RRF
The system SHALL combine RRF contributions from all lanes for each hit, summing across lanes to produce a final RRF score.

#### Scenario: Hit appears in multiple lanes
- **WHEN** hit ID="auth:session:validator" appears in dense_vector lane (rank 3, contribution 0.015) and graph_authority lane (rank 5, contribution 0.012)
- **THEN** final score = 0.015 + 0.012 = 0.027

#### Scenario: Hit appears in one lane only
- **WHEN** hit ID="cache:hit:acme" appears only in cache lane (rank 2, contribution 0.025)
- **THEN** final score = 0.025 (no contributions from other lanes)

#### Scenario: All lanes contribute
- **WHEN** hit ID="consensus:hit" appears in all 5 lanes with contributions [0.015, 0.012, 0.008, 0.010, 0.006]
- **THEN** final score = 0.015 + 0.012 + 0.008 + 0.010 + 0.006 = 0.051

### Requirement: Sort results by final RRF score descending
The system SHALL sort all hits by final RRF score in descending order.

#### Scenario: Sorted output
- **WHEN** given hits with RRF scores [0.051, 0.027, 0.025, 0.012, 0.008]
- **THEN** output is ordered [0.051, 0.027, 0.025, 0.012, 0.008] (highest score first)

### Requirement: Preserve original signal metadata for transparency
The system SHALL include the original 9 signals and a new rrfBreakdown field in the output for debugging and reasoning.

#### Scenario: Signal preservation
- **WHEN** computing RRF for a hit
- **THEN** output HyperRagHit includes `signals` (all 9 original), `rrfBreakdown` (lane contributions), and `score` (final RRF sum)

#### Scenario: Reasoning with signals
- **WHEN** user examines why a hit ranked high
- **THEN** they can see which lanes contributed (dense vector vs. graph authority vs. cache) for transparency

### Requirement: Handle hit deduplication by ID
The system SHALL group hits by ID across all lanes before final ranking.

#### Scenario: Duplicate ID across lanes
- **WHEN** hit ID="packet:auth" appears in dense_vector, graph_authority, and lexical lanes
- **THEN** only one HyperRagHit entry exists with summed RRF contributions from all 3 lanes

#### Scenario: Duplicate ID deduplication strategy
- **WHEN** same hit ID appears with different metadata in different lanes
- **THEN** metadata from highest-contributing lane is used (dense_vector > graph_authority > lexical > cache > temporal)
