---
type: "file"
path: "src/lib/server/llm/ollamaClient.ts"
aliases: ["ollamaClient.ts","src/lib/server/llm/ollamaClient.ts"]
clusterId: 44
ext: ".ts"
lineCount: 212
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/llm/ollamaClient.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-44]]"]
imports: []
tags: ["file","ext/ts","cluster/44","t/ts","t/src","t/lib"]
---

# `src/lib/server/llm/ollamaClient.ts`
## For future Claude
> Ollama Client for AI operations
cluster:: [[Clusters/cluster-44]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 212
## Summary

Ollama Client for AI operations

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```