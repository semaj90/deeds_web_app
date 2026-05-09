---
type: "file"
path: "src/lib/server/graph/graph-intel.ts"
aliases: ["graph-intel.ts","src/lib/server/graph/graph-intel.ts"]
clusterId: 73
ext: ".ts"
lineCount: 307
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/graph/graph-intel.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-73]]"]
imports: []
tags: ["file","ext/ts","cluster/73","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/graph/graph-intel.ts`
## For future Claude
> Graph Intel — fast codebase-graph.json reader for ACE + Gemma4 tool-calling
cluster:: [[Clusters/cluster-73]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 307
## Summary

Graph Intel — fast codebase-graph.json reader for ACE + Gemma4 tool-calling

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```