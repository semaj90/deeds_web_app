---
type: "file"
path: "src/lib/server/error-brain/transport/redis.ts"
aliases: ["redis.ts","src/lib/server/error-brain/transport/redis.ts"]
clusterId: 6
ext: ".ts"
lineCount: 45
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/error-brain/transport/redis.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/events]]","[[Files/interface]]"]
tags: ["file","ext/ts","cluster/6","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/error-brain/transport/redis.ts`
## For future Claude
> Redis transport for error-brain
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 45
## Summary

Redis transport for error-brain

## Imports

- imports:: [[Files/events]] `../events.js`
- imports:: [[Files/interface]] `./interface.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```