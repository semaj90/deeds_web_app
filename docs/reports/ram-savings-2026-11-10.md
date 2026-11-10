# RAM Savings Report — 2026-11-10

**Status**: Partial | **Changes**: 2 applied (Langfuse stopped, Neo4j heap lowered) | **Date**: 2026-11-10

## TL;DR

Host RAM is the blocker for the cuVS KMeans prepare task, which needs 4 GiB free. Free RAM went from about 1.0 GiB to 2.2 GiB after stopping Langfuse and lowering Neo4j's heap. The remaining gap is mostly Chrome, which is the largest single consumer on the host.

## Changes Applied

| Change | Where | Live effect | Reversible |
|---|---|---|---|
| Stopped `langfuse-server`, `langfuse-worker`, `langfuse-clickhouse` | Docker (stopped, not removed) | About 1.7 GB of live container memory released | `docker start langfuse-clickhouse langfuse-worker langfuse-server` |
| Neo4j heap max 4g → 2g, initial 2g → 1g | `docker-compose.yml` lines 499–500 | Neo4j now at about 1.9 GiB (limit 8 GiB) | Restore values and `docker compose up -d --no-deps neo4j` |

**Caveat:** Langfuse is the app's tracing backend (`src/lib/server/observability/langfuse.ts`). While it's stopped, traces are not recorded. Tracing may log errors. Not verified.

**Caveat:** The 2 GB Neo4j heap may be too small for large GDS or APOC jobs. Watch for heap errors and raise the max to 3–4 g if they appear.

**Caveat:** The compose change is uncommitted.

## Measured State

| Measure | Before | After |
|---|---|---|
| Host free RAM (`FreePhysicalMemory`) | 0.99 GiB | 2.14–2.2 GiB |
| KMeans prepare threshold | 4 GiB | 4 GiB (not yet met) |
| Free VRAM (Ornith stopped) | 367 MiB | about 6.9 GiB |
| WSL2 VM (`vmmem`) | 10.3 GB private | about 2.2 GiB working set |

Free RAM rose by about 1.2 GiB, not the full 1.7 GB of container memory. Windows and the WSL2 VM reclaim memory with a delay.

## Where the Memory Is Now

**Docker containers (live):**

| Container | Usage | Limit |
|---|---|---|
| legal-ai-neo4j | 1.90 GiB | 8 GiB |
| legal-ai-qdrant | 1.0 GiB | 4 GiB |
| legal-ai-postgres | 661 MiB | 2 GiB |
| legal-ai-bifrost | 220 MiB | 512 MiB |
| miniforge-nlp-sidecar | 219 MiB | 9.7 GiB (VM default) |
| ldr-local-deep-research-1 | 210 MiB | 9.7 GiB |
| legal-ai-seaweed-filer | 183 MiB | 256 MiB |
| atlas-gpu-8098 | 160 MiB | 9.7 GiB |
| legal-ai-langgraph | 137 MiB | 6 GiB |
| atlas-neural-decoder | 118 MiB | 9.7 GiB |
| legal-ai-rabbitmq | 115 MiB | 512 MiB |
| searxng + legal-ai-searxng | 148 MiB | 512 MiB + 9.7 GiB |
| Remaining services (SeaweedFS S3/volume/master, CouchDB, Valkey, Caddy, go-retrieval, go-embedding, NATS) | about 330 MiB | various |

**Host processes (working set):**

| Process | Usage | Notes |
|---|---|---|
| chrome (17 processes) | 6.5 GiB | Largest consumer |
| Code (VS Code, 2 processes) | 984 MiB | |
| node | 619 MiB | Not identified |
| MsMpEng (Defender) | 467 MiB | |
| claude | 450 MiB | |
| ChatGPT | 347 MiB | |
| Memory Compression | 296 MiB | |
| vmmem (WSL2/Docker VM) | 2.2 GiB working set (10 GB cap) | |

Not yet identified: one `python` process at about 1.3 GB private memory, seen earlier.

## Further Options (Ranked by RAM Saved)

