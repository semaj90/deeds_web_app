# Multi-Hop Traversal Class Matrix

Generated: 2026-06-04

This report verifies the Parent Atlas traversal contract across representative file classes.

## Summary

| Class | source_ref | Result | Notes |
|---|---|---|---|
| API route | `sveltekit-frontend/src/routes/api/evidence/upload/+server.ts` | PASS | Full chain: Postgres, feature_id `upload`, Qdrant, SOM `19`, Neo4j feature node, 10 neighbors |
| ACE / server | `sveltekit-frontend/src/lib/server/ace/context-assembler.ts` | PASS | Full chain: Postgres, feature_id `ace`, Qdrant, SOM `3`, Neo4j feature node, 10 neighbors |
| DB schema | `sveltekit-frontend/src/lib/server/db/schema-postgres.ts` | PASS | Full chain: Postgres, feature_id `db`, Qdrant, SOM `9`, Neo4j feature node, 10 neighbors |
| Svelte component | `sveltekit-frontend/src/routes/(app)/admin/+page.svelte` | PASS | Full chain: Postgres, feature_id `admin`, Qdrant, SOM `18`, Neo4j feature node, 10 neighbors |
| scripts/atlas | `scripts/atlas/build-rg-search-matrix.mjs` | PARTIAL | Postgres feature_id `atlas` and Neo4j 2-hop traversal pass; Qdrant/SOM fields are still null |

## Interpretation

The production app classes now prove the complete chain:

```text
source_ref
  -> parent_atlas_documents
  -> feature_id
  -> summary
  -> atlas_feature_map
  -> qdrant_point_id
  -> som_cluster
  -> Qdrant payload
  -> Neo4j ParentAtlasFeature
  -> 2-hop CodebaseFile neighbors
```

The `scripts/atlas` class is deliberately recorded as partial. It has the feature/graph side of the contract, but it still lacks Qdrant/SOM mapping in `atlas_feature_map`. That matches the focused production coverage report, where the remaining Qdrant-without-SOM work is now primarily real scripts coverage rather than generated backup/report residue.

## Commands

```powershell
npx tsx scripts/tests/smoke-multi-hop-traversal.mjs --source-ref="sveltekit-frontend/src/routes/api/evidence/upload/+server.ts"
npx tsx scripts/tests/smoke-multi-hop-traversal.mjs --source-ref="sveltekit-frontend/src/lib/server/ace/context-assembler.ts"
npx tsx scripts/tests/smoke-multi-hop-traversal.mjs --source-ref="sveltekit-frontend/src/lib/server/db/schema-postgres.ts"
npx tsx scripts/tests/smoke-multi-hop-traversal.mjs --source-ref="sveltekit-frontend/src/routes/(app)/admin/+page.svelte"
npx tsx scripts/tests/smoke-multi-hop-traversal.mjs --source-ref="scripts/atlas/build-rg-search-matrix.mjs"
```

