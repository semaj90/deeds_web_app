# Parent Atlas Graph Runtime — Python Ownership Consolidation

## ADDED Requirements

### Requirement: Graph Runtime Python Consolidation stays evidence-bound and non-destructive
The system MUST keep graph runtime python consolidation actions identity-qualified, non-destructive, and traceable to real evidence rather than assumed or fabricated state.

#### Scenario: An action under this proposal is planned or executed
- **WHEN** a component covered by this proposal runs
- **THEN** it records real evidence (source, revision, or receipt) for what it did, and never silently promotes unproven state to canonical/production status.

#### Scenario: Evidence is missing or unproven
- **WHEN** the required upstream evidence, gate, or dependency is absent or not yet proven
- **THEN** the component fails closed (skips, blocks, or flags) rather than fabricating a result.

### Requirement: Graph execution receipt V2 is additive and non-authoritative
The system MUST preserve the V1 receipt contract and field meanings while permitting a test-only V2 wrapper that adds explicit executor and input/output checksum provenance.

#### Scenario: V1 receipt is wrapped for V2 contract testing
- **WHEN** a V1 receipt and explicit executor revision plus valid SHA-256 input/output checksums are supplied
- **THEN** V2 preserves the V1 field names and values, uses the V2 schema identifier, and records `canonical_authority=false` and `writes_performed=false`.

#### Scenario: V2 provenance or authority is invalid
- **WHEN** required provenance is blank or malformed, or the V1 input claims canonical authority
- **THEN** conversion fails closed and leaves the V1 receipt unchanged.

### Requirement: PageRank backend comparisons share exact graph coordinates
The system MUST compare NetworkX and cuGraph PageRank results only when both receipts bind the same graph revision, input checksum, node/edge counts, and explicit graph-ordinal-map checksum.

#### Scenario: CPU and GPU score maps are compared
- **WHEN** both V2 execution receipts are proven, non-authoritative PageRank receipts for the same graph input
- **THEN** score vectors are checked by GraphOrdinal, output checksums are verified, top-k ties use ascending GraphOrdinal, and the comparison emits a noncanonical parity receipt.

#### Scenario: Backend or coordinate evidence differs
- **WHEN** a backend is mislabeled, graph/input coordinates differ, output checksums fail, or ordinal sets differ
- **THEN** parity fails closed; result order, cuVS vector neighbors, DuckDB row order, or GPU cache residency MUST NOT substitute for graph identity.

### Requirement: Personalized PageRank binds query seeds and dangling policy
The system MUST bind PPR comparisons to the exact graph and CandidateOrdinal snapshot/map, normalized seed CandidateOrdinals and weights, alpha, convergence tolerance, iteration limit, and explicit dangling-node redistribution policy.

#### Scenario: PPR backend comparison
- **WHEN** NetworkX and cuGraph execute PPR over the same frozen directed graph input
- **THEN** the receipt MUST compare complete ordinal sets, score L1/L-infinity error, Pearson/Spearman correlation, top-10/50/100 overlap, rank displacement, score-mass conservation, and dangling-node score mass
- **AND** any graph/map/seed/parameter/dangling-policy mismatch MUST fail closed
- **AND** the result MUST remain derived, non-authoritative, and add no retrieval vote
