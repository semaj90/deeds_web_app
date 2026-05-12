# Graphify Batch GPU Analysis Report

Generated: 2026-05-11T22:12:07.933Z

## Summary

| Metric | Value |
|--------|-------|
| Files | 3930 |
| Directories | 410 |
| GPU Clusters | 20 |
| Missing clusterId | 3930 |
| Missing SOM | 3930 |
| PageRank source | fanin (1690 entries) |
| Glyphs generated | 1149 / 1371 |
| Tags updated | 0 |
| agents:dir:* keys | 315 |
| summary:cluster:* keys | 0 |
| TurboQuant (cache_prompt) | ✅ active |

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
| `src/lib/collaboration` | 0.0000 | 0.0000 | fanin |
| `src/lib/components` | 0.0000 | 0.0000 | fanin |
| `src/lib/components/admin` | 0.0000 | 0.0000 | fanin |
| `src/lib/components/agent` | 0.0000 | 0.0000 | fanin |
| `src/lib/components/agentic` | 0.0000 | 0.0000 | fanin |
| `src/lib/components/ai` | 0.0000 | 0.0000 | fanin |

## Hot Directories (processed this run)

| Directory | Files | SSR Risk | Test% |
|-----------|-------|----------|-------|
| `src` | 17 | 0 | 6% |
| `src/lib/ai` | 14 | 0 | 7% |
| `src/lib/ai/e2b` | 2 | 0 | 50% |
| `src/lib/ai/onnx` | 2 | 0 | 50% |
| `src/lib` | 11 | 0 | 9% |
| `src/lib/cache` | 5 | 0 | 0% |
| `src/lib/client/db` | 1 | 0 | 0% |
| `src/lib/client` | 6 | 0 | 17% |
| `src/lib/client/ui` | 2 | 0 | 0% |
| `src/lib/collaboration` | 1 | 0 | 0% |

## Recommendations

- Run `npm run graphify:semantic` to assign GPU cluster IDs (3930 files missing)
- Run `npm run graphify:topology` to assign SOM coordinates (3930 files missing)
- 222 glyph(s) failed — check Ollama connectivity
- Run `npm run graphify:ace-smoke` to validate ACE retrieval of directory-cluster hits
