# Rejected Semantic Training Dataset

**Generated:** 2026-07-05T22:18:54.673Z

## Summary

- **Total training rows:** 500
- **Training split:** 350 train / 75 val / 75 test

## Label Distribution

```
VectorError              :   500 (100.0%)
```

## Files

- NDJSON: `C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\.tmp\rejected-semantic-training-rows.ndjson`
- JSON: `C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\docs\reports\rejected-semantic-training-rows.json`

## Suggested Labels

These labels are used to categorize failures for model retraining:

- **IdentityError**: Missing packet_key, source_ref, feature_id, or title_id
- **VectorError**: Missing embedding or vector not indexed
- **QdrantBridgeError**: Missing qdrant_point_id (vector indexing failed)
- **TreePropagationError**: Missing tree_node_id (AST propagation failed)
- **SemanticError**: Missing semantic concepts or used_concepts empty
- **StructureError**: Missing AST symbols
- **TopologyError**: Missing SOM or PageRank
- **CachePromotionError**: Failed cache promotion

## Training Usage

Train Naive Bayes with these rows:

```bash
python scripts/atlas/train-naive-bayes-packet-features.py \
  --training-data C:\Users\james\Videos\deeds-web-app\sveltekit-frontend\.tmp\rejected-semantic-training-rows.ndjson \
  --output-model models/naive-bayes-rejected-errors.json
```

## Next Steps

1. Review label distribution
2. Train or retrain Naive Bayes classifier with these examples
3. Apply predictions to current packets
4. Validate prediction accuracy against hard failure gates
