# Metadata Contract Cross-Store Audit

**Date**: 2026-06-23T21:03:15.791Z

## Executive Summary

| Store | Status | Tables/Collections |
|-------|--------|-------------------|
| Postgres | COMPLETE | 0 |
| Qdrant | COMPLETE | 61 |
| Neo4j | DEFERRED | (deferred) |
| Redis | COMPLETE | 8 prefix groups |

## Critical Gaps (6)

- **HIGH**: packet_key — packet_key in Qdrant but NOT in Postgres — breaks source of truth
- **HIGH**: source_ref — source_ref in Qdrant but NOT in Postgres — breaks source of truth
- **HIGH**: feature_id — feature_id in Qdrant but NOT in Postgres — breaks source of truth
- **HIGH**: qdrant_point_id — qdrant_point_id in Qdrant but NOT in Postgres — breaks source of truth
- **HIGH**: community_id — community_id in Qdrant but NOT in Postgres — breaks source of truth
- **HIGH**: som_cluster — som_cluster in Qdrant but NOT in Postgres — breaks source of truth

## Field Parity Matrix

| Field | Postgres | Qdrant | Neo4j | Redis | Verdict |
|-------|----------|--------|-------|-------|---------|
| packet_key | ⊗ | ✅ | ⊗ | ⊗ | QDRANT_ONLY |
| source_ref | ⊗ | ✅ | ⊗ | ⊗ | QDRANT_ONLY |
| sourceRef | ⊗ | ✅ | ⊗ | ⊗ | QDRANT_ONLY |
| feature_id | ⊗ | ✅ | ⊗ | ⊗ | QDRANT_ONLY |
| feature_ids | ⊗ | ✅ | ⊗ | ⊗ | QDRANT_ONLY |
| qdrant_point_id | ⊗ | ✅ | ⊗ | ⊗ | QDRANT_ONLY |
| community_id | ⊗ | ✅ | ⊗ | ⊗ | QDRANT_ONLY |
| som_cluster | ⊗ | ✅ | ⊗ | ⊗ | QDRANT_ONLY |
| som_code | ⊗ | ⊗ | ⊗ | ⊗ | MISSING |
| som_x | ⊗ | ⊗ | ⊗ | ⊗ | MISSING |
| som_y | ⊗ | ⊗ | ⊗ | ⊗ | MISSING |
| ontology_label | ⊗ | ✅ | ⊗ | ⊗ | QDRANT_ONLY |
| topology_label | ⊗ | ✅ | ⊗ | ⊗ | QDRANT_ONLY |
| retrieval_strategy | ⊗ | ⊗ | ⊗ | ⊗ | MISSING |
| retrieval_path | ⊗ | ⊗ | ⊗ | ⊗ | MISSING |
| trace_id | ⊗ | ⊗ | ⊗ | ⊗ | MISSING |
| ae_epoch | ⊗ | ⊗ | ⊗ | ⊗ | MISSING |
| ae_val_loss | ⊗ | ⊗ | ⊗ | ⊗ | MISSING |
| ae_confidence | ⊗ | ⊗ | ⊗ | ⊗ | MISSING |
| latent_64 | ⊗ | ⊗ | ⊗ | ⊗ | MISSING |
| latent_64_embedding | ⊗ | ⊗ | ⊗ | ⊗ | MISSING |
| embedding | ⊗ | ⊗ | ⊗ | ⊗ | MISSING |
| embedding_384 | ⊗ | ⊗ | ⊗ | ⊗ | MISSING |
| embedding_768 | ⊗ | ⊗ | ⊗ | ⊗ | MISSING |

## Postgres Table Inventory



## Qdrant Collection Inventory

### task_semantic_packets
- **Vector size**: 768-dim
- **Points**: 0
- **Payload fields**: 0

### phase89_error_chunks
- **Vector size**: 768-dim
- **Points**: 13
- **Payload fields**: 0

### external_error_fixes
- **Vector size**: 768-dim
- **Points**: 0
- **Payload fields**: 0

### embedding_cache
- **Vector size**: 0-dim
- **Points**: 0
- **Payload fields**: 0

### audio_segments
- **Vector size**: 0-dim
- **Points**: 0
- **Payload fields**: 0

### error_embeddings
- **Vector size**: 0-dim
- **Points**: 25
- **Payload fields**: 0

### parents_atlas_chunks
- **Vector size**: 768-dim
- **Points**: 15
- **Payload fields**: 0

