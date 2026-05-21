# TODO — 2026-05-19 Runtime Alignment

## Purpose
Capture the current runtime truth for TurboQuant + GraphRAG + Qdrant + Redis and record the exact repo wiring for follow-up work.

---

## 1. Current runtime truth
- `.vscode/tasks.json` contains the `TurboQuant llama-server (VLM)` task.
- That task runs `npm run turbo:start:detached` from the `sveltekit-frontend` working directory.
- `sveltekit-frontend/package.json` defines:
  - `turbo:start` → `pwsh -NoProfile -ExecutionPolicy Bypass -File ../scripts/launch-turboquant.ps1`
  - `turbo:start:detached` → same launcher with `-Detached`
- `scripts/launch-turboquant.ps1` is the actual TurboQuant startup helper.
- `sveltekit-frontend/scripts/ensure-llama-server.mjs` is the safe population/health-check helper for `llama:ensure` and now prefers `models/gemma4-legal-iq4xs-direct.gguf` when present.
- The `dev:grpc` script is the active retrieval dev startup path, and it launches:
  - `npm run turbo:start:detached`
  - `npm run go:retrieval:run`
  - `npm run dev` with `RETRIEVAL_GRPC_ENABLED=true RETRIEVAL_GRPC_URL=127.0.0.1:50053 ENABLE_GPU=true VITE_ENABLE_GPU=true PUBLIC_ENABLE_GPU=true RTX_3060_OPTIMIZATION=true OLLAMA_GPU_LAYERS=30 SIMD_JSON_PARSER=true REDIS_COMPRESS=true`

## 2. Active MCP / TRACE wiring
- `sveltekit-frontend/package.json` defines:
  - `mcp:server` → `python scripts/mcp/fastmcp_server.py`
  - `mcp:trace` → `tsx src/mcp/trace-mcp-server.ts`
  - `mcp:agent:ollama` → `node scripts/mcp/agent-orchestrator.mjs ollama`
  - `mcp:agent:triton` → `node scripts/mcp/agent-orchestrator.mjs triton`
  - `mcp:ensure` → `node scripts/ensure-mcp-server.mjs --spawn`
- `.vscode/tasks.json` uses `npm run mcp:ensure` for the `MCP TRACE Server (detached)` task.
- The `MCP TRACE Server` task is the correct launch target for the model-facing orchestration plane on `:8788`.

## 3. GraphRAG / Karpathy / Qdrant / Redis path
- Core retrieval wiring lives in `sveltekit-frontend/src/lib/server/ace/context-assembler.ts`.
- It imports `turbovecPrefilter()` from `sveltekit-frontend/src/lib/server/retrieval/turbovec-prefilter.ts`.
- It imports `readLatestQdrantClusterTags()` from `sveltekit-frontend/src/lib/server/ace/cluster-tags-cache.ts`.
- It merges Redis scores from `gpu:karpathy:scores`.
- It consumes Redis keys such as `ace:cluster:members:cluster:gpu:<id>` and `ace:cluster:graphrag:neighbors:cluster:gpu:<id>`.
- `applyKarpathyBoost()` is implemented in the same assembler file and is live on final chunk ranking.
- The final retrieval path combines:
  - Qdrant `codebase_chunks_768` cosine relevance
  - TurboVec cluster prefiltering
  - Qdrant payload / cluster tag boosts
  - Redis Karpathy score blending
  - GraphRAG neighbor boosts via `ace:cluster:graphrag:neighbors:*`

## 4. Semantic tagging and cluster ranking
- `applyKarpathyBoost()` reads `gpu:karpathy:scores` and can adjust bundle scores by graph authority and cluster proximity.
- `readLatestQdrantClusterTags()` pools the current Qdrant cluster tag cache used by retrieval and by AI tooling.
- The metadata path is also used by `src/lib/server/ai/hermes/tools/registry.ts` for tools that inspect cluster tags and Karpathy blend values.

