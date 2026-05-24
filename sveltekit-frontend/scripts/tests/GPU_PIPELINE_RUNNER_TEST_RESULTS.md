# GPU Pipeline Runner Test Results

**Date**: 2026-04-19
**Runner**: `scripts/gpu-pipeline-runner.mjs`
**Dev Server**: `http://localhost:5173`
**Platform**: Windows 10, RTX 3060 Ti, CUDA 12.1

---

## Test Summary

| Command | Status | Notes |
|---------|--------|-------|
| `status` | PASS | CUDA available, 0 mirrored, 0 tags, 0 todos |
| `gpu-tag --dry-run --limit 50` | PASS | 0 processed (all already tagged, no `--force`) |
| `gpu-tag --dry-run --limit 20 --force` | PASS | 200 chunks, 185 tagged, 4.15ms/chunk, 831ms total |
| `gpu-tag --dry-run --limit 20 --force` (post-fix) | PASS | 200 chunks, 185 tagged, 14.05ms/chunk, 2.8s total; progress bar 100% correct |
| `index-stream --cluster 0 --dry-run --limit 20` | PASS | 0 chunks matched (no GPU cluster IDs assigned yet — expected) |
| `generate-todos --dry-run` | PASS | Job dispatched, polling works with progress bars; LLM inference >30s (expected) |

**Overall**: 6/6 commands PASS

---

## Bugs Found & Fixed

### 1. Progress Bar 1000% Overflow (FIXED)

**Symptom**: `gpu-tag` with `--limit 20` showed 1000% progress bar because endpoint
processed 200 chunks (batchSize=200) but bar used CLI `limit` (20) as denominator.

**Root Cause**: Line 198 used `limit` as the total for `progressLine()`, but the Qdrant
scroll endpoint uses internal `batchSize` (default 200) which returns more chunks than
the CLI limit.

**Fix**: Replaced static `limit` with dynamic `estimatedTotal` that grows based on
`data.totalProcessed` and `data.hasMore` from the SSE stream. When `hasMore` is true,
adds 100 headroom; when false (final batch), snaps to actual `totalProcessed`.

```javascript
// Before (line 196-199)
const total = LIMIT || Math.max(totalProcessed * 1.2, totalProcessed + 100);
progressLine('classify', totalProcessed, limit, ...);

// After
if (data.hasMore) {
    estimatedTotal = Math.max(estimatedTotal, totalProcessed + 100);
} else {
    estimatedTotal = totalProcessed;
}
progressLine('classify', totalProcessed, estimatedTotal, ...);
```

### 2. Bifrost Down — Ollama Provider Missing base_url (FIXED)

**Symptom**: `legal-ai-bifrost` container exited with code 137 (SIGTERM).

**Root Cause**: Ollama provider was deleted and re-added via curl without the required
`base_url` field. The Bifrost API field is `provider` (not `name`), and `base_url` must
be set for Ollama providers. Without it, Bifrost couldn't reach Ollama, hit 15s gateway
timeouts, then received SIGTERM.

**Fix**: Restarted container, deleted broken provider, re-added with correct config:
```bash
docker start legal-ai-bifrost

curl -X DELETE http://localhost:3040/api/providers/ollama

curl -X POST http://localhost:3040/api/providers \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "ollama",
    "base_url": "http://host.docker.internal:11434",
    "keys": [{
      "name": "ollama-key",
      "value": "ollama",
      "models": ["gemma4-rotorquant:latest", "embeddinggemma:latest", "gemma3:latest", "nomic-embed-text:latest", "gemma3:270m"],
      "enabled": true,
      "weight": 1
    }],
    "network_config": { "default_request_timeout_in_seconds": 120, "max_retries": 1 }
  }'
```

**Key Learning**: When re-adding Bifrost providers:
- Use `"provider"` field (not `"name"`) for the provider type
- Always include `"base_url"` — required for Ollama providers
- Host Ollama URL from Docker: `http://host.docker.internal:11434`

---

## GPU Tag Distribution (from dry run, 200 chunks)

| Tag | Count |
|-----|-------|
| page-component | 118 |
| ui-component | 85 |
| server-module | 78 |
| api-route | 66 |
| sse | 27 |
| embedding | 23 |
| database | 20 |
| cache | 19 |
| types | 13 |
| analytics | 13 |
| vector-search | 11 |
| config | 11 |
| ml-inference | 7 |
| graph-db | 7 |
| rag-pipeline | 3 |
| state-machine | 1 |

---

## Environment Verified

- **CUDA**: Available (RTX 3060 Ti)
- **LibTorch**: Loaded via tensorrt_bridge.node
- **Qdrant**: 15,651 points in `codebase_chunks_768`
- **Bifrost**: Active (provider_status: "active")
- **Ollama**: Accessible at localhost:11434
- **Dev Server**: Running on port 5173

---

## VS Code Tasks Verified

All 10 pipeline runner tasks in `.vscode/tasks.json` reference correct commands:

1. `GPU Karpathy Tag (progress bar)` — `gpu-tag`
2. `GPU Karpathy Tag (dry run)` — `gpu-tag --dry-run --limit 500`
3. `Codebase Intelligence Status` — `status`
4. `Index Stream: Cluster pipeline` — `index-stream`
5. `Index Stream: Cluster pipeline (dry run)` — `index-stream --dry-run`
6. `Predictive Todos: Generate` — `generate-todos`
7. `Pipeline: Full GPU Intelligence` — `full-pipeline --clusters 0-5`
8. `Pipeline: Full GPU Intelligence Extended` — `full-pipeline --clusters 0-11`
9. `Pipeline: Full GPU Intelligence (dry run)` — `full-pipeline --clusters 0-5 --dry-run`
10. `Pipeline Runner: Help` — `--help`

---

## Known Limitations

1. **No GPU cluster IDs**: Chunks in Qdrant don't have `neo4j_gpuCluster` or `som_cluster`
   assigned yet. The GPU clustering pipeline (LibTorch k-means + SOM) needs to run first
   for `index-stream` to find chunks by cluster.

2. **generate-todos LLM latency**: Gemma4 predictive gap analysis takes 30-60s+.
   The runner's default polling timeout is 120s (60 polls x 2s), which is sufficient.

3. **Bifrost provider config not persisted**: If the Bifrost container is recreated
   (not just restarted), the Ollama provider config will be lost and needs re-adding.
