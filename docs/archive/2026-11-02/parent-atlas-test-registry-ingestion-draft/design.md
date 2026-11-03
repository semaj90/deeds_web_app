## Context

The repository already owns registry and execution-receipt persistence in `packages/parent-atlas/src/core/test-case-registry.ts` and `test-execution-repository.ts`. The existing candidate `scripts/atlas/prove-vitest-evidence.mjs` compiles Vitest JSON, but its apply path also materializes evidence and entity rows. A bounded test-registry canary must therefore use the repositories, preserve their integrity checks, and make its complete write scope explicit before apply.

The existing OpenSpec plan is the implementation plan for `RECEIPT-WRITER-01`; this design does not introduce another writer or a competing plan. The current reported fixture is 13 tests from two named specs. The registry has no canonical entries; the execution-receipt table has 32 legacy unlinked Vitest rows using a different key format.

## Goals / Non-Goals

**Goals:**
- Define a bounded nomination, resolution, versioning, execution-persistence, and independent readback flow through the existing repository APIs.
- Derive every canonical test key with `deriveTestCaseKey()` and retain source/report provenance needed to reproduce checksums.
- Preserve unresolved executions as append-only provenance with `stable_test_id = NULL`; only canonical, key-matching resolutions may attach a stable ID.
- Rehearse the full bounded flow with rollback and prove pre/post table state and receipt readback before any separately authorized apply.

**Non-Goals:**
- Bulk ingestion, migration or relinking of the 32 legacy receipts, changes to repository semantics, schema changes, a second production writer, or manual SQL seeding.
- Treating service-health probes, `service_capabilities` rows, or model-service results as test-registry records.
- Claiming production/CI wiring, canonical test identity, or verified outcomes from a parser-only dry run.
- Enabling non-Vitest ingestion before the database constraints and framework policy are verified.

## Decisions

1. **Use the existing repositories as the only persistence boundary.** The selected writer must call `createTestCaseRegistryRepository(pool)` for nomination, resolution, promotion/version creation, and registry readback, and `createTestExecutionRepository(pool)` for append-only execution receipts. Raw SQL inserts or updates are out of scope. `RECEIPT-WRITER-01` remains open until the operator accepts a single writer and its bounded side effects.

2. **Use deterministic identity and preserve unresolved evidence.** Compute keys only through `deriveTestCaseKey()` from framework, normalized source path, suite path, and title; line and column remain provenance, not identity. Do not adapt legacy `path::title` keys into canonical identities. Persist an execution with `stable_test_id = NULL` when no canonical resolution exists. Attach an ID only when the resolution is canonical and its `test_key` exactly matches the observation.

3. **Keep report evidence immutable and checksummed.** Preserve the exact raw Vitest JSON report and its SHA-256. The compiler's normalization must not silently replace the raw artifact checksum; if normalized input is required, emit and checksum a distinct derived artifact with an explicit producer revision and binding to the raw report. Re-read each stored execution receipt and compare all immutable fields and the repository checksum.

4. **Use a bounded savepoint adapter for rollback rehearsal.** The canary adapter must pin repository operations to one client and translate nested transaction control to savepoints under one outer transaction. Rehearse the two named specs only, assert expected counts inside the transaction, then roll back and independently verify the pre-image. Do not use a repository method that opens a separate pool connection for the rehearsal.

5. **Separate dry-run, rehearsal, and apply.** Dry-run is read-only. Rehearsal writes only inside the outer transaction and must always roll back. Apply is a distinct operator-authorized action. Since the current candidate also writes evidence/materialization rows, receipt-only versus receipt-plus-evidence behavior must be decided before apply; do not imply a receipt-only apply if the candidate still writes those rows.

6. **Gate framework support.** Vitest is the only framework evidenced by the current canary. The TypeScript boundary requires a non-empty framework string, but that alone does not establish the database's accepted values or safe support for other runners. Keep non-Vitest results out until the schema constraints, canonical key derivation, report format, and verifier behavior are explicitly tested. Service checks continue to use `service_capabilities`.

## Risks / Trade-offs

- **Candidate has additional write effects** → decide receipt-only versus receipt-plus-evidence and test the exact effect set before any apply.
- **Nested repository transactions escape the rehearsal transaction** → implement and test the one-client savepoint adapter; independently verify rollback state.
- **Ambiguous resolution could create a new canonical identity** → fail closed in the caller before promotion; repository behavior changes require separate approval.
- **Registry revision changes can alter readback checksums** → document whether checksums are revision-scoped and test idempotency before apply.
- **Legacy receipt keys cannot resolve canonically** → retain them as unlinked provenance; do not rewrite or attach guessed stable IDs.
- **Non-Vitest framework acceptance is unknown** → leave that ingestion blocked until database and repository contracts are verified.

## Migration Plan

No DDL or production mutation is part of this design. First resolve writer, side-effect, registry-revision, unresolved-receipt, and framework decisions in the existing task list. Then run the named 13-test dry-run, rollback rehearsal, negative cases, and independent readback. Only after those gates and explicit operator approval may the bounded apply run. On failure, rollback rehearsal state; an apply rollback/restore procedure must be proven before apply is authorized.

## Open Questions

- Is `prove-vitest-evidence.mjs` accepted as the single writer, or will another writer be named?
- Must the canary avoid evidence/entity writes, or are those side effects explicitly accepted?
- Should unresolved tests persist with `stable_test_id = NULL`, and how are the 32 legacy rows treated?
- Is `registry_revision` mutable provenance, and is readback checksum scope per revision?
- Which framework values are accepted by the database, beyond the current Vitest evidence?
- What independent verifier and authorization boundary must exist before outcomes can be treated as verified?
