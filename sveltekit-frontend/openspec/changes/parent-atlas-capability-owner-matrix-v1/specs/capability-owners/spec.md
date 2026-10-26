# Capability owner matrix (v1)

## ADDED Requirements

### Requirement: Each named capability has one canonical owner
Every capability in the matrix SHALL name exactly one canonical owner per execution layer (CPU and, where applicable, GPU), the implementation language, and the file path that owns it. Adapters and experiments SHALL NOT be listed as canonical owners.

#### Scenario: Owner exists on disk
- **WHEN** the verifier reads a capability's canonical owner path
- **THEN** the file SHALL exist, or the capability SHALL be marked MISSING with no owner claimed

#### Scenario: Duplicate owner
- **WHEN** two files implement the same capability
- **THEN** the matrix SHALL record both, mark one CANONICAL and the other DUPLICATE, and SHALL NOT delete either

### Requirement: Proof status uses the repo vocabulary
A capability SHALL carry one status from CREATED, WIRED, DRY_RUN_PROVEN, APPLY_PROVEN, NOT_PROVEN or BLOCKED. A file existing SHALL NOT be enough for WIRED. A passing unit test SHALL NOT be enough for PROVEN.

#### Scenario: Existence only
- **WHEN** a capability's owner file exists but has no caller
- **THEN** the status SHALL be CREATED

### Requirement: GPU results require CPU parity
A GPU owner SHALL NOT be promoted above DRY_RUN_PROVEN until a CPU oracle produces the same ordering, masks, dimensions and checksums within a bounded tolerance.

#### Scenario: GPU output differs from CPU oracle
- **WHEN** the bounded parity comparison exceeds its declared tolerance
- **THEN** the GPU result SHALL remain unpromoted and the mismatch SHALL be recorded

### Requirement: Missing capabilities are recorded, not invented
A capability with no owner SHALL be recorded as MISSING with its gap. No owner SHALL be created in this change.

#### Scenario: No implementation owner exists
- **WHEN** the verifier cannot locate an implementation owner for a capability
- **THEN** the matrix SHALL report MISSING and name the unfilled responsibility

### Requirement: Read-only verification
The verification step SHALL NOT write to PostgreSQL, Valkey, Qdrant, Neo4j, or the filesystem outside the change folder and its receipts.

#### Scenario: Verification runs
- **WHEN** the owner matrix and receipts are generated
- **THEN** no production datastore or out-of-scope filesystem write SHALL occur
