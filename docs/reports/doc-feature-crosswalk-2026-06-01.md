# Doc-Feature Crosswalk

Generated: 2026-06-05T15:06:23.346Z
Repo: C:\Users\james\Videos\deeds-web-app

## Quick Traversal Spine
- SourceRef/pathmap: sveltekit-frontend/src/lib/server/db/schema/, sveltekit-frontend/drizzle/manual/, scripts/atlas/, scripts/ingest/, docs/graph/, docs/reports/, docs/atlas/, memory/exports/, .tmp/, .opencode/, .cache/, .svelte-kit/, .github/, .vscode/
- Parent atlas entries: 9399
- Entries with sourceRefs: 0
- Discovered doc/report files: 5615
- Use case: Quick multi-hop traversal across sourceRef, parent atlas, Neo4j, Qdrant, Redis, and offline-processing docs.

## Families
### SourceRef / pathmap spine
- Patterns: sourceRef, path-map, path map, stableKey, feature_id, title_id, mapreduce-path-join
- Docs matched: 34
- Anchors:
  - `docs/graph/missing-features-path-map.md`
  - `docs/reports/sourceRef-atlas-join-inventory.md`
  - `docs/reports/qdrant-path-bridge-latest.md`
  - `docs/reports/sourceRef-first-join-warmup.md`
  - `docs/reports/hidden-packet-pathmap-duckdb-report.md`
- Sample docs:
  - `.tmp/parent_atlas_packets/sourceRef-first/parent_atlas_sourceRef_first_cluster_19067cadf0_fb3aec99cf9cad58.json`
  - `.tmp/parent_atlas_packets/sourceRef-first/parent_atlas_sourceRef_first_feature_cache_71db4b96c7f2c392.json`
  - `.tmp/path-map.json`
  - `docs/graph/missing-features-path-map.json`
  - `docs/graph/missing-features-path-map.md`
  - `docs/graph/repo-root-atlas.json`
  - `docs/graph/repo-root-atlas.md`
  - `docs/reports/hidden-packet-pathmap-duckdb-report.md`

### Parent atlas / packet flow
- Patterns: parent atlas, parent_atlas, parent-atlas, NES chrom, NES/Glyph, packet, feature-command-atlas
- Docs matched: 338
- Anchors:
  - `docs/reports/parent-atlas-compression-plan.md`
  - `docs/reports/parent-atlas-feature-command-atlas.md`
  - `docs/reports/parent-atlas-feature-command-atlas-postgres.md`
  - `docs/reports/parent-atlas-rg-dump-organizer.md`
- Sample docs:
  - `.tmp/ace-packet-cache-manifest.json`
  - `.tmp/atlas-packets-report.json`
  - `.tmp/gemma4-parent-atlas-summary-cache-report.json`
  - `.tmp/gemma4-parent-atlas-summary-report.json`
  - `.tmp/json-packet-integrity.md`
  - `.tmp/parent_atlas_packets/000678ef52ca67b0.json`
  - `.tmp/parent_atlas_packets/00116e85cfe0456e.json`
  - `.tmp/parent_atlas_packets/0012bc7350ff2a70.json`

### Neo4j contextual trees / multi-hop traversal
- Patterns: neo4j, context tree, multi-hop, graphrag, kag, dag, contextTimeline
- Docs matched: 656
- Anchors:
  - `docs/architecture/kanban-parent-atlas-alignment.md`
  - `docs/graph/parent-atlas-feature-command-atlas.cypher`
  - `docs/reports/sourceRef-first-hot-join-warmup.md`
- Sample docs:
  - `.tmp/ace-graph-builder-discovery.json`
  - `.tmp/ace-graph-builder-discovery.md`
  - `.tmp/ace-graph-export-recovery-next-command.json`
  - `.tmp/ace-graph-export-recovery-next-command.md`
  - `.tmp/ast-neo4j-dryrun.json`
  - `.tmp/calls-graph-summary.json`
  - `.tmp/calls-graph-summary.md`
  - `.tmp/calls-neo4j-dryrun.json`

### Qdrant semantic analysis / clustering
- Patterns: qdrant, semantic, embedding, ann, cluster, payload, vector
- Docs matched: 363
- Anchors:
  - `docs/reports/qdrant-path-bridge-latest.md`
  - `docs/reports/parent-atlas-feature-command-atlas-qdrant.md`
  - `docs/reports/missing-features-review-latest.md`
