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
| 0 | Bifrost L2 semantic cache | 3040 | Docker/WSL2 only for custom plugins. Start with `docker compose --profile full up -d bifrost` if down. |
| 0.5 | go-retrieval-service (gRPC + HTTP) | 8100 / 50053 | binary launch if present |
| 1 | TurboQuant llama-server.exe | 8090 | waits until healthy before opening MCP |
| 1 | topology-search server | 8101 | parallel with TurboQuant |
| 2 | TRACE MCP cluster | 8788 | starts after TurboQuant is healthy |
| 3 | SvelteKit dev | 5173 | opens in Normal window |
| opt | Redis 8 eval lane | 6380 / 8010 / 9010 | isolated Agent Memory eval only; opt in with `ENABLE_REDIS8_EVAL=true npm run trace:start` or `npm run startup:redis8-eval` |
| bg | `graphify:som` SOM centroid refresh | — | non-blocking, logs to `logs/graphify-som.log` |
| bg | `graph:synthesize` audit synthesis | — | non-blocking, writes `memory/runs/<run_id>/` |

---

## Env overrides

```powershell
$env:LLAMA_SERVER_PATH   = "C:\Users\james\Videos\deeds-web-app\tools\llama-server\llama-server.exe"
$env:TURBO_MODEL_PATH    = "C:\Users\james\Videos\deeds-web-app\vendor\models\gemma4-legal.gguf"
$env:TURBO_MMPROJ_PATH   = "C:\Users\james\Videos\deeds-web-app\vendor\models\mmproj-gemma4.gguf"
$env:TURBO_PORT          = "8090"         # default
$env:TRACE_MCP_PORT      = "8788"         # default
$env:TRACE_MCP_WORKERS   = "4"            # default: min(cpuCount, 4)
$env:LANGFUSE_HOST       = "http://127.0.0.1:3030" # app-side Langfuse SDK
$env:LANGFUSE_URL        = "http://127.0.0.1:3030" # trace-stack launcher compatibility
$env:BIFROST_URL         = "http://127.0.0.1:3040/health"
$env:STRICT_TRACE_HEALTH = "true"         # abort if Langfuse is down
```

Langfuse object storage now uses SeaweedFS S3 on `http://127.0.0.1:8333`.
MinIO names remain only as legacy adapter wording in older code.

Langfuse local test login:

- email: `admin@deeds-legal.ai`
- password: `admin123`

Launcher path resolution note:

- `scripts/launch-turboquant.ps1` now also resolves repo-local fallbacks before the system PATH:
  - `tools\llama-server\llama-server.exe`
  - `vendor\models\gemma4-legal.gguf`
  - `vendor\models\mmproj-gemma4.gguf`
- `turbovec:sidecar` now points to the `8792` wrapper, and the Python helper binds `8793` when it is spawned.
- The model health smoke is `npm run turbo:smoke`, which checks `/health`, `/v1/models`, and `/v1/chat/completions`, confirms `gemma4-legal.gguf` is present, verifies the response contains `turboquant-ok`, and writes `logs/turboquant/health-latest.json`.
- Launcher output is explicit on cold start and reuse:
  - `[TurboQuant] Server already running on :8090 — skipping launch`
  - `[TurboQuant] Using binary: ...`
  - `[TurboQuant] Using model: ...`
- Bifrost custom plugin guidance assumes WSL2 + Docker. Do not treat Windows-host execution as the canonical path for plugin/runtime troubleshooting.

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

Real 64k behavior comes from keeping ACE/Redis as the compact memory layer and
feeding TurboQuant smaller, curated context packets. Treat giant prompt dumps
as a failure mode, not the operating mode.

