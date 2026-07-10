# Packet-JEPA Train Report

Generated: 2026-07-10T14:53:55.339040Z
Mode: train

## Evaluation

- embedding384_cosine: Recall@10=0.9662, MRR=0.7761, NDCG@10=0.7985, domain_F1=0.0636
- pca128_cosine: Recall@10=0.9628, MRR=0.7876, NDCG@10=0.8002, domain_F1=0.0736
- packet_jepa_128: Recall@10=0.9662, MRR=0.7443, NDCG@10=0.7818, domain_F1=0.0668

## Next Safe Action

node scripts/atlas/score-packet-jepa-similarity.mjs --dry-run --limit=500

