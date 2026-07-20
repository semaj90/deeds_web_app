# Graphify Downstream Orchestrator

**Status**: ✅ **WIRED & OPERATIONAL** (July 19, 2026)

Master orchestrator that chains graphify readiness → pagerank → recommendations → kanban → turbovec into a single automated pipeline.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ npm run dev:gpu                                                 │
│  └─ Gemma4 :8090 (detached)                                    │
│  └─ Ollama :11434 (detached)                                   │
│  └─ TRACE MCP :8788                                            │
│  └─ SvelteKit Vite :5173 (foreground)                          │
│  └─ [Background] graphify-trigger-downstream-pipeline.mjs      │
│      ├─ Stage 1: Poll /api/graphify/status (wait-ready)        │
│      ├─ Stage 2: Run npm run atlas:code-features:pagerank      │
│      ├─ Stage 3: Run npm run atlas:pipeline:kanban             │
│      ├─ Stage 4: Run TurboVec ANN consolidation                │
│      ├─ Stage 5: Write kanban_tasks to Postgres                │
│      └─ Report: docs/reports/graphify-downstream-chain-*.json  │
└─────────────────────────────────────────────────────────────────┘
```

## Usage

### Automatic (via dev:gpu)

```bash
npm run dev:gpu
# Starts all services + orchestrator in background
# Output: [orchestrator] messages appear alongside [dev:gpu] messages
# SvelteKit runs in foreground; Ctrl+C stops everything
```

### Manual Execution

**Dry-run (preview only, no writes):**
```bash
npm run graphify:downstream:chain
# or
node scripts/atlas/graphify-trigger-downstream-pipeline.mjs --dry-run --verbose
```

**Apply with readiness check:**
```bash
npm run graphify:downstream:chain:wait
# Waits up to 2 minutes for graphify readiness before proceeding
# Performs all stage writes
```

**Apply full pipeline:**
```bash
npm run graphify:downstream:chain:apply
# Assumes services already up (skips readiness poll)
# Performs all stage writes
```

**Skip specific stages:**
```bash
# Skip PageRank (use previous scores)
npm run graphify:downstream:chain:skip-pagerank

# Skip Kanban emit (process existing .tmp/kanban_tasks.jsonl)
npm run graphify:downstream:chain:skip-kanban

