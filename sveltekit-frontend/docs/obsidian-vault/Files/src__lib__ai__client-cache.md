---
type: "file"
path: "src/lib/ai/client-cache.ts"
aliases: ["client-cache.ts","src/lib/ai/client-cache.ts"]
clusterId: 14
ext: ".ts"
lineCount: 469
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/ai/client-cache.ts"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-14]]"]
imports: []
tags: ["file","ext/ts","cluster/14","t/ts","t/src","t/lib"]
---

# `src/lib/ai/client-cache.ts`
## For future Claude
> Client-Side Cache Layer — LokiJS (session) + IndexedDB (persistent).
cluster:: [[Clusters/cluster-14]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 469
## Summary

Client-Side Cache Layer — LokiJS (session) + IndexedDB (persistent).

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```