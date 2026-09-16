## ADDED Requirements

### Requirement: Exactly one canonical RRF fusion owner
The system SHALL designate exactly one function as the canonical Reciprocal Rank Fusion owner for
production retrieval. All other RRF-shaped primitives SHALL be classified as `BACKEND`, `ADAPTER`,
`EXPERIMENT`, `COMPATIBILITY`, `FIXTURE_ONLY`, or `DEAD` relative to that owner.

#### Scenario: New RRF-shaped code is added
- **WHEN** a new fusion/ranking primitive that combines per-lane ranks is introduced
- **THEN** it must either delegate to the canonical owner or be explicitly classified and recorded
  in `docs/architecture/runtime-ownership-registry.json` before merging

### Requirement: Classification precedes migration
The system SHALL NOT migrate, rewrite, or delete any of the 5 identified RRF primitives' callers
until each primitive has been classified per `atlas-rrf-fusion-ownership`'s vocabulary and a human
has signed off on the resulting migration plan.

#### Scenario: Classification without migration
- **WHEN** this change's tasks are executed
- **THEN** no caller in any of the 12 identified files is modified as a result
