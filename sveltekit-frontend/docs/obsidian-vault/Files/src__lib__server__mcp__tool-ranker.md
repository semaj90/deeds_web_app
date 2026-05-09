---
type: "file"
path: "src/lib/server/mcp/tool-ranker.ts"
aliases: ["tool-ranker.ts","src/lib/server/mcp/tool-ranker.ts"]
clusterId: 82
ext: ".ts"
lineCount: 355
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/mcp/tool-ranker.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-82]]"]
imports: []
tags: ["file","ext/ts","cluster/82","t/ts","t/src","t/lib"]
---

# `src/lib/server/mcp/tool-ranker.ts`
## For future Claude
> FastMCP tool-call ranking — recommends the top tools for a given HMM state.
cluster:: [[Clusters/cluster-82]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 355
## Summary

FastMCP tool-call ranking — recommends the top tools for a given HMM state.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```