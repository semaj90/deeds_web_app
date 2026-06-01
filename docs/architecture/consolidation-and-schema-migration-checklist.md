# Consolidation and Schema Migration Checklist

Use this runbook before any schema migration work.

## Order

1. Review the feature consolidation proposal.
2. Approve one feature group at a time.
3. Apply only the approved `git mv` moves.
4. Regenerate import updates and validate the feature graph.
5. Re-run schema drift audits.
6. Apply migrations with `drizzle-kit migrate`.

## Repository consolidation scripts

- `scripts/atlas/audit-filesystem.mjs`
  - scans `sveltekit-frontend/src`
  - writes `docs/phase100/file-consolidation-audit.json`
  - classifies files into feature domains

- `scripts/atlas/feature-organization-planner.mjs`
  - reads parent atlas + Neo4j topology
  - writes `.tmp/feature-organization-proposal.json`
  - writes `.tmp/feature-organization-proposal.md`

- `scripts/atlas/generate-import-updates.mjs`
  - prepares import rewrite commands after approved moves
  - dry-run only; does not execute `git mv`

- `scripts/atlas/build-feature-graph.mjs`
  - validates graph topology after consolidation work

- `scripts/atlas/check-knowledge-consolidation-claims.mjs`
  - verifies the reported consolidation claims against actual counts
  - read-only audit only

## Parent atlas scripts

- `scripts/atlas-parent-indexing.mjs`
- `scripts/atlas/mapreduce-consolidated-index.mjs`
- `scripts/atlas/build-all-lanes-parent-atlas.mjs`
- `scripts/atlas/validate-parent-atlas.mjs`
- `scripts/atlas/audit-parent-atlas-consistency.mjs`

These are downstream of the move-review gate.

## Schema drift scripts

- `scripts/atlas/drizzle-schema-drift-audit.mjs`
- `scripts/atlas/drizzle-user-id-drift-audit.mjs`
- `scripts/atlas/drizzle-drift-audit.mjs`
- `sveltekit-frontend/scripts/schema-drift-check.mjs`
- `sveltekit-frontend/scripts/generate-schema-manifest.mjs`

Run these only after consolidation is settled.

## Migration rule

- Use `drizzle-kit migrate` for production-safe changes.
- Do not use `drizzle-kit push` against production.
- Keep repo moves and schema migration as separate approval gates.

## Current status

- Repo consolidation: proposal exists, approval pending.
- Schema migration: blocked until the first feature-group move plan is approved.
- File moves: none applied yet.
