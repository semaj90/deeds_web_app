---
type: "file"
path: "src/lib/server/tensor/tensor-analysis-cache.ts"
aliases: ["tensor-analysis-cache.ts","src/lib/server/tensor/tensor-analysis-cache.ts"]
clusterId: 6
ext: ".ts"
lineCount: 297
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/tensor/tensor-analysis-cache.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/topology-byte-mapper]]"]
tags: ["file","ext/ts","cluster/6","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/tensor/tensor-analysis-cache.ts`
## For future Claude
> tensor-analysis-cache.ts
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 297
## Summary

tensor-analysis-cache.ts

## Imports

- imports:: [[Files/topology-byte-mapper]] `./topology-byte-mapper.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```