# Metadata Contract Cross-Store Audit

**Date**: 2026-06-23T20:46:08.043Z

## Verdicts Summary

| Field | Status | Stores | Indexed |
|-------|--------|--------|----------|
| packet_key | PASS | 3 | 1 |
| source_ref | PASS | 3 | 1 |
| sourceRef | WARN | 1 | 0 |
| feature_id | PASS | 3 | 1 |
| feature_ids | PASS | 2 | 1 |
| qdrant_point_id | PASS | 2 | 1 |
| community_id | PASS | 3 | 1 |
| som_cluster | PASS | 2 | 1 |
| som_code | WARN | 1 | 0 |
| som_x | WARN | 1 | 0 |
| som_y | WARN | 1 | 0 |
| ontology_label | PASS | 2 | 0 |
| topology_label | WARN | 1 | 0 |
| retrieval_strategy | FAIL | 2 | 0 |
| retrieval_path | WARN | 1 | 0 |
| trace_id | PASS | 3 | 0 |
| ae_epoch | WARN | 1 | 0 |
| ae_val_loss | WARN | 1 | 0 |
| ae_confidence | NOT_FOUND | 0 | 0 |
| latent_64 | WARN | 1 | 0 |
| latent_64_embedding | NOT_FOUND | 0 | 0 |
| embedding | WARN | 1 | 0 |
| embedding_384 | NOT_FOUND | 0 | 0 |
| embedding_768 | NOT_FOUND | 0 | 0 |

## Blockers

- **Qdrant naming conflict: source_ref vs sourceRef** (WARN)
- **Qdrant naming conflict: feature_id vs feature_ids** (WARN)
- **Critical field missing from Qdrant: retrieval_strategy** (CRITICAL)
  - Impact: ACE/KAG/DAG retrieval cannot filter by this field
