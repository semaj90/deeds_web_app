# Retrieval fusion governance

## ADDED Requirements

### Requirement: Retrieval fusion has one normalization and fusion owner
Retrieval executors MUST return revision and identity metadata, while SearchRuntime owns cross-executor normalization, same-lane deduplication, and final fusion.

#### Scenario: Multiple executors return the same logical candidate
- **WHEN** candidates from one logical lane refer to the same canonical identity
- **THEN** SearchRuntime emits at most one lane vote for that identity.

#### Scenario: An executor lacks canonical identity
- **WHEN** a result has only a projection or degraded fallback identity
- **THEN** the result remains observable as degraded and cannot silently become canonical identity.
