# Stack Audit Playbook

Use this when you need to audit the full local stack without breaking the canonical memory path.

## Canonical Memory Rules

- Postgres is the durable source of truth.
- Qdrant is the vector recall layer.
- Redis is the hot cache layer.
- ACE/NES cards are the prompt-facing memory layer.
- SQLite is never canonical in this lane.
- Keep 768d canonical writes only; legacy 384d tables remain compat-only until a migration/backfill plan lands.
- Keep GPU / WebGPU / CUDA acceleration as optional later work, not a core-path blocker.
- Keep LangGraph optional for later stateful branching only.
- Keep `llm_synthesis` as the sanitized agentic-thinking summary lane, separate from raw observations.

## What To Check

### OpenCode / Claude-Mem

- `npm run opencode:startup:mcp`
- `npm run memory:claude-mem:smoke`
- `npm run memory:agent-observation:smoke`
- `npm run atlas:feature-gap`
- `npm run codebase:semantic-index:smoke`
- `npm run codebase:semantic-index:report`

### Redis 8 Eval Lane

- `npm run smoke:redis8-eval`
- keep this lane isolated from the Redis 7 app stack
- compare against the paid managed semantic cache later, after local Redis 8 eval proves useful

### MCP / Sidecars

- `npm run smoke:mcp:core-gate`
- inspect `opencode.json` and `sveltekit-frontend/opencode.json`
- keep transport drift cleanup as a separate task

### Memory Tables

- `agent_observations`
- `agent_memory_observations`
- `intent_synthesis`
- `intent_synthesis_rewards`
- `llm_synthesis`

### Listener Audit

Check actual ports before assuming the transport is healthy:

```powershell
netstat -ano | findstr ":5173"
netstat -ano | findstr ":37777"
netstat -ano | findstr ":8788"
netstat -ano | findstr ":8791"
netstat -ano | findstr ":8792"
netstat -ano | findstr ":8793"
netstat -ano | findstr ":6380"
netstat -ano | findstr ":8010"
netstat -ano | findstr ":9010"
```

## Feature Labeling Safety

When auditing feature labels:

- keep canonical feature IDs in the atlas registry
- use `source_refs`, `tags`, and `tool_calls` for observations
- do not rename labels in memory tables unless the registry is updated too
- keep OpenCode observations and feature index rows separated
- preserve the exact cache -> semantic cache -> retrieval -> TOON -> Bifrost observation order
- keep raw code dumps out of prompt-cache prefixes
- prefer `rg`, globbing, and narrow hits before reading new `.md` files end to end

### Semantic Index / Checklist Mining

Treat the semantic indexer as an operational lane:

- add a `codebase:semantic-index` alias
- support `--smoke` and `--report`
- emit stable report files for semantic index health and checklist mining
- keep `.md` / `.txt` checklist extraction in the same semantic lane
- surface empty checklist items (`[ ]`) as task candidates
- regenerate startup tasks only from verified semantic index outputs
- keep summary archive sources current:
  - `docs/graph/batch-gpu-analysis-report.json`
  - `docs/graph/codebase-map.md`
  - `memory/atlas/codebase-atlas.latest.md`
- prefer report outputs before attempting any DuckDB or clustering promotion
- do not run heavyweight graphify / Karpathy parent atlas indexing on every startup; use `mcp-health`, semantic-index smoke, and report lanes first

### Feature Gap Matrix

Use the canonical feature-gap matrix to map shipped docs/atlas features to storage and retrieval lanes:

- feature ID
- owner file
- source refs
- status: implemented | partial | missing | duplicate
- storage lane
- retrieval lane
- Qdrant tags
- TurboVec label
- next action

## Suggested Sequence

1. Verify listeners
2. Run OpenCode startup gate
3. Run Claude-Mem smoke
4. Run Redis 8 eval smoke
5. Confirm Postgres/Qdrant/Redis writes
6. Only then tackle MCP/TurboVec drift
7. Leave broad TS/test cleanup for a separate pass
8. Keep DuckDB / clustering evaluation optional and downstream from verified semantic index outputs
