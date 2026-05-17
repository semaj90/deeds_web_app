# Autoencoder Compression Quality Report

Generated: 2026-05-17T00:22:32.253Z
Status: **PASS**

## Autoencoder Weights

| Field | Value |
|-------|-------|
| Trained at | 2026-05-17T00:07:23.074521+00:00 |
| Best loss | 0.007173 |
| Epochs | 30 |
| Training vectors | 41,822 |
| Architecture | 768→256→64 |
| Device | NVIDIA GeForce RTX 3060 Ti |

## Inventory

| Metric | Value |
|--------|-------|
| Qdrant total points | 41,822 |
| Redis encoded file vectors | 3,144 |
| Redis centroid vectors | 89 |
| Sample validated | 200 |
| Flat vectors skipped | 0 |

## Compression Quality

| Metric | Value | Gate |
|--------|-------|------|
| 64d pairwise variance | 0.015266 | >0.001 = not flat |
| NN overlap@5 (768d vs 64d) | 73.0% | ≥40% = usable |
| Aligned Qdrant↔Redis pairs | 50 | — |
| Centroid avg cosine sim | 0.7364 | — |
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
| 68 | 9 |
| 27 | 5 |
| 88 | 5 |
| 3 | 4 |
| 11 | 4 |
| 16 | 4 |
| 26 | 4 |
| 30 | 4 |
| 79 | 4 |
| 10 | 3 |

## Next Steps

- Run `npm run karpathy:gpu` to refresh authority blend with trained centroids.
- Run pivot smoke: `node scripts/atlas/smoke-rg-cluster-pivot.mjs --query "drizzle schema user_id mismatch"`
- Verify `rg-cluster-pivot.ts` uses `gpu:autoencoder:centroids_64` for routing.
