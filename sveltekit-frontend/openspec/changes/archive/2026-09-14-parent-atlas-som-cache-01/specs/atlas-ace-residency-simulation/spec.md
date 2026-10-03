## ADDED Requirements

### Requirement: Neighbor-selection strategy is pluggable without duplicating the harness
The system SHALL allow `AtlasAceResidencyV1` to accept an optional neighbor-selection strategy
function that determines which nodes are promoted as prefetch candidates on each query, and SHALL
default to the existing graph-adjacency behavior when no strategy is supplied, so that a caller
providing no strategy sees byte-identical behavior to the pre-existing implementation.

#### Scenario: Omitting the strategy preserves prior behavior exactly
- **WHEN** `AtlasAceResidencyV1` is constructed without a neighbor-selection strategy, as
  `parent-atlas-bitfrost-sim-01`'s existing caller does
- **THEN** its promotion behavior is identical to the pre-existing graph-adjacency-only
  implementation

#### Scenario: A no-prefetch strategy runs through the same harness as graph-neighbor and SOM strategies
- **WHEN** a neighbor-selection strategy that always returns an empty neighbor list is supplied
- **THEN** the simulation executes through the same promotion/eviction/LOD-ladder code path as the
  graph-adjacency and SOM-BMU-neighbor strategies, differing only in which neighbors are proposed