| # | Action | Est. saving | Risk | Needs approval |
|---|---|---|---|---|
| 1 | Close Chrome tabs and windows, or quit Chrome during KMeans runs | Up to about 6 GB | None | No |
| 2 | Identify the stray 1.3 GB `python` process and stop it if it's idle | About 1.3 GB | Check it's not a sidecar | Yes, before stopping |
| 3 | Close extra VS Code windows and ChatGPT and Claude desktop | About 1.1 GB | None | No |
| 4 | Stop optional Atlas services when not in use: `atlas-neural-decoder`, `atlas-gpu-8098`, `ldr-local-deep-research-1`, `miniforge-nlp-sidecar` | About 0.7 GB | Breaks Atlas GPU and NLP lanes while stopped | Yes |
| 5 | Remove the duplicate SearXNG (`searxng` or `legal-ai-searxng`) after confirming which serves port 8889 | About 70–150 MB | Low | Yes |
| 6 | Set per-container memory limits in compose (`mem_limit`) for neo4j, qdrant, langgraph, and the Atlas services | Prevents growth, saves nothing now | Low | Yes |
| 7 | Lower the WSL2 cap in `.wslconfig` from 10 GB to 8 GB | Only limits peak use | Neo4j and Qdrant may hit limits under load | Yes, requires `wsl --shutdown` |
| 8 | Check whether the Ollama desktop app is running and stop it if unused (`CLAUDE.md` plans to remove Ollama) | Not measured | Embeddings call Ollama today; check first | Yes |
| 9 | Exclude the repo and Docker VHDX from Defender scans | Lowers MsMpEng CPU and some RAM | Security trade-off, not recommended without review | Yes |
| 10 | Reduce Qdrant memory (on-disk storage or lower cache for `codebase_chunks_768_v2`) | Potentially hundreds of MB | Needs measurement and collection config changes | Yes |

**Not recommended:**
- Lowering Postgres `shared_buffers` (already 128 MB).
- Pruning Docker volumes. They hold Postgres, Qdrant, and Neo4j data.
- Force-killing `llama-server` or Ollama runners by process name.

## Recommended Order

1. Close Chrome tabs and extra apps. This alone should clear the 4 GiB KMeans threshold.
2. Identify the 1.3 GB `python` process.
3. Decide whether the Langfuse stop should stay for now.
4. Revisit the Neo4j heap if GDS or APOC jobs fail.

## Verification

- `docker stats --no-stream` for container memory.
- `Get-CimInstance Win32_OperatingSystem` `FreePhysicalMemory` for host free RAM.
- `pwsh -File scripts/gpu/prepare-cuvs-kmeans.ps1` (or the VS Code task) for the threshold check.
- `curl http://127.0.0.1:8090/slots` before any change to `:8090`.

## Follow-up audit — task lookup and current host state

This section supplements the earlier snapshot; it does not replace the recorded actions or authorize stopping services.

- Current host free RAM observed on 2026-11-10: **4.25 GiB**. This is above the task's 4 GiB host-memory threshold, but it is a point-in-time reading and is not GPU-task admission.
- Docker Desktop's Linux-engine status pipe was unavailable during this follow-up, so current container count and per-container memory could not be refreshed. The earlier Docker figures in this report remain historical snapshots, not current measurements.
- The earlier ~1.3 GB Python process was not present at that size in the current process listing. The largest Python process observed had a 7.4 MiB working set and ran `scripts/atlas/serve-xgboost-reranker.py`; other listed Python processes were small sidecars/tools. No process was stopped.
- Langfuse source has a disabled/no-key no-op path, catches SDK initialization failure, and catches errors from explicit flush/shutdown. Several wrappers create SDK trace/span objects outside their callback error handlers, so source alone does not prove that an enabled client with stopped Langfuse cannot emit background or synchronous SDK errors. The running app's `LANGFUSE_ENABLED` state and runtime behavior were not inspected. Traces are not recorded while the Langfuse containers are stopped.
- Existing related work is recorded in `sveltekit-frontend/openspec/changes/parent-atlas-gpu-compute-lanes-consolidation/tasks.md`: `CUTILE-VENV-RERUN-01` (line 50), `OPS-LIFECYCLE-AUTH-01` (line 57), and `GPU-PACKET-PASS-01` (line 90). These cover GPU/service lifecycle and packet-pass gates; none is a dedicated optional-service RAM-tier task.
- Service ranking is tracked in `openspec/changes/parent-atlas-agentic-file-compiler/tasks.md` under the `service_capabilities` status row (line 1220) and `scripts/atlas/service-capability-rank-v1.mjs`; this is an on-demand service-capability refresh, not a RAM-tier policy.
- Recommendation-related owners are distinct: `NS-9` in `openspec/changes/parent-atlas-workboard-feature-utility-fabric/tasks.md` is metadata adoption; `AFC-E2E-107/108` in the agentic-file-compiler ledger cover DAG prefill tool discovery/runtime proof; `R06` in `sveltekit-frontend/openspec/changes/parent-atlas-agentic-diagnostic-repair-v1/tasks.md` is the deterministic recommendation baseline. None is an approved task identity for the RAM-tier work. `next_steps/INDEX.md` is document navigation, not a task queue.
- No OpenSpec task ID was created or inferred for optional-service RAM tiering. No task metadata, service, container, GPU, database, or cache state changed.

