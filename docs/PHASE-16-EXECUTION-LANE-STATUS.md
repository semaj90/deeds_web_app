# Phase 16 Execution Lane Status — Real vs Expected Schema

**Date**: June 15, 2026  
**Discovery**: Schema partially exists but doesn't match Phase 17 spec

## Current atlas_topology_index Schema

✅ **Columns Present** (12 total):
- `packet_key` (varchar, PK)
- `x_cosine` (real) — Qdrant semantic cosine score
- `y_graph` (int) — Neo4j hop distance  
- `z_som` (int) — SOM cell assignment (0-399)
- `w_authority` (real) — Karpathy authority score
- `som_source` (varchar) — Training pipeline origin marker
- `karpathy_score` (real) — Composite ranking score
- `latent_64` (bytea) — Autoencoder 768→64 latent (correct encoding!)
- `community_id` (bigint) — Feature community clustering
- `tree_node_id` (uuid) — Link to atlas_tree_nodes
- `created_at`, `updated_at` (timestamp)

❌ **Columns Missing** (needed for Phase 16 completion):
- `som_cluster` (int) — SOM BMU index (0-399, duplicate of z_som intent?)
- `som_x` (smallint) — Grid X coordinate (0-19)
- `som_y` (smallint) — Grid Y coordinate (0-19)
- `ae_cluster` (int) — Autoencoder cluster assignment
- `ae_distance` (float) — Reconstruction error
- `pagerank` (float) — GDS centrality
- `betweenness` (float) — GDS shortest-path centrality
- `eigenvector` (float) — GDS spectral centrality
- `nn_1, nn_2, nn_3, nn_4` (uuid) — KNN neighbor IDs
- `topology_version` (int) — Snapshot version control

**Indexes**: 7 B-tree, 0 GIN (no JSONB in this table, so no adaptive GIN needed here)

## Execution Plan Revision

### Order of Operations (Dependency Graph)

```
Step 1: Add missing GDS + SOM columns to atlas_topology_index
  └─ No dependencies (schema-only)

Step 2: Run Phase 16 Neo4j GDS KNN build
  ├─ INPUT: Qdrant codebase_chunks_768 (52k vectors, 768-dim)
  ├─ OUTPUT: Neo4j KNN_NEIGHBOR edges + pagerank/betweenness/eigenvector
  ├─ Postgres UPDATE: nn_1..4, pagerank, betweenness, eigenvector
  └─ No blocker ✅

Step 3: Run SOM training (depends on autoencoder latent index)
  ├─ PREREQ: models/autoencoder/autoencoder_latent_index.json EXISTS?
  ├─ If YES: Run train-som-20x20.mjs → som_20x20_codebook.json
  ├─ If NO: Run train-autoencoder-768-64.mjs first (40 min)
  └─ OUTPUT: Postgres UPDATE som_cluster, som_x, som_y + Redis cache

Step 4: Backfill Qdrant som_cluster tag + ne4j SIMILAR_TOPOLOGY
  ├─ INPUT: atlas_topology_index.som_x/y/cluster
  ├─ OUTPUT: Qdrant payload tag `som_cluster`, Neo4j SIMILAR_TOPOLOGY edges
  └─ Read-only on Postgres, write-only to Qdrant + Neo4j

Step 5: Wire ae_latent_64 bytea → database + Qdrant (if not already done)
  └─ May already be in the backfill pipeline
```

### Immediate Next Step

**Check if autoencoder latent index exists** (prerequisite for SOM):

```bash
test -f models/autoencoder/autoencoder_latent_index.json && echo "✅ EXISTS" || echo "❌ MISSING - need to train first"
```

## Lane Status Summary

| Lane | Status | Blocker | Action |
|------|--------|---------|--------|
| **Schema alignment** | 70% | Add 10 columns | `drizzle/manual/*.sql` migration |
| **Neo4j GDS KNN** | 0% | Ready to run | Execute `phase-16-neo4j-gds-knn-build.mjs` |
| **SOM training** | 5% | Check latent index | If missing: train AE first (40 min) |
| **SOM→Neo4j wiring** | 0% | Depends on Step 3 | After SOM ready |
| **Autoencoder inference** | 80% | Backfill bytea | Finalize ae_latent_64 column writes |
| **Ontology seeding** | 0% | Ready to run | No dependencies |
| **HyperRAG fusion** | 60% | Sorted set tuning | Minor tweaks |

## Discovery: z_som vs som_cluster

Current schema has `z_som` (int, 0-399) which appears to already encode the SOM cell assignment. The missing `som_cluster` column may be redundant OR represent a different clustering method.

**Decision**: 
- **Keep `z_som`** as the primary SOM cell index (0-399 for 20×20 grid = 0-399 valid)
- **Rename `som_x`, `som_y` to avoid confusion** with 4D coords, use `som_grid_x`, `som_grid_y`
- **Drop `som_cluster`** as redundant (it's z_som modulo grid layout)

## Recommended Action

**Before running any scripts:**

```bash
# 1. Check autoencoder latent index
test -f models/autoencoder/autoencoder_latent_index.json || \
  echo "Must run: node scripts/atlas/train-autoencoder-768-64.mjs first (40 min)"

# 2. Create schema migration for missing columns
# File: drizzle/manual/0046_phase_16_topology_gds.sql
# Add: pagerank, betweenness, eigenvector, nn_1..4, topology_version
# Skip: som_cluster, ae_cluster (legacy/redundant)

# 3. Execute scripts in order:
node scripts/atlas/phase-16-neo4j-gds-knn-build.mjs    # 35 min, no deps
node scripts/atlas/train-som-20x20.mjs                  # 15 min, depends on AE
node scripts/atlas/phase-16-backfill-qdrant-som.mjs    # 10 min
```

---

## Files Reference

- Current topology schema: [sveltekit-frontend/src/lib/server/db/schema-postgres.ts](../sveltekit-frontend/src/lib/server/db/schema-postgres.ts)
- GDS interface: [sveltekit-frontend/src/lib/server/graph/neo4j-gds.ts](../sveltekit-frontend/src/lib/server/graph/neo4j-gds.ts)
- SOM training: [scripts/atlas/train-som-20x20.mjs](../scripts/atlas/train-som-20x20.mjs)
- AE training: [scripts/atlas/train-autoencoder-768-64.mjs](../scripts/atlas/train-autoencoder-768-64.mjs)

---

**Status**: Ready to execute (pending schema confirmation)  
**Time Estimate**: 100 min total (GDS 35 + SOM 15 + backfill 10 + wait for AE 40)  
**Critical Path**: Check latent index → decide if AE training needed
