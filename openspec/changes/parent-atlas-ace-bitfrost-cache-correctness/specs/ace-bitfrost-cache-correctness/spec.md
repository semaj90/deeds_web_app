# Ace Bitfrost Cache Correctness

## ADDED Requirements

### Requirement: Exact prompt caches bind complete execution input identity

Cache identity MUST include ContextManifestV2.identityChecksum, modelRevision,
chatTemplateRevision, toolSchemaRevision and promptTemplateRevision, plus rendered
request and output-affecting controls not already bound by those identities.
Missing required revisions MUST reject cache admission.

#### Scenario: An exact input replays
- **WHEN** all cache identity inputs are identical
- **THEN** a valid cached value may be a HIT without changing canonical authority

#### Scenario: One input changes
- **WHEN** any bound revision, user question, rendered prompt, or output control changes
- **THEN** the previous value is a MISS or STALE_REJECT, never an approximate HIT

#### Scenario: A live cache fixture writes disposable keys
- **WHEN** a proof executes SET or DEL
- **THEN** its receipt reports cache writes rather than claiming zero writes


### Requirement: Ace Bitfrost Cache Correctness stays evidence-bound and non-destructive
The system MUST keep ace bitfrost cache correctness actions identity-qualified, non-destructive, and traceable to real evidence rather than assumed or fabricated state.

#### Scenario: An action under this proposal is planned or executed
- **WHEN** a component covered by this proposal runs
- **THEN** it records real evidence (source, revision, or receipt) for what it did, and never silently promotes unproven state to canonical/production status.

#### Scenario: Evidence is missing or unproven
- **WHEN** the required upstream evidence, gate, or dependency is absent or not yet proven
- **THEN** the component fails closed (skips, blocks, or flags) rather than fabricating a result.
