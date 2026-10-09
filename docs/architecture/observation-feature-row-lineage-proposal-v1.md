# Observation Feature Row Lineage Proposal V1

Status: proposed; not applied. Owner: the active packet-key ORF contract in
`drizzle/manual/20260819_atlas_observation_feature_rows.sql`, its registered
sidecar migration entry, `atlas-observation-feature-rows.ts`, and the existing
materializer/repository. This proposal does not create a second feature table
or registry.

## Audit basis

A read-only live audit found 1,808 rows in `atlas_observation_feature_rows`.
The table has no `source_revision` or `registry_revision` columns; all rows
have null `workspace_revision` and `source_version_receipt_id`. The existing
`atlas_feature_evidence` and `atlas_feature_state_receipts` relations contain
zero rows, and `atlas_observation_records` is not deployed. The general
`atlas_evidence` ledger does not provide an exact source-revision join for
these feature rows. Against the inspected workspace snapshot, only 19 of
1,808 distinct feature source references have exactly one matching source
binding; the other 1,789 do not. Historical feature rows cannot be repaired
by inference from this evidence.

## Minimal proposed schema delta

Add nullable `source_revision text` and `registry_revision text` columns to
the active `atlas_observation_feature_rows` table. The unapplied SQL proposal
is `sveltekit-frontend/drizzle/manual/20261008_atlas_observation_feature_lineage_v1.sql`.
Do not add `row_ordinal` or
`row_identity_checksum` here: those are cohort/matrix crosswalk fields owned
by the CandidateOrdinalMap and matrix receipt, not source-local observation
identity. Do not add a workspace revision solely to duplicate the cohort
snapshot revision; the existing nullable column remains available where the
feature semantics require it.

The additive migration should contain only:

```sql
ALTER TABLE public.atlas_observation_feature_rows
  ADD COLUMN IF NOT EXISTS source_revision text,
  ADD COLUMN IF NOT EXISTS registry_revision text;
```

No defaults, backfill, constraints over historical rows, or new indexes are
proposed. Existing rows remain explicitly unqualified (`NULL`). New writes
must be rejected by the runtime unless both revisions are qualified, source
evidence references resolve, and the input digest covers the canonical
projection plus source/registry revisions and evidence references. The
independent readback must recompute that digest from persisted fields.

## Required owner changes before application

1. Review and register the additive SQL under the existing ORF migration
   owner; reconcile the active packet-key contract with the explicitly
   superseded candidate/vector SQL before changing any migration files.
2. Extend the existing projection, Drizzle mapping, SvelteKit materializer,
   package repository, and root `scripts/atlas` producer/readback together.
3. Populate `registry_revision` from the actual feature-definition registry;
   never copy `feature_revision` into it as a substitute.
4. Derive source evidence refs from the actual observation/source evidence
   owner; never use `packet_key` as a source-evidence reference.
5. Add fixture tests and independent readback first. Apply only through the
   reviewed migration owner and explicit database-change authorization.

Until those steps pass, ORF rows are diagnostic metadata only for this
lineage-dependent matrix path. No persistent mutation is authorized by this
proposal.
