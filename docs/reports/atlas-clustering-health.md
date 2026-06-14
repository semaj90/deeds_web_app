# Atlas Clustering Health — Phase 1B

**Timestamp**: 2026-06-14T21:01:34.289Z

## Postgres Ledgers

### atlas_codebase_packets
- **Total**: 3251
- **Coverage Source**: field_by_field_fallback
- **Fields**:
  - packet_key: 3251/3251 (100.0%)
  - source_ref: 3251/3251 (100.0%)
  - feature_id: 3251/3251 (100.0%)
  - feature_label: 3251/3251 (100.0%)
  - file_path: 3251/3251 (100.0%)
  - community_id: 3226/3251 (99.2%)
  - summary: 0/3251 (0.0%)
  - som_cluster: 3251/3251 (100.0%)
  - tree_node_id: 0/3251 (0.0%)
  - lineage_version: 3251/3251 (100.0%)

### atlas_feature_packets
- **Status**: present
- **Total**: 14234

## Redis Cache

- **gpu:karpathy:scores**: 179 entries
- **gpu:karpathy:encoded**: 217 entries
- **bifrost:*** keys: 79

## Status

✅ Postgres ledger split complete
⚠️ Coverage queries using fallback
✅ Redis cache operational

## Next: Phase 1B Gates

- [ ] Verify postgres adaptive indexes
- [ ] Repair Qdrant payload contract
- [ ] Audit Bitfrost semantic cache
