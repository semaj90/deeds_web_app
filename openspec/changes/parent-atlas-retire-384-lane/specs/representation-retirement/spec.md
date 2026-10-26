## ADDED Requirements

### Requirement: Legacy vector retirement requires current evidence and explicit authorization
The system SHALL preserve `atlas_packets.content_embedding_384` and its values until current schema/count evidence, reader/writer ownership, a verified archive/readback plan, and explicit operator authorization are recorded. A vector's dimensionality MUST NOT be used to infer its model, recipe, or compatibility with another representation.

#### Scenario: Audit evidence is future-dated or stale
- **WHEN** a proposed retirement depends on a count or runtime fact dated after the current audit date or lacking a current receipt
- **THEN** that fact is treated as `NOT_PROVEN`, and archive sizing or schema removal remains blocked.

#### Scenario: Equal width but unknown model identity
- **WHEN** a 384-dimensional value has no verified producer and recipe identity
- **THEN** the value remains isolated and is not relabeled, converted, or compared as if it belonged to another representation.

#### Scenario: Schema retirement is proposed
- **WHEN** a request proposes dropping the legacy column
- **THEN** the system requires a verified archive readback, completed consumer migration, rollback plan, and separate explicit authorization before applying DDL.
