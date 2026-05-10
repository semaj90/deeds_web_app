---
type: "file"
path: "src/lib/server/ml/topic-cluster.ts"
aliases: ["topic-cluster.ts","src/lib/server/ml/topic-cluster.ts"]
clusterId: 6
ext: ".ts"
lineCount: 412
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ml/topic-cluster.ts"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: []
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/ml/topic-cluster.ts`
## For future Claude
> K-Means Clustering for Document Topic Modeling
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 412
## Summary

K-Means Clustering for Document Topic Modeling

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```