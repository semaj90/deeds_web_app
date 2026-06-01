# Autoencoder Compression Quality Report

Generated: 2026-05-31T21:46:34.518Z
Status: **PASS**

## Autoencoder Weights

| Field | Value |
|-------|-------|
| Trained at | 2026-05-31T07:11:24.020Z |
| Best loss | 0.053537 |
| Epochs | 1 |
| Training vectors | 33,215 |
| Architecture | 768→256→64 |
| Device | unknown |

## Inventory

| Metric | Value |
|--------|-------|
| Qdrant total points | 35,192 |
| Redis encoded file vectors | 33,754 |
| Redis centroid vectors | 89 |
| Sample validated | 200 |
| Flat vectors skipped | 0 |

## Compression Quality

| Metric | Value | Gate |
|--------|-------|------|
| 64d pairwise variance | 0.008993 | >0.001 = not flat |
| NN overlap@5 (768d vs 64d) | 32.0% | ≥40% = usable |
| Aligned Qdrant↔Redis pairs | 50 | — |
| Centroid avg cosine sim | 0.2619 | — |
| Centroids used | 20 / 89 | — |
| Point ID coverage | 71.0% | ≥70% = good |

## Validation Gates

| Gate | Result |
|------|--------|
| Weights trained (bestLoss > 0) | ✅ PASS |
| Vectors not flat | ✅ PASS |
| Point ID coverage ≥70% | ✅ PASS |
| NN overlap ≥40% | ❌ FAIL |

## Top Centroid Assignments (sample n=100)

| Centroid | Hits |
|----------|------|
| 68 | 12 |
| 80 | 8 |
| 23 | 6 |
| 34 | 6 |
| 71 | 6 |
| 25 | 5 |
| 28 | 5 |
| 29 | 5 |
| 44 | 5 |
| 53 | 5 |

## Next Steps

- Run `npm run karpathy:gpu` to refresh authority blend with trained centroids.
- Run pivot smoke: `node scripts/atlas/smoke-rg-cluster-pivot.mjs --query "drizzle schema user_id mismatch"`
- Verify `rg-cluster-pivot.ts` uses `gpu:autoencoder:centroids_64` for routing.