- Sample docs:
  - `.tmp/atlas-cluster-assignments.centroids.json`
  - `.tmp/atlas-component-qdrant-index-report.json`
  - `.tmp/backfill-qdrant-source-refs-2026-06-02.json`
  - `.tmp/backfill-qdrant-source-refs-2026-06-03.json`
  - `.tmp/backfill-qdrant-source-refs-2026-06-04.json`
  - `.tmp/idle-scanner-status.json`
  - `.tmp/parent_atlas_packets/audit_hotspot_2026-05-30T20-02-16_cluster_gpu_92.json`
  - `.tmp/parent_atlas_packets/sourceRef-first/parent_atlas_sourceRef_first_cluster_19067cadf0_fb3aec99cf9cad58.json`

### Redis / Bitfrost cache lane
- Patterns: redis, bitfrost, cache, ttl, packet cache, hot cache, ace:packet
- Docs matched: 393
- Anchors:
  - `docs/reports/sourceRef-first-hot-join-warmup.md`
  - `docs/reports/sourceRef-first-nes-glyph-compress.md`
  - `docs/reports/nes-chrom-packet-kag-dag-map.md`
- Sample docs:
  - `.tmp/ace-packet-cache-manifest.json`
  - `.tmp/gemma4-parent-atlas-summary-cache-report.json`
  - `.tmp/intent-cache-manifest.json`
  - `.tmp/parent_atlas_packets/audit_gate_2026-05-30T20-02-16_g40_glyph_cache_pass.json`
  - `.tmp/parent_atlas_packets/sourceRef-first/parent_atlas_sourceRef_first_feature_cache_71db4b96c7f2c392.json`
  - `.tmp/phase19b-cache-config-candidate-review.json`
  - `.tmp/phase19b-cache-config-candidate-review.md`
  - `.tmp/phase19b-cache-config-join-debug.json`

### AE centroids / TurboVec / SOM
- Patterns: centroid, som, autoencoder, vector64, TurboVec, turbovec, ae, centroids
- Docs matched: 81
- Anchors:
  - `docs/reports/parent-atlas-compression-plan.md`
  - `docs/reports/kanban-turbovec-consolidation-latest.md`
  - `docs/reports/autoencoder-som-map.md`
- Sample docs:
  - `.tmp/atlas-cluster-assignments.centroids.json`
  - `.tmp/gpu-som-checkpoint/kmeans_k20_n500.json`
  - `.tmp/gpu-som-checkpoint/scroll_meta.json`
  - `.tmp/parent_atlas_packets/002aee21948f778f.json`
  - `.tmp/parent_atlas_packets/00450ce6c8c5e6aca98fb9370729e2db2cbcfd58c0e33846ea7b1fae3b4cc01e.json`
  - `.tmp/parent_atlas_packets/004f8942bf2140ae.json`
  - `.tmp/parent_atlas_packets/00d38a43f22a680216ca67fd5b6436b5119b14c271aee83b25daeab7d6a7e7ea.json`
  - `.tmp/parent_atlas_packets/00d8acf7823fae83.json`

### Offline processing / mapreduce / DuckDB
- Patterns: offline processing, mapreduce, DuckDB, duckdb, batch, synthesis, rg_turbovec, rg_napi
- Docs matched: 173
- Anchors:
  - `docs/reports/rg-search-dump-index-report.md`
  - `docs/reports/parent-atlas-rg-dump-organizer.md`
  - `docs/reports/repo-organization-audit-2026-06-01.md`
- Sample docs:
  - `.tmp/couchdb-mapreduce-reingest-report.json`
  - `.tmp/duckdb-feature-gap-report.json`
  - `.tmp/duckdb-feature-gap-report.md`
  - `.tmp/duckdb-mapreduce-join-report.json`
  - `.tmp/duckdb-source-ref-audit-2026-06-02.json`
  - `.tmp/mapreduce-full-v2.ndjson.manifest.json`
  - `.tmp/mapreduce-full-v3.ndjson.manifest.json`
  - `.tmp/mapreduce-full-v4.ndjson.manifest.json`

## Notes
- The sourceRef/pathmap spine is the canonical bridge for fast cross-store traversal.
- The hidden packet DuckDB report is the canonical joined replay surface for sourceRef + feature_id + stable_id.
- Parent atlas packets stay the durable evidence layer for multi-hop joins.
- Neo4j contextual trees are for traversal, not canonical storage.
- Qdrant handles semantic analysis and clustering; Redis/Bitfrost keep hot packets live.
- AE centroids / TurboVec are the compression and prefilter lane for offline processing.
- Raw rg search dumps remain evidence only until packetized and summarized.