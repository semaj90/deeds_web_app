---
type: "file"
path: "src/lib/server/agent/supervisor.ts"
aliases: ["supervisor.ts","src/lib/server/agent/supervisor.ts"]
clusterId: 6
ext: ".ts"
lineCount: 388
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/agent/supervisor.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/subagents]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/agent/supervisor.ts`
## For future Claude
> Supervisor Agent — LangGraph StateGraph with Subagent Routing
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 388
## Summary

Supervisor Agent — LangGraph StateGraph with Subagent Routing

## Imports

- imports:: [[Files/subagents]] `./subagents.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```