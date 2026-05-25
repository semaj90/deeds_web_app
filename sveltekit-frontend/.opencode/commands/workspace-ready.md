---
description: Validate Windows workspace, sidecars, indexing, and feature readiness
agent: workspace-ready
subtask: true
---

Execute deterministic workspace readiness.

Do not delegate.
Do not use Task.
Every command needs a description.

Run discovery first:

```powershell
rg --files -uu | rg "opencode|package.json|docker-compose|compose|\.env|drizzle|qdrant|redis|ollama|turbo|duckdb|graph|atlas|ace|mcp"
```

Run content search:

```powershell
rg -n -uu "atlas|graph:exports|qdrant|redis|postgres|pgvector|duckdb|ollama|turboquant|rotorquant|TRACE|MCP|index|embedding|drizzle" .
```

Inspect scripts:

```powershell
npm run
```

Then run only scripts that exist:

- sidecar health
- model probe
- graph exports
- atlas index
- DuckDB smoke
- hyperrag smoke
- unit tests

Preferred order:

1. validate config
2. discover available scripts
3. check sidecars
4. run model probe
5. run graph exports
6. run atlas/codebase indexing
7. run smoke tests
8. write `memory/agent-runs/latest-workspace-ready.json`

Return compact JSON only.

