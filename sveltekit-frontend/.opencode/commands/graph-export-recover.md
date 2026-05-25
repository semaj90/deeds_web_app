---
description: Run ACE graph export recovery without task delegation
agent: atlas-context
subtask: false
---

Do not use task tool.
Do not delegate.
Do not inspect hidden agents.

Run file discovery:

```powershell
rg --files -uu | rg "codebase-graph.json|deep-import-graph.json|deep-import-edges.jsonl|codebase-map.md"
```

Then run the master recovery command:

```powershell
npm run recover:graph
```

Return:

- `confirmed_paths`
- `files_changed`
- `graph_exports_result`
- `smoke_result`
- `next_steps`
- `memory/agent-runs/latest-recovery.json`
