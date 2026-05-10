---
type: "file"
path: "src/lib/server/ml/topic-clustering-worker.ts"
aliases: ["topic-clustering-worker.ts","src/lib/server/ml/topic-clustering-worker.ts"]
clusterId: 69
ext: ".ts"
lineCount: 460
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 7
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ml/topic-clustering-worker.ts"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-69]]"]
imports: ["[[Files/topic-cluster]]"]
tags: ["file","ext/ts","cluster/69","t/ts","t/src","t/lib"]
---

# `src/lib/server/ml/topic-clustering-worker.ts`
## For future Claude
> Topic Clustering Background Worker
cluster:: [[Clusters/cluster-69]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 460
## Summary

Topic Clustering Background Worker

## Imports

- imports:: [[Files/topic-cluster]] `./topic-cluster.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```