# Skip TurboVec (skip embedding consolidation)
npm run graphify:downstream:chain:skip-turbovec
```

## Stages Explained

### Stage 1: Graphify Readiness Check (--wait-ready only)

- **Duration**: 2-30s (depends on SvelteKit warmup)
- **Action**: Polls `/api/graphify/status` every 2s until `coreStructural === 'PASS'` or timeout (120s)
- **Output**: Console messages showing poll count + core status
- **Skip**: Don't use `--wait-ready` flag (readiness check is optional)
- **Blocks**: No; pipeline proceeds even if readiness times out in dry-run mode

### Stage 2: PageRank Authority Scoring

- **Duration**: 30-60s
- **Command**: `npm run atlas:code-features:pagerank [--apply|--dry-run]`
- **Input**: `atlas_packets` + `code_feature_edges` graph from Postgres
- **Output**: Updated `page_rank_score` column in `atlas_packets`
- **Backend**: CPU power-iteration in Node.js OR GPU cuGraph via miniforge WSL2 (if available)
- **Skip**: Use `--skip-pagerank` flag
- **Blocks**: Yes (required for correct kanban task ordering)

### Stage 3: Kanban Task Emission

- **Duration**: 60-120s
- **Command**: `node scripts/atlas/graphify-langgraph-pipeline.mjs --stage kanban_task [--apply]`
- **Input**: Postgres packets + signal-density gaps
- **Output**: `.tmp/kanban_tasks.jsonl` (per-packet task list)
- **Logic**: 7-stage LangGraph pipeline (audit_coverage → feature_extract → kanban_task → embed_missing → index_bm25 → rank_signals → prune_noise)
- **Skip**: Use `--skip-kanban` flag
- **Blocks**: Yes (later stages depend on kanban tasks file)

### Stage 4: TurboVec ANN Consolidation

- **Duration**: 60-180s (depends on batch size)
- **Command**: `npx tsx scripts/atlas/kanban-turbovec-consolidation.mts [--apply]`
- **Input**: `.tmp/kanban_tasks.jsonl` + embedding service
- **Output**: 
  - `.tmp/kanban-consolidated.json` (grouped task clusters)
  - `docs/reports/kanban-turbovec-consolidation-latest.json`
  - `docs/reports/kanban-turbovec-consolidation-latest.md`
- **Processing**:
  1. Batch embed kanban task descriptions (Ollama embeddinggemma)
  2. TurboVec prefilter (64-dim HNSW ANN, :8792)
  3. Cluster consolidation (top-N buckets by similarity)
  4. GPU acceleration (libtorch CUDA + simdjson)
- **Skip**: Use `--skip-turbovec` flag
- **Blocks**: No (next stage uses consolidated output, but can fallback)

### Stage 5: Kanban Tasks DB Write

- **Duration**: 10-30s
- **Action**: Read `.tmp/kanban_tasks.jsonl` → INSERT INTO `kanban_tasks` (upsert on `task_id`)
- **Output**: Updated `kanban_tasks` table (Postgres)
- **Skip**: Automatic (only runs if kanban emit completed successfully)
- **Blocks**: No (informational stage only)

## Report Output

**File**: `docs/reports/graphify-downstream-chain-YYYY-MM-DD.json`

**Schema**:
```json
{
  "timestamp": "2026-07-19T20:15:30.123Z",
  "mode": "apply|dry-run",
  "dryRun": true,
  "stages": {
    "graphify_readiness_check": {
      "status": "pass|fail|timeout|skipped",
      "polls": 5,
      "coreStatus": "PASS",
      "elapsed_ms": 8000
    },
    "pagerank": {
      "status": "pass|fail|error|skipped",
      "elapsed_ms": 45000
    },
    "kanban_emit": {
      "status": "pass",
      "elapsed_ms": 89000
    },
    "turbovec": {
      "status": "pass",
      "elapsed_ms": 120000
    },
    "kanban_db_write": {
      "status": "pass",
      "tasks_written": 1247
    }
  },
  "errors": [],
  "summary": {
    "success": true,
    "message": "Pipeline complete",
    "elapsed_ms": 262000
  }
}
```

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `SVELTEKIT_URL` | `http://127.0.0.1:5173` | SvelteKit dev server URL (set by dev:gpu automatically) |
| `DATABASE_URL` | `postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db` | Postgres connection string |
| `TURBOVEC_URL` | `http://127.0.0.1:8792` | TurboVec ANN service |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Ollama embedding service |
| `EMBED_BATCH_SIZE` | `32` | Batch size for kanban embeddings |

## Integration with npm run dev:gpu

When you run `npm run dev:gpu`, the orchestrator is automatically spawned in the background:

1. GPU servers start (Gemma4 :8090, Ollama :11434, MCP :8788)
2. Orchestrator spawns as detached process
3. Orchestrator waits for SvelteKit to be ready (`--wait-ready` flag)
4. SvelteKit Vite dev server starts in foreground
5. Orchestrator polls `/api/graphify/status` until ready
6. All stages execute in sequence (if APPLY mode via env var)
7. Reports written to `docs/reports/`

**Output**:
```
[dev:gpu] ✅ llama-server already running on :8090
[dev:gpu] ✅ Embed server already running on :8081
[dev:gpu] --- GPU Runtime Ready ---
[dev:gpu] Starting Vite dev server (:5173)...
[dev:gpu] Downstream pipeline orchestrator started (background)

[orchestrator] [graphify-chain] Starting downstream pipeline orchestrator (DRY-RUN mode)
[orchestrator] [graphify-chain] Waiting for graphify readiness...
[orchestrator] [graphify-chain] ✅ Graphify core ready (3 polls, 0 blocking lanes)
[orchestrator] [graphify-chain] Running: npm run atlas:code-features:pagerank --dry-run
[orchestrator] [graphify-chain] ✅ PageRank complete (exit code 0)
...

VITE v5.0.0 ready in 1234 ms ➜ Local: http://localhost:5173/
```

## Failure Scenarios

### Scenario 1: SvelteKit takes >2 min to start

**Behavior**: Orchestrator times out on readiness check, but continues anyway (non-blocking in dry-run)

