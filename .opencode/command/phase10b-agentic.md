# Phase 10B Agentic Implementation

description: Use MCP, Redis ACE packets, rg, and smoke tests to inspect, plan, implement, and validate Phase 10B wiring.

## Mission

Implement Phase 10B reliability:

- model path resolution
- sidecar port normalization
- Redis ACE packet awareness
- TurboVec optional rerank
- Qdrant fallback order
- smoke test commands

## Required Flow

1. Read recent Redis ACE packets / traces if available.
2. Call MCP first:
   - trace.kag_search
   - context.build_kv_packet
   - graph.expand_neighborhood
3. Use rg with gitignored files included:

```powershell
rg --files -uu | rg -i "gemma|rotor|quant|gguf|ensure-llama|turbovec|engram|langextract|8090|8791|8792|8793"
Search exact references:
rg -n -uu "GEMMA4_BASE_URL|LLAMA_SERVER_PATH|ROTORQUANT_MODEL_PATH|TURBO_MODEL_PATH|8090|8791|8792|8793|ensure-llama-server|turbovec|engram|langextract" .
Build a plan from confirmed paths only.
If a needed file is missing or only a stub, create/patch the smallest useful implementation.
Wire the package scripts or config.
Run smoke tests.
Return exact changed files, sourceRefs, commands, and failures.
Hard Rules
Do not read guessed paths.
Do not read whole large files.
Do not edit before MCP/search confirms related files.
Do not delete files.
Do not mutate database schema unless explicitly instructed.
If Redis/Qdrant/TurboVec are offline, continue degraded.
Accelerators improve latency, never correctness.
Implementation Targets

Find or create only if missing:

scripts/ensure-llama-server.mjs
scripts/atlas/rotorquant-turbovec-sidecar.mjs
src/lib/server/vector/turbovec-client.ts
src/lib/server/cache/ace-packet-cache.ts
scripts/ace/build-packet.mjs
scripts/ace/ask-gemma4.mjs
package.json scripts
Expected Port Map
8090 = llama-server / Gemma4
8791 = atlas/OpenCode MCP
8792 = TurboVec rerank
8793 = RotorQuant/langextract/helper
4222 = NATS
6333 = Qdrant
6379 = Redis
5432/5434 = Postgres
Implement the following logic into the system's operational flow:
1. Execute the requested search/audit sequence to find the missing files and missing configuration settings.
2. Once the necessary scripts/constants are determined to be missing, create or patch the smallest necessary implementation files to satisfy the dependencies listed in 'Implementation Targets' and the 'Expected Port Map'.
3. Run the smoke tests against the newly implemented logic.
4. Report the final state using the specified 'Output Contract'.

---
**Output Contract**
Return:

status:
redis_ace_findings:
mcp_findings:
confirmed_paths:
files_changed:
scripts_added:
port_model_mapping:
fallbacks_verified:
tests_run:
tests_failed:
next_steps:
Stop Conditions

Stop and report if:

MCP tools are unavailable and rg fallback also finds no paths
model path cannot be found with rg --files -uu
edits would require schema migration
smoke tests fail due to missing service
