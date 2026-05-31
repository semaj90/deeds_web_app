# Graphify Health Report

*Generated: 2026-05-31T00:09:05.428Z*

## Summary

| Metric | Value | Status |
|--------|-------|--------|
| Redis wiki notes | 1547 | ✅ |
| Gemma4 summaries | 0 / 1547 (0%) | ❌ |
| BoW chunk tiles | 0 | ⚠️ |
| BoW cluster tiles | 100 | ⚠️ |
| Qdrant glyph_atlas | 1336 pts | ✅ |
| Graph JSON nodes | 0 | ⚠️ |
| Graph JSON edges | 0 | ⚠️ |
| AGENTS.md mirrors | 2 | ✅ |
| Manifold clusters | 20 | ✅ |
| SOM Weights | ✅ | ✅ |
| Autoencoder weights | weightsType=hash, encodedType=none, centroids=yes | ⚠️ |
| Atlas seed count | 2 | ❌ |
| Atlas seed status | ok | - |


## Graphify Tiers

| Tier | Command | Status |
|------|---------|--------|
| **Daily map** | `npm run graphify:daily` | ✅ populated |
| **Semantic index** | `npm run graphify:semantic` | ⚠️ run needed |
| **GPU batch** | `npm run graphify:batch-gpu-analysis` | ⚠️ 0% done |
| **BoW tiles** | `npm run graphify:bow-tiles:fast` | ⚠️ run needed |
| **ACE smoke** | `npm run graphify:ace-smoke` | ✅ pass |

## Recommendations

- ⚠️  Run `npm run graphify:batch-gpu-analysis` — only 0% of wiki notes have Gemma4 summaries
- ⚠️  Run `npm run graphify:bow-tiles:fast` — no BoW tiles in Redis

- ⚠️  Run `npm run graphify:autoencoder:train` — autoencoder is still on Xavier placeholder weights

## Raw JSON

See `docs/graph/graphify-health.json` for machine-readable data.
