---
type: "file"
path: "src/lib/server/error-brain/transport/factory.ts"
aliases: ["factory.ts","src/lib/server/error-brain/transport/factory.ts"]
clusterId: 6
ext: ".ts"
lineCount: 68
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/error-brain/transport/factory.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/feature-flags]]","[[Files/interface]]","[[Files/mux]]","[[Files/none]]","[[Files/redis]]","[[Files/sse]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/error-brain/transport/factory.ts`
## For future Claude
> lib/server/error-brain/transport/factory.ts
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 68
## Summary

lib/server/error-brain/transport/factory.ts

## Imports

- imports:: [[Files/feature-flags]] `../feature-flags.js`
- imports:: [[Files/interface]] `./interface.js`
- imports:: [[Files/mux]] `./mux.js`
- imports:: [[Files/none]] `./none.js`
- imports:: [[Files/redis]] `./redis.js`
- imports:: [[Files/sse]] `./sse.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```