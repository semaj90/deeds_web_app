# TRACE Stack — Canonical Startup Guide

## Canonical local startup

```powershell
npm run trace:start
```

This runs `scripts/start-trace-stack.ps1` and brings up all services in tier order with
health-check gating. Writes three artifact files to `memory/runs/<run_id>/`:

| File | Contents |
|------|----------|
| `startup_health.json` | Reachability per service after launch |
| `trace_stack_pids.json` | OS PIDs of all started background processes |
| `background_jobs.json` | Async jobs kicked off (synthesis, SOM, etc.) |

---

## Startup tiers

| Tier | Services | Port | Gate |
|------|----------|------|------|
| 0 | Langfuse (inference traces) | 3030 | health check only — soft fail |
| 0 | Bifrost (L2 semantic cache) | 3040 | health check → `docker compose --profile full up -d bifrost` if down |
| 0.5 | go-retrieval-service (gRPC + HTTP) | 8100 / 50053 | binary launch if present |
| 1 | TurboQuant llama-server.exe | 8090 | waits until healthy before opening MCP |
| 1 | topology-search server | 8101 | parallel with TurboQuant |
| 2 | TRACE MCP cluster | 8788 | starts after TurboQuant is healthy |
| 3 | SvelteKit dev | 5173 | opens in Normal window |
| bg | `graphify:som` SOM centroid refresh | — | non-blocking, logs to `logs/graphify-som.log` |
| bg | `graph:synthesize` audit synthesis | — | non-blocking, writes `memory/runs/<run_id>/` |

---

## Env overrides

```powershell
$env:LLAMA_SERVER_PATH   = "C:\path\to\llama-server.exe"
$env:TURBO_MODEL_PATH    = "C:\path\to\model.gguf"
$env:TURBO_MMPROJ_PATH   = "C:\path\to\mmproj-BF16.gguf"
$env:TURBO_PORT          = "8090"         # default
$env:TRACE_MCP_PORT      = "8788"         # default
$env:TRACE_MCP_WORKERS   = "4"            # default: min(cpuCount, 4)
$env:LANGFUSE_URL        = "http://127.0.0.1:3030"
$env:BIFROST_URL         = "http://127.0.0.1:3040/health"
$env:STRICT_TRACE_HEALTH = "true"         # abort if Langfuse is down
```

---

## Post-startup verification

```powershell
Invoke-RestMethod http://127.0.0.1:8090/health   # TurboQuant
Invoke-RestMethod http://127.0.0.1:8788/health   # TRACE MCP
Invoke-RestMethod http://127.0.0.1:8101/health   # topology-search
Invoke-RestMethod http://127.0.0.1:3040/health   # Bifrost
```

Read startup artifacts:

```powershell
$run = Get-ChildItem memory\runs | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Get-Content "$($run.FullName)\startup_health.json"   | ConvertFrom-Json
Get-Content "$($run.FullName)\trace_stack_pids.json" | ConvertFrom-Json
Get-Content "$($run.FullName)\background_jobs.json"  | ConvertFrom-Json
Get-Content "$($run.FullName)\next_actions.md"
```

---

## TurboQuant KV profile — upgrade path

Default: `-ctk q8_0 -ctv q8_0` (stable, 50% VRAM savings).

**Do not change to turbo3/turbo4 without passing the stability gate first.**

```powershell
# Baseline (must pass)
npm run turbo:test:stability

# Experimental (must also pass before promoting)
npm run turbo:test:stability:turbo
```

Both commands write a timestamped report to `logs/turboquant/` and, if a run directory
exists, also to `memory/runs/<run_id>/turboquant_stability.json`.

Pass criteria: all 20 generations succeed, 0 NaN outputs, 0 repetitive outputs, 0 crashes.
Only after `turbo:test:stability:turbo` exits 0 should you change `start-trace-stack.ps1`:

```powershell
"-ctk", "turbo3",
"-ctv", "turbo4",
```

---

## Script inventory — use the right launcher

| Script | Use when |
|--------|----------|
| `npm run trace:start` | **Always use this as the default launcher** |
| `npm run dev:stack` | Node.js tier-ordered orchestrator (alternative) |
| `npm run dev:grpc` | Retrieval gRPC lane testing only |
| `npm run graphify:topology` | Centroid rebuild after new embeddings |
| `npm run turbo:start:detached` | TurboQuant only (no MCP/SvelteKit) |
| `npm run mcp:trace` | TRACE MCP server only |

**Avoid** `dev:ultra` / `dev:agent` / `dev:full:monitor` as the default startup — they
were created for specific debugging scenarios and may start overlapping processes.
