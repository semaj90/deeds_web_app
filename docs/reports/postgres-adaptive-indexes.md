# Postgres Adaptive Indexes — atlas_codebase_packets

**Timestamp**: 2026-06-14T21:01:35.208Z
**Status**: WARN

## Summary

- **Total Indexes**: 18
- **B-tree**: 19
- **GIN**: 3
- **BRIN**: 1

## Classification

### Identity Indexes (packet_key, source_ref, feature_id)
- atlas_codebase_packets_pkey
- idx_atlas_codebase_feature_community
- idx_atlas_codebase_feature_id
- idx_atlas_codebase_quality_filter
- idx_atlas_codebase_source_ref

### Topology Indexes (som_cluster, tree_node_id, community_id)
- idx_atlas_codebase_community
- idx_atlas_codebase_community_high_confidence
- idx_atlas_codebase_feature_community
- idx_atlas_codebase_som_cluster
- idx_atlas_codebase_topology
- idx_atlas_codebase_tree_node_id
- idx_atlas_packets_som_cluster
- idx_atlas_packets_tree_node_som_cluster

### Enrichment Indexes (feature_label, file_path, summary)
(none)

### JSONB Indexes (metadata)
- idx_atlas_codebase_metadata
- idx_atlas_codebase_metadata_community_gin

### Temporal Indexes (created_at, BRIN)
- idx_atlas_codebase_created_at_brin

## Columns

- packet_key (varchar) NOT NULL
- source_ref (varchar) NOT NULL
- file_path (varchar) NOT NULL
- feature_id (varchar) NOT NULL
- feature_label (varchar)
- community_id (int4)
- community_source (varchar)
- community_confidence (numeric)
- metadata (jsonb)
- lineage_version (varchar) NOT NULL
- ledger_type (varchar) NOT NULL
- created_at (timestamptz) NOT NULL
- updated_at (timestamptz) NOT NULL
- tree_node_id (uuid)
- som_cluster (int4)

## Pass Condition

✅ Status: WARN
⚠️ Review index coverage
