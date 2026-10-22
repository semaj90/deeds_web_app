## ADDED Requirements

### Requirement: Summaries derive from admitted lineage
A codebase summary SHALL be generated only from a chunk payload that carries `sourceRef`, `sourceRevision`, chunk byte span, symbol IDs, and `feature_label`, and SHALL record its model and payload checksum.

#### Scenario: Summary with complete lineage is admitted
- **WHEN** a chunk payload has all required lineage fields and passes schema validation
- **THEN** the summary is stored with `summary_model` and the payload checksum

#### Scenario: Chunk without a feature label is not defaulted
- **WHEN** a chunk has no admitted `feature_label`
- **THEN** the payload records `UNRESOLVED` and no default label is assigned

#### Scenario: Summary containing a reasoning marker is rejected
- **WHEN** generated summary text contains `<think>`, `<|channel>`, `chainOfThought`, or `hiddenThoughts`
- **THEN** the summary is rejected before storage and the rejection is recorded

### Requirement: LSP and langextract facts are evidence, not identity
LSP facts and langextract spans SHALL attach to symbols as evidence only, and SHALL NOT create or change `sourceRef`, `packet_key`, or symbol identity.

#### Scenario: Unavailable language server
- **WHEN** the language server for a file's language is not running
- **THEN** its facts are tagged `NOT_RUN` and no fact is inferred
