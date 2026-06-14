# Feature/Metadata Column Audit

**Generated**: 2026-06-14T03:02:58.830Z

## Summary
- **Total tables**: 47
- **Canonical PASS**: 4/47
- **Optimal PASS**: 0/47

## Canonical Fields (Required)
- feature_id
- source_ref
- file_path
- feature_label
- metadata
- updated_at

## Optional Fields (Recommended)
- group_id
- cluster_id
- community_id
- qdrant_tag_id
- centroid_id
- som_cluster
- domain
- domain_class
- ontology

## Table Coverage

### atlas_cards
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 0
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, source_ref, file_path, feature_label, metadata, updated_at | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### atlas_cold_storage_manifest
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 0
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: file_path, feature_label, metadata | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### atlas_cold_storage_stats
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 1
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, source_ref, file_path, feature_label, metadata, updated_at | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### atlas_directory_manifest
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 1,941
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, source_ref, file_path, feature_label, metadata | optional: group_id, cluster_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### atlas_feature_dict
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 1,122
- **Indexes**: feature_id=✅, metadata=❌
- **Missing**: CANONICAL: source_ref, file_path, feature_label, metadata, updated_at | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### atlas_feature_map
- **Status**: ✅ canonical, ⚠️  optional
- **Rows**: 19,611
- **Indexes**: feature_id=✅, metadata=✅
- **Missing**: optional: group_id, community_id, qdrant_tag_id, domain, domain_class, ontology

### atlas_feature_map_history
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 185,583
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: file_path, feature_label, metadata, updated_at | optional: group_id, community_id, qdrant_tag_id, domain, domain_class, ontology

### atlas_feature_map_synthesized
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 14,465
- **Indexes**: feature_id=✅, metadata=❌
- **Missing**: CANONICAL: file_path, feature_label, metadata, updated_at | optional: group_id, community_id, qdrant_tag_id, domain, domain_class, ontology

### atlas_feature_synthesis
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 1,124
- **Indexes**: feature_id=✅, metadata=❌
- **Missing**: CANONICAL: source_ref, file_path, feature_label, metadata | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### atlas_hidden_artifacts
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 27
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, source_ref, file_path, feature_label, metadata, updated_at | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### atlas_lane_dict
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 6
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, source_ref, file_path, feature_label, metadata, updated_at | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### atlas_manifest_coverage
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 1
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, source_ref, file_path, feature_label, metadata, updated_at | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### atlas_manifest_source_refs
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 5,542
- **Indexes**: feature_id=✅, metadata=❌
- **Missing**: CANONICAL: file_path, feature_label, metadata, updated_at | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### atlas_memory_address_registry
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 9,099
- **Indexes**: feature_id=✅, metadata=❌
- **Missing**: CANONICAL: file_path, feature_label, metadata | optional: group_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### atlas_orphaned_artifacts_summary
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 1
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, source_ref, file_path, feature_label, metadata, updated_at | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### atlas_packets
- **Status**: ✅ canonical, ⚠️  optional
- **Rows**: 17,476
- **Indexes**: feature_id=✅, metadata=✅
- **Missing**: optional: group_id, qdrant_tag_id, centroid_id, som_cluster, domain, ontology

### atlas_packets_backup_20260612
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 2,009
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: file_path, feature_label, metadata | optional: group_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### atlas_paths
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 0
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, source_ref, file_path, feature_label, metadata, updated_at | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### atlas_runtime_map
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 0
- **Indexes**: feature_id=✅, metadata=❌
- **Missing**: CANONICAL: source_ref, file_path, feature_label, metadata | optional: group_id, cluster_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### atlas_source_ref_dict
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 14,471
- **Indexes**: feature_id=✅, metadata=✅
- **Missing**: CANONICAL: file_path, updated_at | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### atlas_source_ref_synthesis
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 0
- **Indexes**: feature_id=✅, metadata=❌
- **Missing**: CANONICAL: file_path, feature_label, metadata | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, domain, domain_class, ontology

