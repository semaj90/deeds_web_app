---
type: "file"
path: "src/lib/utils/endpoints.ts"
aliases: ["endpoints.ts","src/lib/utils/endpoints.ts"]
clusterId: 1
ext: ".ts"
lineCount: 11
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/utils/endpoints.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-1]]"]
imports: []
tags: ["file","ext/ts","cluster/1","t/ts","t/src","t/lib"]
---

# `src/lib/utils/endpoints.ts`
## For future Claude
> Returns the Ollama API endpoint, prioritizing the process.env.OLLAMA_URL environment variable
cluster:: [[Clusters/cluster-1]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 11
## Summary

Returns the Ollama API endpoint, prioritizing the process.env.OLLAMA_URL environment variable

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```