---
type: "file"
path: "src/lib/server/gpu/mapreduce-worker.mjs"
aliases: ["mapreduce-worker.mjs","src/lib/server/gpu/mapreduce-worker.mjs"]
clusterId: 20
ext: ".mjs"
lineCount: 233
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/gpu/mapreduce-worker.mjs"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-20]]"]
imports: []
tags: ["file","ext/mjs","cluster/20","t/mjs","t/src","t/lib"]
---

# `src/lib/server/gpu/mapreduce-worker.mjs`
## For future Claude
> MapReduce GPU Worker Thread
cluster:: [[Clusters/cluster-20]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 233
## Summary

MapReduce GPU Worker Thread

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```