## 5. Task / script cleanup plan
- Keep the live task definitions that map directly to `sveltekit-frontend/package.json`:
  - `TurboQuant llama-server (VLM)` → `npm run turbo:start:detached`
  - `Dev Server (gRPC Retrieval)` → `npm run dev:grpc`
  - `MCP TRACE Server (detached)` → `npm run mcp:ensure`
  - `Backend Stack (MCP + TurboQuant detached)` → depends on `MCP TRACE Server (detached)` + `TurboQuant llama-server (VLM)`
- Confirm the `Dev Server (GPU, detached)` task remains valid because it spawns `dev:gpu` via `run-detached.mjs`.
- Flag legacy or undocumented task labels for later review if they do not point at `sveltekit-frontend/package.json` scripts or `scripts/*.mjs` helpers.
- Preserve detached startup helpers for long-running services: `run-detached.mjs` and `ensure-mcp-server.mjs`.

## 6. Recommended next validation steps
1. Start `Dev Server (gRPC Retrieval)` and confirm the pipeline includes `turbo:start:detached`, `go:retrieval:run`, and the frontend dev server.
2. Start `MCP TRACE Server (detached)` and confirm `:8788` answers `/health`.
3. Start `TurboQuant llama-server (VLM)` and confirm `:8090/health`.
4. Run `npm run graphify:semantic` and `npm run karpathy:gpu` to exercise the Qdrant + Redis retrieval plane.
5. If task labels are being pruned, remove only those that are not in `sveltekit-frontend/package.json` or `scripts/` helpers.

## 7. Repo reference mapping
- VS Code task config → `.vscode/tasks.json`
- TurboQuant script → `sveltekit-frontend/package.json` + `scripts/launch-turboquant.ps1`
- Retrieval dev stack → `sveltekit-frontend/package.json` `dev:grpc`
- MCP server ensure → `sveltekit-frontend/package.json` `mcp:ensure`
- Karpathy boost / retrieval → `sveltekit-frontend/src/lib/server/ace/context-assembler.ts`
- Qdrant cluster tags → `sveltekit-frontend/src/lib/server/ace/cluster-tags-cache.ts`
- TurboVec prefilter → `sveltekit-frontend/src/lib/server/retrieval/turbovec-prefilter.ts`

## 8. Follow-up note
This note was created as the runtime alignment repo note requested on 2026-05-19.

## 9. 2026-05-20 TRACE false-failure triage

### Observed mismatch
- `npm run smoke:mcp:trace` passes (`8/8 gates passed`).
- `GET http://127.0.0.1:8788/health` returns `200` with `{ ok: true }`.
- `GET http://127.0.0.1:8788/mcp` returns `406 Not Acceptable`.

### Root cause
- The external status probe treats MCP as a plain HTTP GET endpoint.
- TRACE MCP expects JSON-RPC over `POST /mcp` with content negotiation.
- The smoke script already uses the correct handshake path in `sveltekit-frontend/scripts/smoke/mcp-trace-smoke.mjs`.

### Fix checklist
1. Keep `/health` probe for liveness only.
2. Replace `GET /mcp` probes with JSON-RPC `POST /mcp` initialize or `tools/list`.
3. Require headers: `Content-Type: application/json` and `Accept: application/json, text/event-stream`.
4. Keep `npm run smoke:mcp:trace` as the canonical CI/ops check.
5. Mark `406` from `GET /mcp` as expected protocol mismatch, not outage.

## 10. 64K runtime gate (must pass)
1. Ensure both env files declare:
  - `TURBO_CTX=65536`
  - `LLM_CONTEXT_SIZE=65536`
  - `TURBO_PARALLEL=1`
2. Hard-restart launcher (`scripts/launch-turboquant.ps1 -Detached`) after killing existing `:8090` PID.
3. Verify live runtime only from `/props`:
  - `default_generation_settings.n_ctx == 65536`
  - `total_slots == 1`
4. Verify OpenCode wiring still passes:
  - `npm run opencode:turbo:check`
