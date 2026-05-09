---
type: "file"
path: "src/lib/server/minio-client.ts"
aliases: ["minio-client.ts","src/lib/server/minio-client.ts"]
clusterId: 6
ext: ".ts"
lineCount: 265
pagerank: 0.211763
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/minio-client.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: []
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/minio-client.ts`
## For future Claude
> Raw MinIO Client singleton — use for advanced ops (statObject, getPartialObject, streaming)
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.211763
blend:: 0.000000
lines:: 265
## Summary

Raw MinIO Client singleton — use for advanced ops (statObject, getPartialObject, streaming)

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```