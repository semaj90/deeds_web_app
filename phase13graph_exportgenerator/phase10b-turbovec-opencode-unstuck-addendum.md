# Phase 10B Addendum — TurboVec Compression, ACE Memory, and OpenCode Unstuck Plan
## Current Problem
OpenCode successfully created and invoked the Phase 10B agentic command, but it got stuck after delegating work:
- It launched a general/build task.
- It returned a task/session ID.
- It did not return the required structured output.
- It said it would wait silently for final output.
This is not acceptable for the Phase 10B workflow. Agentic commands must either complete synchronously with a report or provide a query command to fetch the task result.
## Required OpenCode Behavior
When `/phase10b-agentic` is run, OpenCode must not stop at:
```txt
task_id returned
waiting for output
It must return:
txt
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
## Immediate Unstuck Command
Run this in the repo if a task/session ID is returned:
```powershell
node scripts/ai-os/query-progress.mjs "<task_or_session_id>"
If that script returns no output, run:
```powershell
rg -n -uu "<task_or_session_id>|phase10b-agentic|agent.task.execute|Redis ACE|MCP findings" memory logs .tmp logs/task-output 
## Fix the Command Contract
Update `.opencode/command/phase10b-agentic.md` with this hard rule:
```md
## No Silent Background Rule
Do not finish by saying the task is running.
If a subtask/session ID is created, immediately query its status using the project progress query tool or rg fallback.

If no result is available, return a degraded report with:
- session ID
- commands used
- last confirmed sourceRefs
- next exact command to run
## TurboVec Hardware Position
TurboVec is an optional CPU-friendly compression/rerank lane.
Use it after canonical retrieval:
```txt
EmbeddingGemma 768d vectors
→ Postgres/Qdrant canonical storage
→ Qdrant candidate retrieval
→ TurboVec compressed rerank
→ ACE packet / TOON packet
→ Gemma4/Bifrost synthesis
Do not make TurboVec the source of truth.
## 11th Gen Intel i7 / Windows Home Notes
Expected posture:
```txt
AVX2: likely available
AVX-512: depends on exact SKU, BIOS, and Windows/runtime support
CUDA: only available if NVIDIA RTX GPU is present
Windows Home: fine for CPU sidecar; use Docker Desktop/WSL2 only if already configured
Phase 10B should start with CPU TurboVec only.
## EmbeddingGemma Compression Plan
Canonical embedding remains:
```txt
EmbeddingGemma 768d float vector
Compressed routing record:
```json
{
  "chunkId": "src_lib_server_cache_ace_packet_001",
  "path": "src/lib/server/cache/ace-packet-cache.ts",
  "sourceRef": "src/lib/server/cache/ace-packet-cache.ts:L1-L80",
  "embeddingModel": "embeddinggemma",
  "dim": 768,
  "qdrantPointId": "...",
  "turbovecCode": "packed-2bit-or-4bit",
  "norm": 1.0,
  "clusterTags": ["ace-cache", "redis", "phase10b"],
  "topology": {
    "somRow": null,
    "somCol": null,
    "manifold4": []
  },
  "summary": "...",
  "commands": [
    "rg -n -uu \"ace-packet-cache|Redis|ace:packet\" src scripts"
  ]
}
## TurboVec Use Cases
Use TurboVec when:
- Qdrant returns too many near-duplicate candidates.
- More than 1,000 `.md` / `.txt` / source files are involved.
- Generated `.llms.txt` maps are too large.
- JSON maps exceed 30 MB.
- Multi-hop graph expansion produces too many candidate chunks.
Do not use TurboVec when:
- There are fewer than ~50 candidate chunks.
- SourceRefs are missing.
- Qdrant/Postgres have not produced candidates yet.
- The task is pure file location.
## 4D Topology / Manifold Role
4D topology is a routing and grouping layer, not the vector truth.
Use
```txt
sourceRefs + chunkIds + feature labels
→ graph neighborhood
→ SOM/manifold coordinates
→ TurboVec compressed rerank
→ ACE packet
Do not send raw topology maps to Gemma4.
Send only:
```txt
clusterId
clusterTags
topology class
sourceRefs
rankedCards
nextActions
## CUDA / RTX / Tensor Assistance
Not Phase 10B.
Later GPU lane:
```txt
cuVS / CUDA / TensorRT
= optional acceleration only
Rules:
```txt
GPU offline → system still works
CUDA lane receives IDs/scores, not raw prompts
No custom CUDA kernel in request-critical path
No TensorRT migration until llama-server/Bifrost smoke is stable
```
## Phase 10B TODO Additions
- [ ] Add No Silent Background Rule to `.opencode/command/phase10b-agentic.md`.
- [ ] Add progress-query fallback for returned task/session IDs.
- [ ] Add TurboVec compression/rerank section to Phase 10B roadmap.
- [ ] Add EmbeddingGemma 768d → TurboVec packed-code mapping contract.
- [ ] Add `turbovec:rerank:test` smoke test if missing.
- [ ] Add fallback: TurboVec offline → Qdrant order.
- [ ] Confirm 11th-gen Intel CPU supports required SIMD path at runtime.
- [ ] Keep AVX-512 optional; do not require it.
- [ ] Keep CUDA/cuVS/TensorRT disabled for correctness path.
- [ ] Update ACE packet builder to store compressed candidate metadata only, not raw vectors.
- [ ] Add Redis key pattern for compressed routing cards:
```txt
ace:turbovec:candidate:<chunkId>
ace:turbovec:query:<queryHash>
- [ ] Add OpenCode command output contract enforcement:
```txt
Never end with “waiting for task result.”
Return degraded report if result is unavailable.
## Next Exact Command to Give OpenCode
```txt
/phase10b-agentic continue. Do not wait silently. If you created a task/session ID, query it with scripts/ai-os/query-progress.mjs. If no result is available, return a degraded report with confirmed paths, commands run, and next exact command.
## Core Rule
```txt
Postgres/Qdrant = canonical truth
Redis = hot ACE/cache/traces
TurboVec = optional compression/rerank
4D topology = navigation
Gemma4 = synthesis
CUDA/cuVS/TensorRT = later acceleration
```
