# Phase 10A — Autoencoder Pipeline Fixed

> Status: COMPLETE  
> Date: 2026-05-17  
> Autoencoder: 768→256→64→256→768 · trained on 41,822 vectors · best loss: 0.007173 · CUDA RTX 3060 Ti  
> NN-positive contrastive loss (768d nearest-neighbour pairs) · variance 0.015266 · NN overlap@5 73%

---

## Checklist

- [x] Confirm `ace:autoencoder:weights` exists.
- [x] Confirm trained weights are not random/Xavier (bestLoss = 0.0505 ≪ 1.0).
- [x] Convert `ace:autoencoder:meta` from string to Redis hash.
- [x] Fix `train-autoencoder.py` so future Python runs write meta as hash (`r.delete() + r.hset(mapping=...)`).
- [x] Add `ae:encode:redis` script (`scripts/ae-encode-to-redis.mjs`).
- [x] Populate `gpu:karpathy:encoded` (3,144 file-level 64d vectors).
- [x] Fix activation function mismatch: JS inference now uses ReLU + L2-normalize to match PyTorch training.
- [x] Recompute centroids → `gpu:autoencoder:centroids_64` (89 cluster centroids).
- [x] Re-run `karpathy:gpu`.

## Current Redis State

```
ace:autoencoder:weights   → hash: W1/b1/W2/b2/W3/b3/W4/b4
ace:autoencoder:meta      → hash: trainedAt/bestLoss/epochs/n/device/...
gpu:karpathy:encoded      → hash: 3,144 file paths → 64d CSV
gpu:autoencoder:centroids_64 → hash: 89 centroids → 64d CSV
```

## Canonical AE Pipeline Order

```powershell
cd sveltekit-frontend

# Full retrain (Python GPU):
npm run ae:train

# OR JS fallback (CPU):
npm run ae:train:js

# Then — order matters:
npm run ae:backfill        # → Qdrant encoded_64 named vector (by point ID)
npm run ae:encode:redis    # → Redis gpu:karpathy:encoded (by file_path)
npm run ae:centroids       # → Redis gpu:autoencoder:centroids_64 (computed from Qdrant encoded_64)
npm run karpathy:gpu       # → Redis gpu:karpathy:scores (blend using fresh centroids)

# Or the full chain (package.json):
npm run graphify:autoencoder:train
```

**Why this order:**
1. `ae:backfill` writes the `encoded_64` named vector to Qdrant (needed by `ae:centroids`).
2. `ae:encode:redis` writes file-level vectors to Redis (needed by `rg-cluster-pivot.ts`).
3. `ae:centroids` reads `encoded_64` from Qdrant to compute cluster centroids.
4. `karpathy:gpu` runs the authority blend with fresh centroid routing.

## Remaining Validation

- [x] Run compression quality report: variance=0.015266, NN overlap@5=73%, status=PASS
- [x] Verify `rg-cluster-pivot.ts` reads `gpu:autoencoder:centroids_64` — wired, pre-computed centroid primary, topFiles fallback.
- [x] Wire `ae2l-pca` mode in `gpu-topology-projection.ts` — 768→AE→64→PCA→4D path complete.
- [ ] Run rg-cluster-pivot smoke test:
      `node scripts/atlas/smoke-rg-cluster-pivot.mjs --query "drizzle schema user_id mismatch"`
- [ ] Confirm pivot hits include `sourceRefs` (check `UnifiedRetrievalResult` shape vs consumer).

## Architecture

```
Qdrant codebase_chunks_768
  content (768d)            ← ground truth semantic vectors
  encoded_64 (64d)          ← backfilled by ae:backfill

Redis
  gpu:karpathy:encoded      ← file_path → 64d (populated by ae:encode:redis)
  gpu:autoencoder:centroids_64 ← 89 centroids (populated by ae:centroids)
  gpu:karpathy:scores       ← file_path → {pr, attn, authority, blend}

rg-cluster-pivot.ts
  reads gpu:karpathy:encoded + gpu:autoencoder:centroids_64
  assigns cluster routing per query
  supplements (does NOT replace) Qdrant 768d ANN
```

## Commit Sequence

```
fix(ae): write autoencoder metadata as redis hash
feat(ae): fix activation function mismatch — ReLU + L2-norm in JS encoder
feat(ae): populate karpathy encoded vectors from trained weights
feat(ae): add compression quality validation report
feat(ae): fix graphify:autoencoder:train pipeline order
test(ace): smoke rg cluster pivot with trained centroids
```