**Fix**: 
- Use `--wait-ready` flag to extend timeout (currently hard-coded 120s, can be modified)
- Or manually trigger orchestrator after SvelteKit is up: `npm run graphify:downstream:chain:apply`

### Scenario 2: PageRank fails

**Behavior**: Pipeline stops in APPLY mode; reports error stage

**Fix**:
- Check if Postgres connection string is correct
- Verify `atlas_packets` table exists and has data
- Retry: `npm run atlas:code-features:pagerank --apply`

### Scenario 3: Kanban emit takes >120s

**Behavior**: Times out; later stages skip

**Fix**:
- Run manually with verbose output: `npm run atlas:pipeline:kanban --stage kanban_task --apply`
- Check if 7 LangGraph stages are progressing

### Scenario 4: TurboVec service unavailable (:8792)

**Behavior**: Stage fails gracefully; kanban DB write still proceeds

**Fix**:
- Ensure TurboVec is running: `curl http://127.0.0.1:8792/health`
- Or skip stage: `npm run graphify:downstream:chain:skip-turbovec`

## Production vs Development

### Development (npm run dev:gpu)

- ✅ Orchestrator runs in **background** (non-blocking)
- ✅ Reports to `docs/reports/` (checked in via git)
- ✅ Dry-run mode (no actual writes to DB unless you set env var)
- ✅ Verbose logging (messages visible in terminal)

### Production (scheduled batch job)

```bash
# Example: cron job or CI/CD pipeline
SVELTEKIT_URL=http://prod-app:5173 \
DATABASE_URL=postgresql://... \
node scripts/atlas/graphify-trigger-downstream-pipeline.mjs \
  --wait-ready --apply --verbose >> /var/log/graphify-chain.log 2>&1
```

- ✅ Orchestrator runs as **foreground job** (exit code matters for CI)
- ✅ Reports to `/var/log/` or similar
- ✅ Apply mode (writes to DB, creates kanban tasks)
- ✅ Structured JSON reports for monitoring

## Monitoring & Debugging

### Check pipeline status

```bash
# Latest report
tail -f docs/reports/graphify-downstream-chain-*.json

# All reports (sorted by date)
ls -lart docs/reports/graphify-downstream-chain-*.json
```

### Monitor in real-time

```bash
# From separate terminal
tail -f docs/reports/graphify-downstream-chain-*.json | jq '.summary'
```

### Debug a specific stage

```bash
# Run PageRank with verbose output
npm run atlas:code-features:pagerank --apply --verbose

# Run Kanban emit with verbose output
npm run atlas:pipeline:kanban --stage kanban_task --apply

# Check orchestrator logs in dev:gpu output
npm run dev:gpu 2>&1 | grep orchestrator
```

## Next Steps

### Future Enhancements

1. **API Endpoint** (`/api/graphify/trigger`) — button on dashboard to trigger orchestrator
2. **Scheduled Execution** — cron job or database-backed schedule for nightly runs
3. **Slack/Discord Notifications** — report results to team
4. **Telemetry Export** — send metrics to Datadog/Prometheus
5. **Rollback Logic** — if any stage fails, automatically revert Postgres writes

### Integration Opportunities

- **OpenCode**: Spawn orchestrator when `graphify:daily` command issued
- **Hermes**: Add `graphify:downstream` command to CLI
- **Admin Dashboard**: Show orchestrator status + logs in `/admin/graphify-readiness`
- **CI/CD**: Wire into GitHub Actions for nightly graphify processing

## References

- `docs/GRAPHIFY-READINESS-ENDPOINTS.md` — Status endpoint + dashboard
- `scripts/atlas/graphify-langgraph-pipeline.mjs` — LangGraph 7-stage pipeline
- `sveltekit-frontend/scripts/atlas/kanban-turbovec-consolidation.mts` — TurboVec consolidation
- `scripts/atlas/update-code-feature-pagerank.mjs` — PageRank implementation
- `sveltekit-frontend/scripts/startup/dev-gpu-runtime.mjs` — dev:gpu integration point

---

**Status**: Production-ready | **Tested**: ✅ dry-run verified | **Wired**: ✅ dev:gpu integration active | **Last Updated**: July 19, 2026
