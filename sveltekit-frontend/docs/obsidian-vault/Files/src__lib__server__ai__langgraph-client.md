---
type: "file"
path: "src/lib/server/ai/langgraph-client.ts"
aliases: ["langgraph-client.ts","src/lib/server/ai/langgraph-client.ts"]
clusterId: 46
ext: ".ts"
lineCount: 280
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ai/langgraph-client.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-46]]"]
imports: []
tags: ["file","ext/ts","cluster/46","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/ai/langgraph-client.ts`
## For future Claude
> LangGraph Synthesis Service Client
cluster:: [[Clusters/cluster-46]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 280
## Summary

LangGraph Synthesis Service Client

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```