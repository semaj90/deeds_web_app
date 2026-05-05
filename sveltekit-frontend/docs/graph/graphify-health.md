# Graphify Health Report

*Generated: 2026-05-05T04:07:57.551Z*

## Summary

| Metric | Value | Status |
|--------|-------|--------|
| Redis wiki notes | 831 | ✅ |
| Gemma4 summaries | 688 / 831 (83%) | ✅ |
| BoW chunk tiles | 3263 | ✅ |
| BoW cluster tiles | 100 | ✅ |
| Qdrant glyph_atlas | 676 pts | ✅ |
| Graph JSON nodes | 0 | ⚠️ |
| Graph JSON edges | 0 | ⚠️ |
| AGENTS.md mirrors | 250 | ✅ |

## Graphify Tiers

| Tier | Command | Status |
|------|---------|--------|
| **Daily map** | `npm run graphify:daily` | ✅ populated |
| **Semantic index** | `npm run graphify:semantic` | ⚠️ run needed |
| **GPU batch** | `npm run graphify:batch-gpu-analysis` | ✅ complete |
| **BoW tiles** | `npm run graphify:bow-tiles:fast` | ✅ built |
| **ACE smoke** | `npm run graphify:ace-smoke` | ✅ pass |

## Recommendations

- ✅ All tiers healthy — no action needed

## Raw JSON

See `docs/graph/graphify-health.json` for machine-readable data.
