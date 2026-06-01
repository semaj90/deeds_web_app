# Consolidation and Schema Alignment

This note separates the repo reorganization work from the schema migration work.

## Required order

1. Review and approve the feature consolidation proposal.
2. Move only the approved feature groups.
3. Re-run import updates and graph validation.
4. Re-run schema-drift audits.
5. Apply migrations with `drizzle-kit migrate`.

## Repo consolidation scripts

Use these first:

- `scripts/atlas/audit-filesystem.mjs`
  - scans `sveltekit-frontend/src`
  - classifies files into feature domains
  - writes `docs/phase100/file-consolidation-audit.json`

- `scripts/atlas/feature-organization-planner.mjs`
  - reads Neo4j and atlas topology
  - writes `.tmp/feature-organization-proposal.json`
  - writes `.tmp/feature-organization-proposal.md`

- `scripts/atlas/generate-import-updates.mjs`
  - prepares import rewrite commands after approved moves
  - does not execute `git mv`

- `scripts/atlas/build-feature-graph.mjs`
  - validates the feature graph after consolidation work

- `scripts/atlas/check-knowledge-consolidation-claims.mjs`
  - verifies claim reports against actual counts
  - read-only audit only

## Parent atlas scripts

These remain downstream of the move review:

- `scripts/atlas-parent-indexing.mjs`
- `scripts/atlas/mapreduce-consolidated-index.mjs`
- `scripts/atlas/build-all-lanes-parent-atlas.mjs`
- `scripts/atlas/validate-parent-atlas.mjs`
- `scripts/atlas/audit-parent-atlas-consistency.mjs`

## Schema drift scripts

Use these after repo consolidation is settled:

- `scripts/atlas/drizzle-schema-drift-audit.mjs`
- `scripts/atlas/drizzle-user-id-drift-audit.mjs`
- `scripts/atlas/drizzle-drift-audit.mjs`
- `sveltekit-frontend/scripts/schema-drift-check.mjs`
- `sveltekit-frontend/scripts/generate-schema-manifest.mjs`

## Migration rule

- Use `drizzle-kit migrate` for production-safe schema changes.
- Do not use `drizzle-kit push` against production.
- Keep file consolidation and schema migration as separate approval gates.
