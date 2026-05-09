---
type: "file"
path: "src/routes/api/v1/redis/cache/+server.ts"
aliases: ["+server.ts","src/routes/api/v1/redis/cache/+server.ts"]
clusterId: 94
ext: ".ts"
lineCount: 33
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/v1/redis/cache/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-94]]"]
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","cluster/94","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/api/v1/redis/cache/+server.ts`
## For future Claude
> POST /api/v1/redis/cache — Set a key-value pair in Redis
cluster:: [[Clusters/cluster-94]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 33
## Summary

POST /api/v1/redis/cache — Set a key-value pair in Redis

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```