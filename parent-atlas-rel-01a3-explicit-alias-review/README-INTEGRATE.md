# Parent Atlas REL-01A3 — Explicit Source Alias Review

This bundle is the next safe tranche after REL-01A reported six review-only
`src/... -> sveltekit-frontend/src/...` candidates and one unresolved root
`src/lib/server/valkey.ts`.

It **does not apply** the existing manual source-lineage migration and does not
write any database row.

## Why this uses an alias contract

The repository already contains an unapplied design for:

- `atlas_source_aliases`
- `atlas_workspace_source_bindings`

and explicitly includes `ROOT_PREFIX_ALIAS` plus statuses
`PROPOSED`, `VERIFIED`, `REJECTED`, `SUPERSEDED`.

REL-01A3 mirrors that ownership model in a receipt only. It does not create the
tables and does not declare any alias `VERIFIED`.

## Copy into repo root

```text
scripts/atlas/lib/feature-ontology-explicit-alias-v1.mjs
scripts/atlas/audit-feature-ontology-explicit-alias-v1.mjs
packages/parent-atlas/test/feature-ontology-explicit-alias-v1.test.mjs
```

Do not replace REL-01A. This is the next review gate beside it.

## Run

From `deeds-web-app` root:

```bash
node --check scripts/atlas/lib/feature-ontology-explicit-alias-v1.mjs
node --check scripts/atlas/audit-feature-ontology-explicit-alias-v1.mjs
node --test packages/parent-atlas/test/feature-ontology-explicit-alias-v1.test.mjs
node scripts/atlas/audit-feature-ontology-explicit-alias-v1.mjs
```

Generated receipt:

```text
docs/reports/feature-ontology-explicit-alias-v1.json
```

## Expected decision

For the six frontend-relative refs you want:

```text
classification = EXPLICIT_ALIAS_REVIEW_READY
promotable = false
observationCanonicalPresent = true
observationAliasPresent = false
```

For `src/lib/server/valkey.ts`, if it is a real current root source:

```text
classification = DUAL_NAMESPACE_COLLISION
```

That row must never inherit the frontend prefix rule automatically.

## What approval means

Approval at this gate means only:

> The versioned resolver rule `feature-ontology-explicit-alias:v1` is an accepted
> proposal for the six reviewed source refs.

It does **not** mean:

- apply `20260827_source_lineage_relations_v1.sql`
- rewrite `feature_ontology_tuples.source_ref`
- stamp workspace revisions
- insert Graphify rows
- allow REL-01B
- derive `relationshipGraphRevision`

A later explicit persistence gate can materialize **VERIFIED** alias rows after
the canonical registry namespace and foreign-key target are reconciled.

## Next after a clean review receipt

1. Freeze the six alias pairs + selection checksum.
2. Verify their canonical prefixed refs against the refreshed workspace
   observation.
3. Verify whether those prefixed refs already have Graphify rows.
4. If Graphify coverage is absent, use the *canonical prefixed refs* for a
   bounded source-inventory batch.
5. Independent readback.
6. Extend REL-01A to consume only explicitly approved aliases.
7. Rerun REL-01A.
8. REL-01B only after `eligibleUsesConceptTuples > 0`.

Keep `--apply` absent from relationship materialization throughout these gates.
