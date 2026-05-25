---
description: Recover graph export artifacts and validate DuckDB smoke
agent: atlas-context
subtask: false
---

# Graph Export Recovery Command

Do not use task tool.
Do not delegate.

Run file discovery:

```powershell
rg --files -uu | rg "codebase-graph.json|deep-import-graph.json|deep-import-edges.jsonl|codebase-map.md"
```

If needed, patch:

```powershell
sveltekit-frontend/scripts/atlas/generate-graph-exports.mjs
```

Then run:

```powershell
npm run graph:exports
powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".\duckdb\smoke-duckdb.ps1"
```

Return:

confirmed_paths
files_changed
graph_exports_result
smoke_result
next_steps
