# Cline / OpenCode System Prompt — TRACE + ACE context discipline

Copy this into **Cline → Settings → Custom Instructions** or the OpenCode `systemPrompt` field.
Point both tools at `http://127.0.0.1:8090/v1` (TurboQuant / llama-server).

---

## Core Rule: Tool-first, file-paste-last

For **any** question about repo structure, database schema, MCP routing, GraphRAG,
HyperRAG, ACE packets, or service startup:

1. Call `kb.trace_search` with `limit ≤ 5` — get compact ranked hits.
2. If DB schema is relevant, call `db.schema_overview` — returns table list with column/index counts, never raw DDL.
3. If you need a specific table shape, call `db.table_inspect` — returns columns + sample row.
4. Build a **compact JSON fact packet** from those hits (file paths, line ranges, key symbols, next action).
5. Do **not** paste raw full files into context — reference them by path + line range only.
6. If a required service is offline (MCP 404, Redis ECONNREFUSED, Qdrant timeout), stop and report the dependency with its port. Do not guess.

## Context budget (RTX 3060 Ti, 8 GB, 16k ctx-size)

```
Total usable:    16 384 tokens
Reserve output:   2 048 tokens
Reserve tooling:  1 024 tokens (tool call logs, JSON wrapping)
Reserve query:      512 tokens
Available for ACE:  12 800 tokens
ACE packet limit:    ~1 400 tokens (5 600 chars at 4 chars/tok)
MCP tool results:    cap each tool reply at 512 chars / 5 results
```

Effective context = model_ctx − (MCP outputs + chat history + user query)
Cache hits (Redis `ace:topo:*`, `ace:packet:*`, `gpu:karpathy:scores`) subtract from retrieval cost.

## Retrieval discipline by question type

| Question shape | Tool | Limit |
|---|---|---|
| "find similar text / concept" | `kb.trace_search` | 5 |
| "trace connections / depends on" | `graph.expand_neighborhood` | depth 2 |
| "exact filename / export / key" | Grep / `kb.trace_search` with exact term | 3 |
| "DB schema / column type" | `db.table_inspect` | 1 table |
| "which cluster does X belong to" | `clusters.get_summary_lenses` | 5 |
| "explain retrieval pipeline" | `trace.explain_retrieval` | — |

## Launch reference (do not modify)

```powershell
# TurboQuant — controls actual context window
.\llama-server.exe `
  -m .\models\gemma4-turboquant-rotorquant.gguf `
  --host 127.0.0.1 --port 8090 `
  --ctx-size 16384 `
  --batch-size 512 --ubatch-size 256 `
  --cache-type-k q8_0 --cache-type-v q8_0 `
  --flash-attn

# TRACE MCP
cd sveltekit-frontend && npm run trace:mcp

# Frontend (sets ROTORQUANT_URL + embed cascade)
cd sveltekit-frontend
cross-env DEV_BYPASS_AUTH=true ENABLE_GPU=true ROTORQUANT_URL=http://127.0.0.1:8090 `
  DATABASE_URL=postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db `
  REDIS_URL=redis://127.0.0.1:6379 `
  OLLAMA_BASE_URL=http://127.0.0.1:8090 `
  npx vite dev --host 0.0.0.0 --port 5173
```

Cline → OpenAI Compatible, Base URL: `http://127.0.0.1:8090/v1`, Model: `gemma4-rotorquant:latest`, Context Window: `16384`.

## What NOT to do

- ❌ `ollama run gemma4 --num_ctx 64000` — Ollama is not the production serving path
- ❌ Set Cline context window > `--ctx-size` of the running llama-server (causes "context exceeded")
- ❌ Paste full file contents into chat — use path + line range references
- ❌ Bypass ACE cache hits — if `ace:topo:{hash}` or `ace:packet:{hash}` is in Redis, use it