### atlas_source_to_file_path
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 0
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, feature_label, metadata, updated_at | optional: group_id, cluster_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### atlas_symbol_map
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 0
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, file_path, feature_label, metadata | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### atlas_toc_entries
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 0
- **Indexes**: feature_id=✅, metadata=❌
- **Missing**: CANONICAL: file_path, feature_label, metadata, updated_at | optional: group_id, cluster_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### codebase_audit_reports
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 0
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, source_ref, file_path, feature_label, metadata | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### codebase_chunk_index
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 40,754
- **Indexes**: feature_id=✅, metadata=✅
- **Missing**: CANONICAL: file_path | optional: group_id, cluster_id, qdrant_tag_id, domain_class, ontology

### codebase_embeddings
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 310
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, source_ref, file_path, feature_label, metadata, updated_at | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### codebase_files
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 310
- **Indexes**: feature_id=❌, metadata=✅
- **Missing**: CANONICAL: feature_id, source_ref, feature_label, updated_at | optional: group_id, cluster_id, qdrant_tag_id, centroid_id, som_cluster, domain_class, ontology

### codebase_graph_analysis
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 0
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, source_ref, file_path, feature_label, metadata, updated_at | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### codebase_mapreduce_jobs
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 0
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, source_ref, file_path, feature_label, metadata, updated_at | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### codebase_relationship_reports
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 1
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, source_ref, file_path, feature_label, metadata, updated_at | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### codebase_search_cache
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 0
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, source_ref, file_path, feature_label, metadata, updated_at | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### codebase_wiki_pages
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 0
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, source_ref, file_path, feature_label | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### feature_cards
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 2
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, file_path, feature_label, metadata | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### feature_dependency_edges
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 0
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, source_ref, file_path, feature_label, metadata, updated_at | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### feature_file_edges
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 34
- **Indexes**: feature_id=✅, metadata=❌
- **Missing**: CANONICAL: feature_id, source_ref, feature_label, metadata, updated_at | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### feature_implementations
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 18
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, source_ref, file_path, feature_label, metadata | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### feature_index_entries
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 5,280
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, source_ref, file_path, feature_label | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### feature_maps
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 2
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, source_ref, file_path, feature_label | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### feature_registry
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 4,299
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, source_ref, file_path, feature_label, metadata, updated_at | optional: group_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### feature_registry_vectors
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 4,317
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, source_ref, file_path, feature_label, metadata | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### feature_tasks
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 246
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, file_path, feature_label, metadata, updated_at | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### feature_todo_queue
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 131
- **Indexes**: feature_id=✅, metadata=❌
- **Missing**: CANONICAL: feature_id, source_ref, feature_label, metadata, updated_at | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### glyph_records
- **Status**: ✅ canonical, ⚠️  optional
- **Rows**: 14,515
- **Indexes**: feature_id=✅, metadata=✅
- **Missing**: optional: group_id, cluster_id, qdrant_tag_id, domain, domain_class, ontology

### nes_chrom_kag_dag_hits
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 32
- **Indexes**: feature_id=❌, metadata=✅
- **Missing**: CANONICAL: feature_id, file_path, feature_label, updated_at | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology

### nes_chrom_packets
- **Status**: ✅ canonical, ⚠️  optional
- **Rows**: 14,911
- **Indexes**: feature_id=✅, metadata=✅
- **Missing**: optional: group_id, cluster_id, qdrant_tag_id, centroid_id, domain, ontology

### packet_markdown_chunks
- **Status**: ❌ canonical, ⚠️  optional
- **Rows**: 14,515
- **Indexes**: feature_id=❌, metadata=❌
- **Missing**: CANONICAL: feature_id, source_ref, file_path, feature_label, metadata, updated_at | optional: group_id, cluster_id, community_id, qdrant_tag_id, centroid_id, som_cluster, domain, domain_class, ontology


## Next Steps

1. `npm run atlas:feature-metadata:backfill -- --dry-run` — Preview changes
2. `npm run atlas:feature-metadata:backfill -- --apply` — Apply backfills
3. `npm run atlas:feature-metadata:verify` — Verify alignment