### documents_atlas_768
- **Vector size**: 768-dim
- **Points**: 6515
- **Payload fields**: 0

### external_api_examples
- **Vector size**: 768-dim
- **Points**: 0
- **Payload fields**: 0

### codebase_chunks_768_repair_tmp
- **Vector size**: 0-dim
- **Points**: 16626
- **Payload fields**: 1

### external_programming_docs_64d
- **Vector size**: 64-dim
- **Points**: 0
- **Payload fields**: 0

### phase90_error_clusters
- **Vector size**: 768-dim
- **Points**: 13
- **Payload fields**: 0

### code_llm_outputs
- **Vector size**: 768-dim
- **Points**: 1
- **Payload fields**: 0

### phase90_error_cards
- **Vector size**: 768-dim
- **Points**: 13
- **Payload fields**: 0

### chunks_web_search
- **Vector size**: 0-dim
- **Points**: 54
- **Payload fields**: 0

### qdrant_docs
- **Vector size**: 768-dim
- **Points**: 10
- **Payload fields**: 0

### legal_cases
- **Vector size**: 0-dim
- **Points**: 1
- **Payload fields**: 0

### glyph_atlas
- **Vector size**: 768-dim
- **Points**: 1336
- **Payload fields**: 1

### evidence_items
- **Vector size**: 0-dim
- **Points**: 37
- **Payload fields**: 0

### codebase_chunks_64d
- **Vector size**: 64-dim
- **Points**: 40628
- **Payload fields**: 1

### scenarios
- **Vector size**: 768-dim
- **Points**: 2
- **Payload fields**: 1

### synthesis_memory_768
- **Vector size**: 0-dim
- **Points**: 2
- **Payload fields**: 0

### agent_memory_observations
- **Vector size**: 768-dim
- **Points**: 207
- **Payload fields**: 1

### research_memory_768
- **Vector size**: 0-dim
- **Points**: 2
- **Payload fields**: 0

### summary_cards_768
- **Vector size**: 768-dim
- **Points**: 4654
- **Payload fields**: 0

### scenario_cache
- **Vector size**: 768-dim
- **Points**: 0
- **Payload fields**: 0

### external_programming_docs_768
- **Vector size**: 768-dim
- **Points**: 67
- **Payload fields**: 1

### chat_messages
- **Vector size**: 0-dim
- **Points**: 68
- **Payload fields**: 0

### parent_atlas_rg_packets_768
- **Vector size**: 0-dim
- **Points**: 50
- **Payload fields**: 3

### codebase_topology_128
- **Vector size**: 0-dim
- **Points**: 0
- **Payload fields**: 0

### task_distillates
- **Vector size**: 768-dim
- **Points**: 106
- **Payload fields**: 0

### opencode_cards_768
- **Vector size**: 768-dim
- **Points**: 0
- **Payload fields**: 0

### court_opinions
- **Vector size**: 768-dim
- **Points**: 0
- **Payload fields**: 0

### case_chunks
- **Vector size**: 768-dim
- **Points**: 0
- **Payload fields**: 0

### evidence_vectors
- **Vector size**: 768-dim
- **Points**: 0
- **Payload fields**: 0

### feature_maps
- **Vector size**: 0-dim
- **Points**: 52844
- **Payload fields**: 1

### legal_canon_chunks
- **Vector size**: 0-dim
- **Points**: 59
- **Payload fields**: 0

### llm_response_cache
- **Vector size**: 0-dim
- **Points**: 114
- **Payload fields**: 0

### cluster_narratives
- **Vector size**: 0-dim
- **Points**: 20
- **Payload fields**: 0

### summary_lenses_768
- **Vector size**: 0-dim
- **Points**: 3
- **Payload fields**: 0

### BifrostSemanticCachePlugin
- **Vector size**: 768-dim
- **Points**: 5633
- **Payload fields**: 0

### document_knowledge_768
- **Vector size**: 768-dim
- **Points**: 58
- **Payload fields**: 1

### feature_registry_768
- **Vector size**: 768-dim
- **Points**: 0
- **Payload fields**: 0

### chat_documents
- **Vector size**: 768-dim
- **Points**: 4
- **Payload fields**: 0

### poi_profiles
- **Vector size**: 0-dim
- **Points**: 0
- **Payload fields**: 0

### kb_notecards
- **Vector size**: 768-dim
- **Points**: 2298
- **Payload fields**: 0

