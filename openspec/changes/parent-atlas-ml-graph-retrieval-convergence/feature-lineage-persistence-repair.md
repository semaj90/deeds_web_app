# Feature-lineage persistence repair — owner decision (design only)

Status: BLOCKED pending deployed pg_catalog and migration-owner review. No DDL applied.

## Confirmed writer gaps
- Package ORF compiler row contract carries source_revision, workspace_revision, registry_revision, row_ordinal and row_identity_checksum.
- `observation-feature-repository.ts` persists row.workspace_revision and feature_revision but drops source_revision, registry_revision, row_ordinal and row_identity_checksum; source_version_receipt_id is optional.
- `observation-feature-materializer.ts` accepts missing workspaceRevision and nullable source receipt.
- `input_digest` contains a checksum but not the original fields; it cannot by itself reconstruct a missing lineage tuple.

## Decision order
1. Read-only pg_catalog census of `atlas_observation_feature_rows` columns/constraints/indexes, migration ownership and current feature-row revision coverage.
2. Inspect existing immutable provenance envelopes/receipt joins: qualify *exact* per-row tuple only if digest can be independently recomputed from retained inputs. Do not infer source_revision or workspace_revision from a current packet lookup, timestamp, execution ID or feature_revision.
3. If no lossless persisted envelope exists, submit **review-only** minimal additive columns on the existing ORF table: source_revision, registry_revision, row_ordinal, row_identity_checksum. Existing workspace_revision and source_version_receipt_id are retained; do not add redundant columns.
4. Preserve nullable legacy rows; require complete lineage for new admission and new qualified writer path. Never fabricate backfill values or automatically mark historical rows current.
5. Require both producer paths to preserve lineage or fail closed; no caller can bypass by omitting workspaceRevision or receipt.
6. Read-after-write must compare the full tuple and independently recompute row_identity_checksum/input_digest under the existing compiler algorithm.
7. Only after a scoped 16-row replay passes, test larger frozen 25,542-row snapshot admission and [C,25] layout. Feature absence remains distinct from lineage rejection.

## Candidate additive migration (NOT executable / not approved)
Potential columns: `source_revision TEXT`, `registry_revision TEXT`, `row_ordinal INTEGER`, `row_identity_checksum TEXT`.
Require schema/migration owner signoff, additive-nullable DDL, audited deployment, new-writer proof, and readback before stronger constraints. PostgreSQL 18 supports staged NOT VALID constraints and later validation; DO NOT default missing lineage to guessed current values.

## Proof gates
- PERSIST-01: pg_catalog and source table writer ownership readback.
- PERSIST-02: zero fabricated lineage / legacy rows remain excluded.
- PERSIST-03: two writer paths preserve exact compiler identity tuple.
- PERSIST-04: hashed content and evidence revisions independently reproduce checksum.
- PERSIST-05: bounded 16-row profile and matrix negative controls.
- PERSIST-06: full snapshot gate after coverage and provenance qualified.
- PERSIST-07: no migrations, persistent writes, GPU execution or Graphify rebuild until separate approval.

## Revised decision: SOURCE_BOUND vs SNAPSHOT_BOUND (2026-10-08)
Do not mandate per-feature-row workspace_revision, row_ordinal or row_identity_checksum when exact source and feature provenance can be independently verified through existing immutable receipts and the frozen CandidateOrdinalMap.

- SOURCE_BOUND: only source-local feature families, requires exact packet/source revision and source digest, evidence verification, feature revision and registry definition proof. Workspace membership is enforced when assembling a snapshot, not copied into the reusable feature.
- SNAPSHOT_BOUND: requires separately proven snapshot/ordinal/workspace binding. Graph/taxonomy-dependent features additionally require their own independently qualified graph/taxonomy context.
- A database-null workspace_revision is not by itself a rejection; a non-null conflicting workspace_revision *is* rejected.
- Existing 1,808 historical rows are NOT retroactively admitted. The 19 current rows remain blocked until source, feature-definition and receipt binding is proven.
- The new admission helper is pure; its proof fields must be supplied by independent readback logic. A boolean asserted by a caller is not proof. No migration, producer change or readback adapter is implemented here.
- Review feature_revision versus registry_revision semantics and whether the source receipt/existing provenance envelopes losslessly bind input_digest. Propose minimal additive storage only if verified receipts cannot recover it.
