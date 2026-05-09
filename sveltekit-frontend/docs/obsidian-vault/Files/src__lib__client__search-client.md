---
type: "file"
path: "src/lib/client/search-client.ts"
aliases: ["search-client.ts","src/lib/client/search-client.ts"]
clusterId: 57
ext: ".ts"
lineCount: 170
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/client/search-client.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-57]]"]
imports: ["[[Files/streaming-handler]]"]
tags: ["file","ext/ts","cluster/57","zod","t/ts","t/src","t/lib"]
---

# `src/lib/client/search-client.ts`
## For future Claude
> Type-safe search client for legal search system
cluster:: [[Clusters/cluster-57]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 170
## Summary

Type-safe search client for legal search system

## Imports

- imports:: [[Files/streaming-handler]] `./streaming-handler.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```