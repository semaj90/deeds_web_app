# Phase 18 — Messy Query Routing Completion

## Overview

Phase 18 adds a dedicated messy-query orchestration evaluation harness to the Atlas / HyperRAG stack.
It is designed to validate a router-first, tools-second retrieval strategy for real-world user queries that mix:
- semantic intent,
- codebase references,
- service/runtime diagnostics,
- graph/topology concerns,
- trust-sensitive operations.

This phase is not a user-facing endpoint yet. It is a completion document for the engineering evaluation path and a blueprint for wiring the next production-ready retrieval route.

## Goals

- Validate a lightweight LangExtract-style parser for messy developer queries.
- Route queries through a 4x4 signal matrix instead of hardcoded lane selection.
- Gate a CHR97 fast-path answer when high confidence is available.
- Fall back to HyperRAG when the query is noisy, multi-topic, or low-confidence.
- Keep tool use minimal and explicit: command checker, service inspector, codebase file lens.
- Produce audit-ready reports in `docs/reports/`.

## Implementation

### Script

- `scripts/atlas/eval-messy-query-routing.mjs`

This script implements:
- query parsing and clause decomposition
- file/service/command/error/concept extraction
- signal scoring for `semantic`, `lexical`, `graph`, `trust`
- `QueryRouter4x4` lane weighting and dispatch
- CHR97 fast-path gating with a confidence threshold
- HyperRAG fallback plan generation
- optional Redis sample from `gpu:karpathy:scores`
- evaluation report output in JSON and Markdown

### NPM script

- `npm run atlas:messy-routing`

### VS Code tasks

Two task entries were added to `.vscode/tasks.json`:
- `Messy Query Routing Evaluation`
- `Messy Query Routing (custom)`

A new prompt input was added:
- `messyRoutingQuery`

## Pipeline Flow

1. **Parse messy query**
   - identify repo paths, services, runtime ports, errors, tool commands, and domain concepts.
2. **Decompose into subqueries**
   - split on punctuation, conjunctions, and line breaks into up to 4 candidate subqueries.
3. **Extract routing signal**
   - assign weights for semantic, lexical, graph, and trust dimensions.
4. **Route through 4x4 matrix**
   - compute lane weights for `chr97`, `hyperrag`, `graphrag`, and `mcp`.
5. **Gate CHR97 fast-path**
   - select fast answer when CHR97 confidence is above `0.72`.
6. **Build HyperRAG fallback**
   - seed HyperRAG with topology-aware sources when CHR97 does not win.
7. **Plan tool usage**
   - add MCP action plans only when the query explicitly demands execution, runtime inspection, or file-level diagnostics.

## Report Outputs

The evaluation writes two report artifacts:

- `docs/reports/messy-query-routing-eval.json`
- `docs/reports/messy-query-routing-eval.md`

The Markdown summary includes:
- Redis `gpu:karpathy:scores` sample
- parsed query facts
- subqueries
- routing signal values
- lane dispatch decisions
- CHR97 gating verdicts
- planned MCP tool usage

## How to Run

From repo root:

```bash
npm run atlas:messy-routing
```

For custom query evaluation:

```bash
npm run atlas:messy-routing -- --query "explain the TurboVec ANN + HyperRAG fallback for a mixed query involving Neo4j, Redis, and CHR97"
```

Or use the new VS Code task `Messy Query Routing (custom)`.

## Launch Stack and Context Control

This evaluation path is wired to the local TurboQuant / `llama-server` lane on `127.0.0.1:8090`. In this setup, the primary runtime is:

```powershell
cd sveltekit-frontend
.\llama-server.exe \
  -m .\models\gemma4-turboquant-rotorquant.gguf \
  --host 127.0.0.1 \
  --port 8090 \
  --ctx-size 16384 \
  --batch-size 512 \
  --ubatch-size 256 \
  --cache-type-k q8_0 \
  --cache-type-v q8_0 \
  --flash-attn
```

The complete launch sequence is:

1. Start infra:

```powershell
docker compose up -d postgres redis qdrant
```

2. Verify the TurboQuant gateway first:

```powershell
curl http://127.0.0.1:8090/v1/models
```

If the model list returns cleanly, the local OpenAI-compatible gateway is advertising the expected runtime.

3. Verify infra:

```powershell
docker ps
netstat -ano | findstr :5434
```

4. Launch TRACE MCP:

```powershell
cd sveltekit-frontend
npm run trace:mcp
```

## Cline / OpenCode safe prompt rules

For OpenCode/Cline using the local OpenAI-compatible `:8090` lane:

- Set Provider: OpenAI Compatible
- Base URL: `http://127.0.0.1:8090/v1`
- API Key: `local`
- Context Window: `32768`
- Max Output Tokens: `2048–4096`
- Auto-compact: ON

> Note: Cline’s context bar may be wrong for OpenAI-compatible providers if the gateway returns bad or null usage metrics. Do not trust UI token counts alone.

Final architecture rule: Do not chase raw 64k first. Make 16k/32k act like 64k through TRACE MCP, ACE packets, Redis/Postgres cache, Qdrant/KAG/DAG ranking, and compact Gemma4 synthesis.

Practical guardrails:

