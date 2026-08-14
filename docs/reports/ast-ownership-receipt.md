# AST ownership receipt

- generatedAt: 2026-08-14T03:41:49.091Z
- status: PROVEN_AUDIT

| artifact | observed state | live callers | importers | replacement candidates |
|---|---|---:|---:|---|
| `scripts/atlas/knowledge-layer/ast-extractor.ts` | **MIGRATION_CANDIDATE** | 0 | 1 | `sveltekit-frontend/scripts/atlas/ast-treesitter-facts.mjs`<br>`sveltekit-frontend/src/lib/server/analysis/ast-langextract-bridge.ts` |

## Promotion rule

An artifact may move from `MIGRATION_CANDIDATE` to `SUPERSEDED` only after a canonical replacement is proven, all live callers use it, Graphify no longer depends on the old implementation, and the superseded-import check remains zero.

This receipt is read-only evidence. It does not delete or modify the audited artifact.
