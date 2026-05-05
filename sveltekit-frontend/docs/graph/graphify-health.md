# Graphify Health Report

*Generated: 2026-05-05T03:26:59.492Z*

## Summary

| Metric | Value | Status |
|--------|-------|--------|
| Redis wiki notes | 423 | ✅ |
| Gemma4 summaries | 203 / 423 (48%) | ⚠️ |
| BoW chunk tiles | 3263 | ✅ |
| BoW cluster tiles | 0 | ✅ |
| Qdrant glyph_atlas | 190 pts | ✅ |
| Graph JSON nodes | 0 | ⚠️ |
| Graph JSON edges | 0 | ⚠️ |
| AGENTS.md mirrors | 250 | ✅ |

## Graphify Tiers

| Tier | Command | Status |
|------|---------|--------|
| **Daily map** | `npm run graphify:daily` | ✅ populated |
| **Semantic index** | `npm run graphify:semantic` | ⚠️ run needed |
| **GPU batch** | `npm run graphify:batch-gpu-analysis` | ⚠️ 48% done |
| **BoW tiles** | `npm run graphify:bow-tiles:fast` | ✅ built |
| **ACE smoke** | `npm run graphify:ace-smoke` | ✅ pass |

## Recommendations

- ⚠️  Run `npm run graphify:batch-gpu-analysis` — only 48% of wiki notes have Gemma4 summaries

## Raw JSON

See `docs/graph/graphify-health.json` for machine-readable data.