- Do not read whole files.
- Do not paste full logs.
- Call `kb.trace_search` with `limit=3`.
- Keep MCP results short: `max chars/result = 512`.
- Use `db.schema_overview` only when schema is required.
- Return compact JSON under ~1000 tokens.
- Summarize tool output before the final synthesis step.

For TRACE MCP tools, default every tool call to:

```json
{
  "limit": 3,
  "maxTokens": 800,
  "includeFullText": false
}
```

The local stack also includes a server-side budget guard at `src/lib/server/llm/token-budget.ts`.
It uses `gpt-tokenizer` to count tokens and build a section-weighted prompt before OpenCode/Cline sends the final request.

### Safe budget for `--ctx-size 32768`

- ACE packet: ≤ 3500 tokens
- tool output: ≤ 800 tokens
- MCP result: ≤ 512 chars
- output max_tokens: 2048–4096
- reserve: ~2500 tokens for system prompt + tool definitions + model overhead

This keeps the overall request below the advertised window and prevents "Context size has been exceeded" failures.


4. Launch frontend:

```powershell
cd sveltekit-frontend
cross-env DEV_BYPASS_AUTH=true NODE_OPTIONS="--max-old-space-size=8192" \
ENABLE_GPU=true \
DATABASE_URL=postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db \
REDIS_URL=redis://127.0.0.1:6379 \
OLLAMA_BASE_URL=http://127.0.0.1:8090 \
 npx vite dev --host 0.0.0.0 --port 5173
```

> Important: in this local stack, `OLLAMA_BASE_URL` is pointing at the OpenAI-compatible TurboQuant endpoint on `:8090`. Ollama runtime flags are not the primary context control knob here.

### Context budget guidance

- `--ctx-size` is the real context budget control.
- Effective budget = `ctx-size` minus system prompt + tool definitions + retrieved chunks + MCP/ACE packets.
- On RTX 3060 Ti, the sweet spot is `32768` with `max_tokens` around `2048–4096`.
- Keep retrieval pressure low: `top_k = 3–5`, smaller chunk windows, and cap tool payloads.
- `64k` is benchmark/experiment-only; `32k` is the practical production lane.
- Use `ace:topo:*` and cached context packs to avoid rebuilding large prompt payloads.

### ACE hot path & compact packet

The stack should favor a hot packet cache, not full prompt body caching. A compact Redis packet looks like:

```json
{
  "query": "postgres 5434 mcp failure",
  "topology": [0.14, -0.22, 0.91, 0.03],
  "clusters": ["db.startup", "trace.mcp", "atlas.index"],
  "chunk_ids": ["docker-compose.yml:120-145", "AGENTS.md:40-80"],
  "scores": {
    "semantic": 0.87,
    "pagerank": 0.74,
    "authority": 0.92
  }
}
```

Use Redis for hot lookup keys, not full giant context payloads:

- `ace:topo:{queryHash}`
- `ace:packet:{queryHash}`
- `ace:authority:top`
- `gpu:karpathy:scores`
- `code:index:*`

If Redis misses, then hydrate only the best chunk IDs from Postgres / Qdrant / Neo4j / CouchDB.

### llm.c / Karpathy CUDA lane

For this stack, `llm.c` and Karpathy-style CUDA are best used for:

- GPU ranking experiments
- attention-score blending
- tiny/draft model experiments
- embedding transform kernels
- cluster scoring
- topology similarity scoring

They should not be used as the production Gemma4 serving layer.

### Prompt rule for OpenCode / Cline

For repo, database, routing, MCP, GraphRAG, HyperRAG, ACE, or startup questions:

1. Call `kb.trace_search` with `limit <= 5`.
2. If schema or DB structure is relevant, call `db.schema_overview`.
3. Build a compact ACE context packet.
4. Do not paste raw full files into context.
5. Inject only compact JSON facts, file paths, line ranges, and next actions.
6. If a required service is offline, stop and report the dependency.

This is the right way to get “64k behavior” on a `16k`/`32k` model window.

## Practical 64k strategy

Use a two-mode deployment:

- Production: TurboQuant GGUF with `--ctx-size 16384` or `--ctx-size 32768`, plus compact ACE/Redis packets.
- Experiment: `--ctx-size 65536` + `q4_0` KV cache + tiny `batch-size`/`ubatch-size`.

On RTX 3060 Ti 8GB, the safest path is to treat 64k as an experimental runtime, not the default. The app should first win with compact packets and ACE cache, then optionally validate the larger window.

## Relation to Existing Pipeline

Phase 18 complements the existing TurboVec / HyperRAG / RTX pipeline documented in `sveltekit-frontend/docs/hyperrag-turbovec-rtx-pipeline.md`.

It is intentionally evaluation-first: the output is a research-grade synthesis of routing decisions, not a final retrieval answer.

## Next Steps

- Use this doc as the engineering completion log for Phase 18.
- If the routing strategy proves stable, promote the same pattern into a production route or API endpoint.
- Add a Phase 18 entry to the operator runbook when the user-facing flow is wired.

## Source References

- `scripts/atlas/eval-messy-query-routing.mjs`
- `package.json` → `atlas:messy-routing`
- `.vscode/tasks.json` → `Messy Query Routing Evaluation` / `Messy Query Routing (custom)`
- `docs/reports/messy-query-routing-eval.json`
- `docs/reports/messy-query-routing-eval.md`
