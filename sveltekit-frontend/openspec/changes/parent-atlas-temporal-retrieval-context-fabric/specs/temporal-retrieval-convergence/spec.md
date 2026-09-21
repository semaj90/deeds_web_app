## ADDED Requirements

### Requirement: One owner per temporal contract
The system SHALL name exactly one canonical owner for each of SourceArtifactV1, SourceCoordinateMapV1 and KnowledgeClaimV1, and SHALL classify the other implementation as COMPATIBILITY rather than adding a further vocabulary.

#### Scenario: Claim vocabularies are mapped, not multiplied
- **WHEN** a temporal transition needs a claim state
- **THEN** it uses the mapping between the two existing claim vocabularies and does not introduce a third

### Requirement: Revisions are immutable rows linked by edges
The system SHALL model source history as immutable (source_ref, source_revision) rows linked by explicit temporal edges, and SHALL NOT convert source revisions into validity ranges.

#### Scenario: Supersession is an edge
- **WHEN** a claim is replaced by a newer claim
- **THEN** the old claim is RETRACTED and a SUPERSEDES edge links the two

### Requirement: Temporal evidence is never canonical authority
Temporal bundles, incidents, caches and wiki projections SHALL carry `canonicalAuthority: false`, and caches SHALL hold derived products only.

#### Scenario: Cache is not source truth
- **WHEN** BitFrost holds a temporal ContextManifest
- **THEN** it is invalidated from Postgres truth and never consulted as source authority
