## ADDED Requirements

### Requirement: Label-to-concept resolution
The system SHALL resolve a raw surface label to zero or one canonical concept ID by looking it
up (directly or via a registered synonym) against the concept vocabulary rooted in
`atlas_domain_ontology`. The system SHALL NOT invent a new concept ID as a side effect of a
failed lookup.

#### Scenario: Known label resolves
- **WHEN** the resolver is given the label `"Postgres"` and the vocabulary contains a synonym
  mapping `"Postgres"` -> `concept:postgresql`
- **THEN** the resolver returns `concept:postgresql` with `resolutionState: RESOLVED`

#### Scenario: Unknown label does not resolve
- **WHEN** the resolver is given a label with no matching concept or synonym in the vocabulary
- **THEN** the resolver returns `resolutionState: UNRESOLVED` and no concept ID, without creating
  a new vocabulary entry

### Requirement: Ancestor and relationship lookup
The system SHALL return the parent/ancestor chain for a resolved concept ID by walking
`atlas_domain_ontology`'s `parent_group_id` relationships (or an equivalent relation store built
under this same vocabulary root).

#### Scenario: Ancestor walk
- **WHEN** the resolver is asked for the ancestors of `concept:devops.env-config`
- **THEN** it returns `[concept:devops]` (the real, existing `parent_group_id` relationship),
  not a fabricated chain

### Requirement: Never mints Parent Atlas lineage identity
The system SHALL NOT produce or accept as valid any `packetKey`, `sourceRevision`,
`workspaceRevision`, `canonicalChunkId`, or `graphRevision` value. Those identities remain owned
exclusively by the existing Parent Atlas lineage chain.

#### Scenario: Resolver call carries no lineage-minting authority
- **WHEN** a caller passes a resolution request that includes a `packetKey`
- **THEN** the resolver treats the `packetKey` as caller-supplied context only (passthrough for
  correlation), never validates, generates, or overwrites it

### Requirement: Explicit unavailable state on resolver failure
The system SHALL return an explicit unavailable/unenriched result (not a silent fallback or a
fabricated match) whenever the resolution boundary itself is unreachable or errors.

#### Scenario: Resolver service down
- **WHEN** the resolution boundary cannot be reached
- **THEN** the caller receives `resolutionState: RESOLUTION_UNAVAILABLE`, and the caller's own
  existing degraded-response contract applies (matches this repo's Degraded Response Contract) —
  the caller MUST NOT substitute a guessed concept ID
