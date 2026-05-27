# Autoencoder Compression Quality Report

Generated: 2026-05-27T15:09:34.420Z
Status: **PASS**

## Autoencoder Weights

| Field | Value |
|-------|-------|
| Trained at | 2026-05-27T15:03:29.074123+00:00 |
| Best loss | 0.007056 |
| Epochs | 30 |
| Training vectors | 74,743 |
| Architecture | 768→256→64 |
| Device | NVIDIA GeForce RTX 3060 Ti |

## Inventory

| Metric | Value |
|--------|-------|
| Qdrant total points | 74,743 |
| Redis encoded file vectors | 3,951 |
| Redis centroid vectors | 89 |
| Sample validated | 200 |
| Flat vectors skipped | 0 |

## Compression Quality

| Metric | Value | Gate |
|--------|-------|------|
| 64d pairwise variance | 0.015161 | >0.001 = not flat |
| NN overlap@5 (768d vs 64d) | 61.0% | ≥40% = usable |
| Aligned Qdrant↔Redis pairs | 50 | — |
| Centroid avg cosine sim | 0.7130 | — |
| Centroids used | 20 / 89 | — |
| file_path coverage | 100.0% | ≥80% = good |

## Validation Gates

| Gate | Result |
|------|--------|
| Weights trained (bestLoss > 0) | ✅ PASS |
| Vectors not flat | ✅ PASS |
| file_path coverage ≥80% | ✅ PASS |
| NN overlap ≥40% | ✅ PASS |

## Top Centroid Assignments (sample n=100)

| Centroid | Hits |
|----------|------|
| 28 | 5 |
| 40 | 5 |
| 81 | 5 |
| 7 | 4 |
| 27 | 4 |
| 53 | 4 |
| 88 | 4 |
| 5 | 3 |
| 19 | 3 |
| 21 | 3 |

## Next Steps

- Run `npm run karpathy:gpu` to refresh authority blend with trained centroids.
- Run pivot smoke: `node scripts/atlas/smoke-rg-cluster-pivot.mjs --query "drizzle schema user_id mismatch"`
- Verify `rg-cluster-pivot.ts` uses `gpu:autoencoder:centroids_64` for routing.