### codebase_topology_64
- **Vector size**: 0-dim
- **Points**: 0
- **Payload fields**: 0

### codebase_chunks_encoded64
- **Vector size**: 64-dim
- **Points**: 52606
- **Payload fields**: 8

### legal_glossary
- **Vector size**: 768-dim
- **Points**: 867
- **Payload fields**: 0

### atlas_component_profiles_768
- **Vector size**: 768-dim
- **Points**: 0
- **Payload fields**: 0

### llm_wiki_chunks
- **Vector size**: 768-dim
- **Points**: 250
- **Payload fields**: 0

### legal_documents
- **Vector size**: 0-dim
- **Points**: 9840
- **Payload fields**: 0

### topic_clusters
- **Vector size**: 768-dim
- **Points**: 0
- **Payload fields**: 0

### fictional_case_chunks
- **Vector size**: 0-dim
- **Points**: 0
- **Payload fields**: 0

### knowledge_base
- **Vector size**: 768-dim
- **Points**: 115
- **Payload fields**: 0

### diagnosis_embeddings
- **Vector size**: 0-dim
- **Points**: 0
- **Payload fields**: 0

### phase76_knowledge_base
- **Vector size**: 768-dim
- **Points**: 0
- **Payload fields**: 0

### parent_atlas_feature_commands_768
- **Vector size**: 0-dim
- **Points**: 6
- **Payload fields**: 3

### codebase_chunks_768
- **Vector size**: 0-dim
- **Points**: 52606
- **Payload fields**: 10

### codebase_chunks_10m
- **Vector size**: 768-dim
- **Points**: 1000000
- **Payload fields**: 0

### document_tags
- **Vector size**: 768-dim
- **Points**: 0
- **Payload fields**: 0

## Recommendations (12)

### NAMING_DRIFT (HIGH)
**Issue**: Both source_ref and sourceRef exist
**Action**: Standardize on source_ref everywhere (Postgres, Qdrant, Neo4j)

### NAMING_DRIFT (HIGH)
**Issue**: Both feature_id and feature_ids exist
**Action**: Standardize on feature_id everywhere

### TRUTH_GAP (HIGH)
**Issue**: packet_key exists in Qdrant but not in Postgres
**Action**: Investigate whether this should be in Postgres as canonical source

### TRUTH_GAP (HIGH)
**Issue**: source_ref exists in Qdrant but not in Postgres
**Action**: Investigate whether this should be in Postgres as canonical source

### TRUTH_GAP (HIGH)
**Issue**: sourceRef exists in Qdrant but not in Postgres
**Action**: Investigate whether this should be in Postgres as canonical source

### TRUTH_GAP (HIGH)
**Issue**: feature_id exists in Qdrant but not in Postgres
**Action**: Investigate whether this should be in Postgres as canonical source

### TRUTH_GAP (HIGH)
**Issue**: feature_ids exists in Qdrant but not in Postgres
**Action**: Investigate whether this should be in Postgres as canonical source

### TRUTH_GAP (HIGH)
**Issue**: qdrant_point_id exists in Qdrant but not in Postgres
**Action**: Investigate whether this should be in Postgres as canonical source

### TRUTH_GAP (HIGH)
**Issue**: community_id exists in Qdrant but not in Postgres
**Action**: Investigate whether this should be in Postgres as canonical source

### TRUTH_GAP (HIGH)
**Issue**: som_cluster exists in Qdrant but not in Postgres
**Action**: Investigate whether this should be in Postgres as canonical source

### TRUTH_GAP (HIGH)
**Issue**: ontology_label exists in Qdrant but not in Postgres
**Action**: Investigate whether this should be in Postgres as canonical source

### TRUTH_GAP (HIGH)
**Issue**: topology_label exists in Qdrant but not in Postgres
**Action**: Investigate whether this should be in Postgres as canonical source

## Next Steps

1. **DO NOT** run backfills until gaps are understood
2. **DO NOT** create indexes until canonical schema is finalized
3. **DO NOT** proceed to PageRank or Karpathy blend until metadata contract is verified
4. **Investigate** Neo4j structure manually (run queries in Neo4j Browser)
5. **Resolve** naming drift (sourceRef vs source_ref, feature_ids vs feature_id)
6. **Confirm** which fields are immutable metadata vs runtime provenance

---

**Generated by**: `scripts/atlas/audit-metadata-contract-across-stores.mjs`
