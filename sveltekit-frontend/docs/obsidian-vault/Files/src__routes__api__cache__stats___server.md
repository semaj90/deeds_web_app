---
type: "file"
path: "src/routes/api/cache/stats/+server.ts"
aliases: ["+server.ts","src/routes/api/cache/stats/+server.ts"]
clusterId: 25
ext: ".ts"
lineCount: 244
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/cache/stats/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-25]]"]
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","cluster/25","route","auth","t/ts","t/src","t/routes"]
---

# `src/routes/api/cache/stats/+server.ts`
## For future Claude
> Cache Statistics API
cluster:: [[Clusters/cluster-25]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 244
## Summary

Cache Statistics API

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```