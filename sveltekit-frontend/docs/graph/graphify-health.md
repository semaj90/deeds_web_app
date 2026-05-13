# Graphify Health Report

*Generated: 2026-05-13T22:28:05.468Z*

## Summary

| Metric | Value | Status |
|--------|-------|--------|
| Redis wiki notes | 471 | ✅ |
| Gemma4 summaries | 0 / 471 (0%) | ❌ |
| BoW chunk tiles | 0 | ⚠️ |
| BoW cluster tiles | 0 | ⚠️ |
| Qdrant glyph_atlas | 1336 pts | ✅ |
| Graph JSON nodes | 0 | ⚠️ |
| Graph JSON edges | 0 | ⚠️ |
| AGENTS.md mirrors | 364 | ✅ |
| Manifold clusters | 20 | ✅ |
| SOM Weights | ✅ | ✅ |

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

## Raw JSON

See `docs/graph/graphify-health.json` for machine-readable data.
