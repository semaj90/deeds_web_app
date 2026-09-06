# Deep Research Ingestion

## ADDED Requirements

### Requirement: Discovery snapshots preserve reproducible observation metadata

SearchSnapshotV1 MUST bind normalized query/options and normalizer revision,
requested/effective engine/category/language/time-range metadata, provider/fallback,
observedAt, ordered results, result-set checksum and snapshot checksum using
canonical serialization. Unsupported settings MUST NOT appear as successfully applied.

#### Scenario: A frozen discovery observation replays
- **WHEN** identical observation inputs are serialized again
- **THEN** its checksums are identical, while a later live observation remains separate

#### Scenario: A provider fails or falls back
- **WHEN** search fails, returns no results, or uses curated fallback
- **THEN** the snapshot distinguishes these outcomes without fabricated provider evidence

### Requirement: Discovery is not acquired source evidence

Search results and snippets MUST remain discovery-only. Selected URLs MUST pass
existing acquisition safety and ownership checks; fetched content/hash/spans MUST
use the existing canonical acquisition envelope and PostgreSQL admission owner.

#### Scenario: Only a search snippet is present
- **WHEN** no fetched content and exact source provenance exist
- **THEN** canonical document admission is blocked

#### Scenario: A timestamp changes
- **WHEN** observedAt or TTL changes
- **THEN** recency may change but no source revision or candidate identity is inferred

#### Scenario: A selected URL redirects outside admission policy
- **WHEN** acquisition resolves a prohibited destination or unowned source type
- **THEN** the existing acquisition boundary rejects it without direct projection writes

### Requirement: Deep Research Ingestion stays evidence-bound and non-destructive
The system MUST keep deep research ingestion actions identity-qualified, non-destructive, and traceable to real evidence rather than assumed or fabricated state.

#### Scenario: An action under this proposal is planned or executed
- **WHEN** a component covered by this proposal runs
- **THEN** it records real evidence (source, revision, or receipt) for what it did, and never silently promotes unproven state to canonical/production status.

#### Scenario: Evidence is missing or unproven
- **WHEN** the required upstream evidence, gate, or dependency is absent or not yet proven
- **THEN** the component fails closed (skips, blocks, or flags) rather than fabricating a result.
