# Graphify Health Report

*Generated: 2026-05-05T13:30:50.393Z*

## Summary

| Metric | Value | Status |
|--------|-------|--------|
| Redis wiki notes | 1304 | ✅ |
| Gemma4 summaries | 1296 / 1304 (99%) | ✅ |
| BoW chunk tiles | 0 | ⚠️ |
| BoW cluster tiles | 100 | ⚠️ |
| Qdrant glyph_atlas | 1205 pts | ✅ |
| Graph JSON nodes | 0 | ⚠️ |
| Graph JSON edges | 0 | ⚠️ |
| AGENTS.md mirrors | 250 | ✅ |

## Graphify Tiers

| Tier | Command | Status |
|------|---------|--------|
| **Daily map** | `npm run graphify:daily` | ✅ populated |
| **Semantic index** | `npm run graphify:semantic` | ⚠️ run needed |
| **GPU batch** | `npm run graphify:batch-gpu-analysis` | ✅ complete |
| **BoW tiles** | `npm run graphify:bow-tiles:fast` | ⚠️ run needed |
| **ACE smoke** | `npm run graphify:ace-smoke` | ✅ pass |

## Recommendations

- ⚠️  Run `npm run graphify:bow-tiles:fast` — no BoW tiles in Redis

## Raw JSON

See `docs/graph/graphify-health.json` for machine-readable data.
