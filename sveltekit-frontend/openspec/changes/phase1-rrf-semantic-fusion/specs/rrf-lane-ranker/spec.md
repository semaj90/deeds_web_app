# Capability: RRF Lane Ranker

## ADDED Requirements

### Requirement: Rank hits within a signal lane using reciprocal rank formula
The system SHALL rank hits within a conceptual signal lane and apply the RRF formula `weight / (k + rank)` to compute each hit's contribution score for that lane.

#### Scenario: Single lane with multiple hits
- **WHEN** given a lane of 10 hits with scores [0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1, 0.0]
- **THEN** hits are ranked 1-10 by score descending, and each hit's RRF contribution is computed as `weight / (k + rank)` with k=60

#### Scenario: Lane with tied scores
- **WHEN** given a lane with two hits having identical scores (e.g., both 0.8)
- **THEN** ties are broken deterministically by hit ID (stable ordering)

#### Scenario: Empty lane
- **WHEN** given an empty lane or lane with no hits
- **THEN** no RRF scores are computed for that lane, returns empty array

### Requirement: Support configurable lane weight
The system SHALL accept a weight parameter for each lane (default 1.0) and multiply the RRF formula by that weight.

#### Scenario: Custom weight
- **WHEN** given weight=0.8 for a lane
- **THEN** all RRF contributions for that lane are multiplied by 0.8 (e.g., 0.8 * (0.8 / 80) for rank 20)

#### Scenario: Zero weight
- **WHEN** given weight=0 for a lane
- **THEN** lane is effectively disabled, all contributions are 0

### Requirement: Support configurable RRF constant k
The system SHALL use a configurable k parameter (default 60) to prevent rank-1 singularity in the RRF formula.

#### Scenario: Different k values
- **WHEN** computing RRF with k=60 vs. k=100
- **THEN** k=60 gives higher scores to early ranks (more sensitive), k=100 gives more uniform scores (less sensitive)

#### Scenario: k=0 edge case
- **WHEN** given k=0
- **THEN** formula becomes `weight / rank`, rank 1 → infinity protected by graceful saturation at 1.0