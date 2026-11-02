## ADDED Requirements

### Requirement: Retrieval demand observations preserve canonical lineage
The system MUST represent retrieval demand observations using existing canonical candidate identity and preserve applicable packet/chunk identity, source reference, source/workspace revisions, retrieval policy/lane revision, and evidence references. Missing or ambiguous lineage MUST be represented as unresolved or degraded and MUST NOT be replaced with a path, label, projection ID, timestamp, or synthetic revision.

#### Scenario: Qualified result is observed and selected
- **WHEN** a retrieval result has canonical identity and applicable source and policy revisions
- **THEN** the observation records those exact values and distinguishes observed, selected, and cited states

#### Scenario: Result lineage is absent or ambiguous
- **WHEN** a result cannot be resolved to canonical identity or a required revision
- **THEN** the observation reports an unresolved/degraded state and does not invent a replacement identity or revision

### Requirement: Exact token counts are tokenizer-bound
The system MUST label an exact token count with the tokenizer artifact/revision, model context identity, and precisely counted input scope. If the exact tokenizer is unavailable, the system MUST report the count as unavailable or as an explicitly approximate estimate; character-based estimates MUST NOT be reported as exact token counts.

#### Scenario: Active tokenizer returns a count
- **WHEN** the exact tokenizer used for the target context is available
- **THEN** the report contains the count, tokenizer/model revision, and input scope used to calculate it

#### Scenario: Exact tokenizer is unavailable
- **WHEN** the tokenizer artifact or revision cannot be established
- **THEN** the report marks exact token accounting unavailable and any fallback estimate is explicitly labeled approximate

### Requirement: HLL remains advisory telemetry
HyperLogLog estimates MUST be labeled approximate and scoped by namespace, window, precision, and observation kind. HLL output MUST NOT determine canonical identity, exact reconciliation counts, eligibility, retrieval votes, ranking, eviction, or promotion.

#### Scenario: HLL estimate is included
- **WHEN** an HLL estimate is attached to a demand report
- **THEN** it is distinguishable from exact counts and includes its scope and approximation status

#### Scenario: HLL estimate conflicts with exact state
- **WHEN** an HLL estimate differs from an exact canonical count
- **THEN** the exact canonical count remains authoritative and the HLL estimate is reported only as telemetry

### Requirement: Demand accounting does not silently persist sensitive content
The system MUST NOT persist raw prompts, retrieved source text, or raw Docker logs as part of demand accounting by default. Any persistence or external tool exposure MUST use an approved owner, bounded schema, privacy/retention policy, and explicit write authorization.

#### Scenario: Report is generated without persistence authorization
- **WHEN** demand accounting runs without an approved persistence owner and authorization
- **THEN** it produces only an explicitly non-canonical diagnostic/report artifact and reports zero datastore writes

#### Scenario: Persistence is later authorized
- **WHEN** an approved owner, retention policy, and write authorization are present
- **THEN** only the bounded validated observation is persisted and its receipt supports independent identity/revision readback