### Follow-up gate

Recheck Docker Desktop availability and the host-memory threshold immediately before any approved GPU preparation. If the `🧮 GPU: Prepare cuVS KMeans` task is considered, follow the lifecycle steps recorded under `CUTILE-VENV-RERUN-01`; this audit did not run that task or a KMeans workload.

### Latest admission snapshot (2026-11-10 09:50 -08:00)

- Windows free RAM was **2.32 GiB**, below the 4 GiB host threshold. A prior reading in this session was 4.25 GiB, confirming the value is volatile.
- GPU memory was **1,559 MiB used / 6,466 MiB free**. This clears the GPU preparation script's default 1,536 MiB minimum, but does not override the failed host-RAM gate.
- Docker Desktop's engine pipe remained unavailable. The WSL distribution query did not return within the command window, so WSL status is unverified.
- The existing `🧮 GPU: Prepare cuVS KMeans (frees VRAM, does NOT run KMeans)` task points to `scripts/gpu/prepare-cuvs-kmeans.ps1`. Source inspection confirms it checks host RAM first and exits before process changes when below 4 GiB. It can stop the exact `:8090` process only after passing the RAM check, meeting VRAM need, confirming `/slots` idle and receiving the explicit `STOP-8090` console response. This task was not run.

### Host process recheck (2026-11-10 10:05 -08:00)

- Windows reported **2.89 GiB free of 31.88 GiB**; the 4 GiB KMeans host-memory gate is currently **1.11 GiB short**. GPU reported **1,627 MiB used / 6,398 MiB free**. VRAM clears the prepare script's default 1,536 MiB floor, but not the host-RAM gate.
- The previously “unidentified ~1.3 GB Python” process is `C:\Python313\python.exe scripts/atlas/serve-xgboost-reranker.py`: **1,310 MiB private commit, 7.3 MiB working set**. Private commit is not 1.3 GiB of resident RAM, so stopping it cannot be assumed to free 1.3 GiB of physical memory. It was not stopped.
- A separate Chroma MCP Python process (persistent `claude-mem` store) showed **737 MiB private commit, 155.6 MiB working set**. It was not stopped.
- Chrome had 177 processes with a summed working set of **22.96 GiB**. Per-process working sets can count shared pages more than once; this sum is not a reliable estimate of RAM that closing Chrome will return.
- Docker Desktop's engine remained unavailable, so current container use remains UNKNOWN. No process was stopped and no KMeans/cuVS task was run.

### OpenSpec tracking correction

Added the review-only source task `OPTIONAL-SERVICE-RAM-TIERS-01` to `sveltekit-frontend/openspec/changes/parent-atlas-gpu-compute-lanes-consolidation/tasks.md`. This is an OpenSpec source task, not a Kanban row, service authorization, or approved configuration change. It requires repeated measured profiles and explicit capability/dependency review before any resource-tier proposal. Earlier note that no dedicated task existed describes the state before this task was added.

### Source inventory progress — OPTIONAL-SERVICE-RAM-TIERS-01

OpenSpec reports 5/64 tasks complete for the existing change; the new RAM-tier item remains open. Static Compose/source review found:

