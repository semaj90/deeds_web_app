## ADDED Requirements

### Requirement: SomCoordinateV1 is a non-canonical representation coordinate
The system SHALL define a `SomCoordinateV1` Zod contract carrying `representationRevision` (string,
min length 1), `somRevision` (string, min length 1), `x`, `y`, `z` (each a finite number), and
`quantizationError` (non-negative finite number, required), enforced via `.strict()`. The contract
SHALL NOT be usable as, or substitutable for, canonical packet identity (`packetKey`), and no
consumer SHALL treat SOM coordinate equality as evidence of packet equality.

#### Scenario: Coordinate carries both revision axes independently
- **WHEN** the same embedding representation is re-clustered by a new SOM training run
- **THEN** the resulting `SomCoordinateV1` SHALL have an unchanged `representationRevision` and a new `somRevision`

#### Scenario: Coordinate is rejected without a quantization error
- **WHEN** a `SomCoordinateV1` object is constructed without `quantizationError`
- **THEN** `SomCoordinateV1Schema.parse(...)` throws a Zod validation error

### Requirement: BMU-neighbor-prefetch is the only sanctioned production use
The system SHALL restrict any production consumption of `SomCoordinateV1` to a documented
BitFrost-cache-hit-triggered BMU-neighbor-prefetch experiment (fetch cells within a bounded radius
of a cache-hit BMU coordinate and evaluate their promotion), and SHALL NOT use `SomCoordinateV1` as
a retrieval ranking signal or as visualization-only decoration presented as retrieval truth.

#### Scenario: Cache hit triggers bounded neighbor prefetch
- **WHEN** a BitFrost cache hit occurs for a packet with a known `SomCoordinateV1`
- **THEN** only cells within a documented bounded radius (not the full SOM grid) are considered for prefetch/promotion

#### Scenario: SOM coordinate is not used to rank retrieval results
- **WHEN** cuVS ANN, cuGraph, or lexical fusion produce a ranked candidate list
- **THEN** `SomCoordinateV1` values SHALL NOT be used to reorder or filter that ranking
