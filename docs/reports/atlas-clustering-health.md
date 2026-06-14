# Atlas Clustering Health Baseline

**Generated**: 6/14/2026, 12:47:06 PM
**Duration**: 396ms

## PostgreSQL

### Table Counts

- atlas_codebase_packets: 3251 rows
- atlas_feature_map: 19611 rows
- atlas_cards: 0 rows

### Field Coverage (atlas_codebase_packets)


### Indexes

- B-tree: 14
- GIN: 3
- BRIN: 1
- GIST: 0
- HASH: 0
- **Total**: 18

## Qdrant

### Collections

- codebase_chunks_768: 52606 points
- feature_cards_768: 0 points
- summary_layers_768: 0 points
- memory_cards_768: 0 points
- glyph_vectors_768: 0 points

### Payload Coverage Sample

- ⚠️ packet_key: 92%
- ✅ source_ref: 100%
- ✅ feature_id: 100%
- ✅ feature_label: 100%
- ✅ file_path: 100%
- ✅ tags: 100%
- ⚠️ som_cluster: 83%
- ⚠️ community_id: 72%
- ✅ lineage_version: 100%

## Redis/Valkey

**Connected**: ✅

### Key Counts

- gpu:karpathy:scores: 179
- gpu:karpathy:encoded: 217
- bifrost:*: 79
- centroid:*: 0
- som:*: 0

## Recommendations

- **MEDIUM**: Create missing tables in recommended order: atlas_svg_glyphs, atlas_topology_index, atlas_summary_layers, atlas_feature_cards, atlas_feature_edges, atlas_dependency_edges, atlas_qdrant_mirror, atlas_redis_mirror

## Issues

- ⚠️ Could not check coverage for packet_key
- ⚠️ Could not check coverage for source_ref
- ⚠️ Could not check coverage for feature_id
- ⚠️ Could not check coverage for feature_label
- ⚠️ Could not check coverage for file_path
- ⚠️ Could not check coverage for community_id
