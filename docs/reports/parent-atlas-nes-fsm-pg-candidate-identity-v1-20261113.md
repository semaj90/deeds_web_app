# NES/FSM PostgreSQL Candidate Identity V1

**Status:** binder implemented and tested; canonical candidate identity remains blocked.

## What changed

- Added a bounded read-only binder for `codebase_chunk_index` rows. It orders UUID row IDs deterministically and assigns contiguous candidate ordinals `0..N-1` within the uint16 limit.
- It rejects absent or malformed source references, SHA-256 source/workspace revisions, lineage checksums, duplicate row IDs, workspace revision drift, and batches over 65,536 rows.
- Added a scratch-only PostgreSQL reader. It requires a read-only transaction, local database name `legal_ai_live_integration_scratch`, PostgreSQL 18, and limits the query to 65,537 rows so overflow is detected rather than truncated.
- Every receipt is explicitly `SCRATCH_FIXTURE_ONLY`, `canonicalAuthority: false`, `promotionEligible: false`, and `writesPerformed: false`.
- No Valkey publication, runtime invocation, action dispatch, migrations, or canonical database writes were added.

## Verification

An independent read-only PostgreSQL query verified:

- Database: `legal_ai_live_integration_scratch`
- Server: PostgreSQL `18.4`
- `codebase_chunk_index` identity/provenance columns exist (`id`, `source_ref`, `source_revision`, `workspace_revision`, and `lineage_binding_checksum`). The table also has `kmeans_cluster`, `som_bmu_row`, and `som_bmu_col` columns.
- Table row count: `0`; revision-qualified row count: `0`; rows with cluster/BMU values: `0`.

The opt-in scratch test ran the actual read helper in `BEGIN READ ONLY` and returned `BLOCKED_EMPTY_CANDIDATE_SET`. The binder therefore does **not** clear `CANONICAL_CANDIDATE_IDENTITY`; it proves the scratch guard and honestly reports that there are no candidates to bind.

Focused test result:

```text
ATLAS_NES_FSM_PG_IDENTITY_SCRATCH_TEST=1
npm exec -- vitest run src/lib/server/atlas/fsm/nes-fsm-postgres-candidate-identity-v1.spec.ts
Test Files  1 passed (1)
Tests       8 passed (8)
```

The three-file follow-up run for the binder, packet helper, and runtime fixture passed `20/20` tests. No full type check was completed during this pass.

## Remaining identity and production gates

1. The scratch table is empty. A bounded query returning no rows cannot establish real candidate mapping.
2. `codebase_chunk_index` is a retrieval mirror. Before promotion, verify the canonical packet/chunk owner and prove each row against its source/workspace binding, not only the mirror's nullable checksum fields.
3. The candidate-identity binder does not produce or authorize the runtime's `kmeansClusterId`, `somBmuId`, LUT byte, feature/domain mask, or policy grant. Those need their own source-qualified, revision-checked adapters.
4. Do not change the fixture runtime or binary packet into a production caller until identity, canonical policy, authorization, and dispatch have independent proofs.
5. The FilmCraft binary/hash claim was not re-verified in this pass. Existing timing code and receipts remain a separate audit item; serialized buffer padding does not prove physical memory-address alignment.

## Structured handoff

- `likely_cause`: The proposed canonical candidate set is not present in the disposable PostgreSQL database, so there are no real rows from which to build an ordinal map.
- `evidence`: `sveltekit-frontend/src/lib/server/db/schema-postgres.ts` declares the mirrored candidate and lineage fields; the read-only PG18 scratch query found zero rows; the focused opt-in test returned `BLOCKED_EMPTY_CANDIDATE_SET`.
- `patch_targets`: `sveltekit-frontend/src/lib/server/atlas/fsm/nes-fsm-postgres-candidate-identity-v1.ts`, `sveltekit-frontend/src/lib/server/atlas/fsm/nes-fsm-postgres-candidate-identity-v1.spec.ts`.
- `safe_next_command`: Review the source of an approved nonempty scratch candidate cohort and its exact workspace/source binding receipt before inserting or importing any fixture rows.
- `smoke_command`: `$env:ATLAS_NES_FSM_PG_IDENTITY_SCRATCH_TEST='1'; npm exec -- vitest run src/lib/server/atlas/fsm/nes-fsm-postgres-candidate-identity-v1.spec.ts`
- `report_path`: `docs/reports/parent-atlas-nes-fsm-pg-candidate-identity-v1-20261113.md`
