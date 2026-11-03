# Test Registry Ingestion

## ADDED Requirements

### Requirement: Registry rows are created only through the governed repositories
The system MUST populate `atlas_test_registry`, `atlas_test_aliases` and `atlas_test_versions` only through `createTestCaseRegistryRepository`, and execution receipts only through `createTestExecutionRepository`. Raw SQL seeding MUST NOT be used.

#### Scenario: A test is promoted without explicit permission
- **WHEN** `promoteNomination` is called with `allow_create` false
- **THEN** it throws `TEST_PROMOTION_REQUIRES_EXPLICIT_ALLOW_CREATE`
- **AND** no registry, alias or version row is written

#### Scenario: A nomination is ambiguous
- **WHEN** `resolveNomination` returns `ambiguous`
- **THEN** the ingestion caller refuses to promote it
- **AND** the case is reported for review

### Requirement: Execution receipts are append-only and identity-checked
An execution receipt MUST carry a `stable_test_id` only from a canonical resolution whose `test_key` equals the observation's `test_key`; otherwise it MUST be stored with a null `stable_test_id`. A repeated `execution_receipt_id` with different content MUST fail readback.

#### Scenario: A receipt is replayed with a changed status
- **WHEN** an existing `execution_receipt_id` is persisted again with a different status
- **THEN** readback throws `TEST_EXECUTION_IMMUTABILITY_CONFLICT`
- **AND** the stored row is unchanged

#### Scenario: Resolution and observation keys differ
- **WHEN** a canonical resolution is supplied for an observation with a different `test_key`
- **THEN** persistence throws `TEST_EXECUTION_RESOLUTION_KEY_MISMATCH`

### Requirement: Ingestion is rehearsed and bounded before any apply
The system MUST run a read-only dry run and a rolled-back rehearsal before an apply, MUST limit the first apply to a named set of tests, and MUST NOT modify existing legacy receipts.

#### Scenario: A rehearsal completes
- **WHEN** the rehearsal finishes inside its outer transaction and is rolled back
- **THEN** all registry, alias, version and receipt row counts equal their pre-image
- **AND** the 32 legacy receipts are unchanged

#### Scenario: The apply is repeated
- **WHEN** the same bounded apply runs a second time
- **THEN** row counts and execution readback checksums do not change
