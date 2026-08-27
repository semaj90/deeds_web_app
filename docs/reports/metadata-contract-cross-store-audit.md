# Metadata Contract Cross-Store Audit

**Date**: 2026-08-26T23:30:30.785Z

## Verdicts Summary

| Field | Status | Stores | Indexed |
|-------|--------|--------|----------|
| packet_key | PASS | 2 | 1 |
| source_ref | PASS | 2 | 1 |
| sourceRef | PASS | 2 | 0 |
| feature_id | PASS | 2 | 1 |
| feature_ids | NOT_FOUND | 0 | 0 |
| qdrant_point_id | PASS | 2 | 1 |
| community_id | PASS | 3 | 1 |
| som_cluster | PASS | 3 | 1 |
| som_code | NOT_FOUND | 0 | 0 |
| som_x | WARN | 1 | 0 |
| som_y | WARN | 1 | 0 |
| ontology_label | NOT_FOUND | 0 | 0 |
| topology_label | NOT_FOUND | 0 | 0 |
| retrieval_strategy | NOT_FOUND | 0 | 0 |
| retrieval_path | NOT_FOUND | 0 | 0 |
| trace_id | NOT_FOUND | 0 | 0 |
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