The logical cache contract is documented in [docs/nanoflow-bitfrost-logical-cache.md](file:///C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/docs/nanoflow-bitfrost-logical-cache.md).

For the full Atlas/TurboVec retrieval chain, see [docs/hyperrag-turbovec-rtx-pipeline.md](file:///C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/docs/hyperrag-turbovec-rtx-pipeline.md). That pipeline improves context quality, not tok/sec: TurboVec prefilter, Qdrant dense search, 4D topology filter, Atlas merge, and compact packet synthesis before Gemma4 decode.

The default daily graphify run now also populates TypeScript diagnostics. It
uses `index:codebase:fast:plan:tsc`, which fills the Redis
`code:ts:diag:manifest` cache and the per-directory wiki note counts, so TS
signal is part of the normal graphing pass instead of a separate manual step.

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
| `npm run startup:redis8-eval` | Opt-in Redis 8 eval lane start + smoke (`docker compose -f docker/docker-compose.redis8-eval.yml up -d` + smoke) |
| `npm run smoke:redis8-eval` | Redis 8 eval lane smoke only |
| `npm run graphify:daily` | Default daily graph build; includes TypeScript diagnostics via `--tsc` |
| `npm run dev:grpc` | Retrieval gRPC lane testing only |
| `npm run graphify:topology` | Centroid rebuild after new embeddings |
| `npm run run:pagerank` | PageRank authority rebuild with CUDA bridge preference and Redis graph-hash cache |
| `npm run authority:snapshot` | Consolidated authority snapshot for Karpathy / ACE / Redis / BitFrost / KAG multi-hop analysis |
| `npm run turbo:start:detached` | TurboQuant only (no MCP/SvelteKit) |
| `npm run turbo:smoke` | TurboQuant health/model smoke (`/health`, `/v1/models`, `/v1/chat/completions`) |
| `npm run mcp:trace` | TRACE MCP server only |
| `npm run check` | TypeScript check plus WebGPU/PageRank smoke (`scripts/smoke-compute-worker-gpu.mjs`) |

`npm run dev:grpc` starts:

- TurboQuant on `:8090`
- go retrieval service on `:8100` / `:50053`
- the frontend with `RETRIEVAL_GRPC_ENABLED=true`

It is the retrieval gRPC lane, not the Qdrant REST smoke. Qdrant is still
used on `:6333` for HTTP and `:6334` for gRPC where the retrieval service
needs it. In `docker-compose.yml`, Qdrant uses the image-supported env vars
`QDRANT__SERVICE__HTTP_PORT=6333` and `QDRANT__SERVICE__GRPC_PORT=6334`; do
not replace them with `--grpc-address` CLI flags for this image.

DuckDB is offline reconciliation only. The smoke reads exported artifacts and
does not mean every later phase is finished.

VS Code workspace startup now uses dedicated scripts for the two noisy folder-open checks:

- `node scripts/startup/run-service-health-check.mjs`
- `node scripts/startup/run-graphify-daily-startup.mjs`
  - set `GRAPHIFY_DAILY_INCLUDE_SEMANTIC=1` to run the semantic codebase refresh (`npm run graphify:semantic` by default, or `npm run graphify:semantic:search` to include a HyperRAG packet-rpc smoke)` after the daily graphify pass
- `node scripts/startup/run-ace-context-pack-startup.mjs`
- `node scripts/startup/run-ace-top-retrieval-startup.mjs`
- `node scripts/startup/run-feature-map-startup.mjs`

The health check is now clean and treats RabbitMQ as skipped until the dev server is up, so the startup path does not fail early on a routing surface that is not ready yet.
Redis 8 Agent Memory remains eval-only. It stays outside the Redis 7 app stack, and `trace:start` only launches it when `ENABLE_REDIS8_EVAL=true` is set.
The ACE context-pack smoke reuses the cached TypeScript diagnostics and writes the current pack snapshot under `.cache/ace/context-packs/` so startup confirms the retrieval-product cache layer in the same pass as graphify.
When that smoke degrades, the wrapper writes `.tmp/ace-startup-status.json` with a machine-readable failure surface (`redis`, `postgres`, `snapshot`, or `tscDiagnostics`) instead of hard-failing the workspace open.
The ACE incremental startup lane also runs the top-N retrieval cache smoke, so folder-open now validates both the compact context pack and the query-hash retrieval cache before handing off to the heavier agent refresh path.
The folder-open chain also runs the feature-map smoke, which checks the feature-labeling / codebase-consolidation compiler contract without blocking startup if it degrades.

## Startup Orchestration Order

| Tier | Service | Port | Rule |
|---|---|---:|---|
| 0 | Bifrost L2 semantic cache | 3040 | Docker/WSL2 only for custom plugins. Start with `docker compose --profile full up -d bifrost` if down. |
| 0.5 | go-retrieval-service | 8100 / 50053 | Start binary if present. HTTP + gRPC retrieval lane. |
| 1 | TurboQuant llama-server.exe | 8090 | Wait until `/health` is green before MCP starts. |
| 1 | topology-search server | 8101 | Start parallel with TurboQuant. Soft dependency: yellow when absent. |
| 2 | TRACE MCP cluster | 8788 | Start only after TurboQuant is healthy. |
| 3 | SvelteKit dev | 5173 | Open in normal browser window. |
| bg | graphify:som | — | Non-blocking SOM centroid refresh. Log to `logs/graphify-som.log`. |
| bg | graph:synthesize | — | Non-blocking graph synthesis. Write to `memory/runs/<run_id>/`. |

## Bifrost Runtime Note

Bifrost custom plugins should be treated as WSL2/Docker runtime work, not Windows-native PowerShell work.

Windows-native lanes:
- TurboQuant `llama-server.exe`
- VS Code task orchestration
- SvelteKit dev
- local smoke scripts

Docker/WSL2 lanes:
- Bifrost
- Qdrant
- Redis
- RabbitMQ
- custom Bifrost plugin builds

## Startup Dependency Rule

Do not open MCP or SvelteKit until:

- TurboQuant `:8090/health` is green
- Bifrost `:3040/health` is green or explicitly marked degraded
- Qdrant is reachable
- Redis exact cache is reachable or marked degraded

## Go Retrieval Service

Dependencies:

- `gorm.io/driver/postgres v1.6.0`
- Postgres on `5434` or configured env
- HTTP: `8100`
- gRPC: `50053`

This service belongs to retrieval, not model inference.

## Redis 8 Eval Lane

Use this when you want to test the isolated Agent Memory container without changing the main Redis 7 app stack:

```powershell
npm run startup:redis8-eval
npm run smoke:redis8-eval
```

To include it in `trace:start` as a non-blocking optional lane:

```powershell
$env:ENABLE_REDIS8_EVAL = 'true'
npm run trace:start
```

The eval lane uses `docker/docker-compose.redis8-eval.yml` and targets Redis 8 on `:6380`, the API on `:8010`, and MCP on `:9010`.

The startup orchestrator now emits `.tmp/ace-startup-status.json` with the current tier rollup. The folder-open health check is degraded-safe: it records red/yellow subsystems but exits 0 so startup orchestration does not collapse on a partial outage. Topology-search is soft-gated and reports yellow when `:8101` is absent.

## Memory Tuning

The repo now uses a shared Node heap wrapper for memory-heavy scripts. The
default heap size is 12 GB, and you can override it with
`MAX_OLD_SPACE_SIZE`.

Copy-paste commands:

```powershell
$env:MAX_OLD_SPACE_SIZE='12288'; npm run dev
$env:MAX_OLD_SPACE_SIZE='12288'; npm run dev:grpc
$env:MAX_OLD_SPACE_SIZE='12288'; npm run check:typescript
```

VS Code:

```text
Developer: Reload Window
TypeScript: Restart TS Server
```

The TypeScript server memory setting is aligned to 12 GB in both
`.vscode/settings.json` and `.vscode/settings.optimized.json`.

`npm run check` now includes the GPU worker smoke, so PageRank/WebGPU failures
surface alongside typecheck errors instead of being hidden behind a separate
manual gate.
The smoke also writes `logs/webgpu-pagerank/latest.json` so Karpathy/ACE/Redis/
BitFrost/KAG multi-hop analysis can read a stable report instead of scraping
console output.

`npm run run:pagerank` now prefers the CUDA bridge from
`src/lib/server/gpu/pytorch-graph.ts` when the graph fits, and it caches the
score map in Redis behind a graph hash so repeated authority rebuilds reuse the
same scores until the graph changes. Use:

```powershell
$env:PAGERANK_FORCE_REFRESH='1'
$env:PAGERANK_SKIP_COUCH_WRITE='1'
npm run run:pagerank
```

to force recompute without writing back to CouchDB during validation.
When the graph hash matches, the runner now skips the Neo4j→CouchDB republish
and returns the cached authority map immediately.

`npm run authority:snapshot` merges the authority lanes into a single artifact:
`couchdb:pagerank_scores`, `ace:authority:top`, and `gpu:karpathy:scores` are
combined into `logs/authority/latest.json` and `logs/authority/latest.md` for
the multi-hop analysis path.

### Truth table — 2026-05-24

| Lane | State | Notes |
|------|-------|-------|
| Redis ACE exact cache | verified | app-side hot cache before either model lane |
| Qdrant HTTP | verified | `6333` is for HTTP inspection / collection checks |
| Qdrant gRPC | verified | `6334` is the lane Bifrost currently expects for its vector-store path |
| Bifrost vector-store path | verified | keep it on `6334`; do **not** force `6333` when logs expect gRPC |
| Bifrost `turboquant_backend` provider | not active | current image reports it as unsupported |
| Bifrost `/health` | verified | health route returns OK on the live gateway |
| Bifrost OpenAI route | verified | direct `POST /v1/chat/completions` returns `Ok` for `ollama/gemma4-rotorquant:latest` |
| TurboQuant direct lane | verified | `http://127.0.0.1:8090` stays the direct local OpenAI-compatible lane |
| Bifrost custom plugins | WSL2/Docker | use the documented Docker path for plugin/runtime work; do not assume Windows host execution |

Practical routing:

```text
Redis cache hit -> return ACE context pack
Redis miss + semantic retrieval -> Bifrost/Ollama
local fast generation -> TurboQuant direct :8090
```

Observed latency on 2026-05-24:

- direct Bifrost minimal chat: ~3.4s
- direct Ollama `ollama run gemma4-rotorquant:latest "say ok"`: ~3.8s
- strict Bifrost smoke: still times out at ~60s on the larger smoke harness path

That means the remaining failure is in the strict smoke harness path, not the basic Bifrost request path.

**Avoid** `dev:ultra` / `dev:agent` / `dev:full:monitor` as the default startup — they
were created for specific debugging scenarios and may start overlapping processes.
