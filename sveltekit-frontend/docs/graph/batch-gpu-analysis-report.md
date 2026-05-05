# Graphify Batch GPU Analysis Report

Generated: 2026-05-05T03:05:54.482Z

## Summary

| Metric | Value |
|--------|-------|
| Files | 3374 |
| Directories | 365 |
| GPU Clusters | 20 |
| Missing clusterId | 3374 |
| Missing SOM | 3374 |
| PageRank source | fanin (1377 entries) |
| Glyphs generated | 5 / 5 |
| Tags updated | 0 |

## Top Directories by PageRank

| Directory | avg | max | source |
|-----------|-----|-----|--------|
| `src` | 0.0000 | 0.0000 | fanin |
| `src/lib/ai` | 0.0000 | 0.0000 | fanin |
| `src/lib/ai/e2b` | 0.0000 | 0.0000 | fanin |
| `src/lib/ai/onnx` | 0.0000 | 0.0000 | fanin |
| `src/lib` | 0.0000 | 0.0000 | fanin |
| `src/lib/cache` | 0.0000 | 0.0000 | fanin |
| `src/lib/client/db` | 0.0000 | 0.0000 | fanin |
| `src/lib/client` | 0.0000 | 0.0000 | fanin |
| `src/lib/client/ui` | 0.0000 | 0.0000 | fanin |
| `src/lib/components` | 0.0000 | 0.0000 | fanin |
| `src/lib/components/admin` | 0.0000 | 0.0000 | fanin |
| `src/lib/components/agent` | 0.0000 | 0.0000 | fanin |
| `src/lib/components/agentic` | 0.0000 | 0.0000 | fanin |
| `src/lib/components/ai` | 0.0000 | 0.0000 | fanin |
| `src/lib/components/ai/CaseScoringDashboard` | 0.0000 | 0.0000 | fanin |

## Hot Directories (processed this run)

| Directory | Files | SSR Risk | Test% |
|-----------|-------|----------|-------|
| `src/lib/components/cache` | 3 | 0 | 0% |
| `src/lib/components/canvas` | 5 | 0 | 0% |
| `src/lib/components/canvas/hybrid` | 1 | 0 | 0% |
| `src/lib/components/case` | 3 | 0 | 0% |
| `src/lib/components/cases` | 11 | 0 | 9% |

## Recommendations

- Run `npm run graphify:semantic` to assign GPU cluster IDs (3374 files missing)
- Run `npm run graphify:topology` to assign SOM coordinates (3374 files missing)
- ✅ All glyphs generated successfully
- Run `npm run graphify:ace-smoke` to validate ACE retrieval of directory-cluster hits
