# Packet Contract Mirror Repair

Generated: 2026-06-26T02:02:26.695Z
Mode: dry-run

## Summary

- tables checked: 4
- statements executed: 0
- statements skipped: 55
- errors: 0

## task_semantic_packets

- exists: yes
- desired columns: canonical_source_ref, source_ref_hash
- missing columns: none
- desired indexes: tsp_source_ref_hash_idx
- missing indexes: none
- executed statements: 0

## atlas_packets

- exists: yes
- desired columns: packet_key, metadata, source_kind, source_path, reward_prior, source_ref_key, community_source, community_confidence, updated_at
- missing columns: none
- desired indexes: atlas_packets_identity_idx, atlas_packets_metadata_gin_idx, atlas_packets_metadata_path_idx, atlas_packets_metadata_hash_idx, atlas_packets_payload_hash_idx, idx_atlas_packets_payload_path, idx_atlas_packets_payload_file_url, idx_atlas_packets_feature_id, idx_atlas_packets_community_id, idx_atlas_packets_source_ref_key, idx_atlas_packets_concept_ids, idx_atlas_packets_summary_fts
- missing indexes: atlas_packets_identity_idx, atlas_packets_metadata_gin_idx, atlas_packets_metadata_path_idx, atlas_packets_metadata_hash_idx, atlas_packets_payload_hash_idx, idx_atlas_packets_payload_path, idx_atlas_packets_payload_file_url, idx_atlas_packets_feature_id, idx_atlas_packets_community_id, idx_atlas_packets_source_ref_key, idx_atlas_packets_concept_ids, idx_atlas_packets_summary_fts
- executed statements: 0

## nes_chrom_packets

- exists: yes
- desired columns: feature_ids, som_cluster, lane_ids, source_ref_id, feature_code, som_code, confidence_score, packet_zstd
- missing columns: none
- desired indexes: idx_nes_chrom_packets_feature_ids_gin, idx_nes_chrom_packets_lane_ids_gin, idx_nes_chrom_packets_som_cluster, nes_chrom_packets_source_ref_id_idx, nes_chrom_packets_feature_code_idx, nes_chrom_packets_som_code_idx, nes_chrom_packets_source_ref_trgm_idx, nes_chrom_packets_norm_source_ref_trgm_idx, nes_chrom_packets_summary_trgm_idx
- missing indexes: none
- executed statements: 0

## route_runtime_packets

- exists: yes
- desired columns: raw, prompt_hash, reward, packet_uuid, route_state, feature_id, packet_version, supersedes_packet_uuid, superseded_by, git_sha, git_diff_rank, source_ref_quality, repair_reason, repair_method
- missing columns: none
- desired indexes: rrp_packet_uuid_uidx, rrp_raw_gin, rrp_state_idx, rrp_feature_idx, idx_route_runtime_packets_feature_id, idx_route_runtime_packets_feature_ids_gin, idx_route_runtime_packets_source_refs_gin, idx_route_runtime_packets_raw_gin, idx_rrp_git_sha, idx_rrp_packet_version, idx_rrp_source_ref_quality, idx_rrp_superseded_by
- missing indexes: none
- executed statements: 0
