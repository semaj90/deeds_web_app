---
type: "file"
path: "src/routes/api/codebase-index/gpu-pipeline/+server.ts"
aliases: ["+server.ts","src/routes/api/codebase-index/gpu-pipeline/+server.ts"]
clusterId: 70
ext: ".ts"
lineCount: 1299
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 7
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/codebase-index/gpu-pipeline/+server.ts"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-70]]"]
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","cluster/70","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/api/codebase-index/gpu-pipeline/+server.ts`
## For future Claude
> POST /api/codebase-index/gpu-pipeline
cluster:: [[Clusters/cluster-70]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 1299
## Summary

POST /api/codebase-index/gpu-pipeline

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```