| Candidate | Source-defined role and dependencies | Ports / limit evidence | Status |
|---|---|---|---|
| `atlas-gpu-8098` | GPU graph/ranking lane; `cugraph-pagerank-adapter.ts` requires a resident graph and will not auto-load one | 8098; no explicit container memory limit in `docker/docker-compose.gpu.yml` | Capability required for its GPU graph route; safe-to-stop status UNKNOWN |
| `atlas-neural-decoder` | Separate neural decoder service; ACE context assembly has a shadow-only caller gated by `NEURAL_DECODER_PREFILL_SHADOW_ENABLED`, which defaults false; caller fails open and adds no canonical write or retrieval vote | 8121; no explicit container memory limit in `docker/docker-compose.gpu.yml` | Source default is off; running environment flag and service usage UNKNOWN |
| `miniforge-nlp-sidecar` | NLP/AST and LangExtract sidecar; tracked clients include feature extraction, Graphify structural materialization, query routing, and TRACE MCP | 8095; no explicit container memory limit in `docker/miniforge-nlp-sidecar/docker-compose.yml` | Those specific capabilities depend on the sidecar unless their caller has a separate fallback; not a blanket optional service |
| LDR and its private SearXNG | Separate local deep-research stack, identified in earlier runtime inspection | Compose source not found in tracked repo; current port/limit unknown | Project ownership/runtime status UNKNOWN |
| App SearXNG | App metasearch service | 8889; 512 MiB limit in root `docker-compose.yml` | Separate from LDR's private SearXNG; current running attribution UNKNOWN |

These are source-defined profiles, not current runtime measurements. The Compose variants are not equivalent. Docker Desktop was unavailable during this pass, so no container names, current use, peaks, or live dependency graph were refreshed. No tier or container action is proposed from this data alone.

Bounded, read-only `GET /health` probes to `:8095`, `:8098`, and `:8121` each timed out at 2 seconds. A timeout does not prove the process is down or unhealthy; these endpoints remain **UNKNOWN**. No health response payload was received.

**Source SHA-256 (working-tree bytes):** `docker-compose.yml` `1117bddcca985e15f4e8c64c244a59dbc36f2c9a829e8165da38e1479b65e320` (working tree already modified); `docker/docker-compose.gpu.yml` `d119361df1f3fd643a832affef20feb5990686a1f8ec7c65c6a5b56b6685af94`; `docker/miniforge-nlp-sidecar/docker-compose.yml` `bc73e5eb7d3ee0e80c509e6931066b4b1d8d3016511513f8d609bb1453128d4a`; `sveltekit-frontend/src/lib/server/nlp/miniforge-nlp-sidecar.ts` `f70b8285214dd7db4e91935025dfc129b19e75bfb4fb06da98881d244c099eca`; `sveltekit-frontend/src/lib/server/langextract-client.ts` `8edb5f21d17b9b65b19fac3d7e6da3d0dab2e99d5521a9957e7ad979916b02f7`; `sveltekit-frontend/src/lib/server/graph/cugraph-pagerank-adapter.ts` `1d1ff5bb0e467db304f5a6cacc316d2e567dfb219c92f8b4d3399ffc6526b833`.

**Additional caller hashes:** `sveltekit-frontend/src/lib/server/env.server.ts` `65ecd310bb90463dfecb2e1a4f691fd7340a8b5a16e96fb1feb3852897c83667`; `sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts` `e38d327efe2bec572b38c1787fcfceaf2b2312eab972237b24a6d856d9b45ebf`; `sveltekit-frontend/src/lib/server/ai/neural-decoder-prefill-caller-v1.ts` `6a0cabe5584f4811be153a98f38687458bbd77e3012ae2b3900556582f1e4a29`; `sveltekit-frontend/src/lib/server/ace/neural-decoder-prefill-shadow.ts` `60d1443a3f9955ec8614362419f58a15911a9d178ff2a84bd2465400dd31b680`; `sveltekit-frontend/src/lib/server/ai/neural-decoder-client.ts` `6743cfd43da2870f23995169ef4e1eca4100ad19895ea5a8a1bf2fed35e2f2ef`; `services/atlas-gpu-8098/app.py` `f55a726fa345baf410e71eb0a7a476ceeaae327225a1f4d6126daf7a5aae5aa8`; `python/atlas_neural_decoder_service.py` `30d92039fa52664925c8a6fb6d4a1b8fd2b3329f2ad6dd6c230305d15a87888f`.
