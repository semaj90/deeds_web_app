## ADDED Requirements

### Requirement: Resolver-owned evidence identity
The system SHALL allow an agent to nominate an evidence resource but SHALL require a deterministic namespace resolver to assign the current evidence version, authority/source revision, exact content checksum, and any admitted symbol identity.

#### Scenario: Agent cannot mint source revision
- **WHEN** a model proposes a source locator
- **THEN** `AtlasEvidenceResolverV1` resolves revision-qualified evidence
- **AND** unresolved or ambiguous evidence fails closed

### Requirement: Atomic knowledge-claim mutation
The system SHALL validate an entire claim mutation batch and resolve all evidence before producing the next claim set.

#### Scenario: One evidence resource fails
- **WHEN** any ADD or UPDATE evidence resource cannot be resolved
- **THEN** the mutation batch fails
- **AND** no partial next-state receipt is produced

### Requirement: Sparse stale-claim reconciliation
The system SHALL retain issue-free claims without requiring model repetition and SHALL require an explicit update or retraction for every stale/unresolved claim.

#### Scenario: Stale claim omitted
- **WHEN** preflight marks a claim stale and the reconciliation payload neither updates nor retracts it
- **THEN** reconciliation fails with `STALE_CLAIM_DECISION_MISSING`

### Requirement: Evidence relocation hierarchy
The system SHALL prefer exact revision/byte evidence, stable symbol/version identity, Tree-sitter occurrence, and LSP/compiler location before exact-text or contextual-anchor fallback. Contextual fallback SHALL return ambiguous/unresolved rather than choose among multiple candidates.

### Requirement: No new semantic authority
Knowledge pages, claim projections, semantic_768 indexes, and knowledge graphs SHALL remain derived evidence surfaces with `canonicalAuthority=false`. Ontology promotion SHALL remain owned by existing admission/promotion contracts.
