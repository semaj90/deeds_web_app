---
type: "file"
path: "src/lib/services/knowledge-search/TfIdfRanker.ts"
aliases: ["TfIdfRanker.ts","src/lib/services/knowledge-search/TfIdfRanker.ts"]
clusterId: 17
ext: ".ts"
lineCount: 303
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/services/knowledge-search/TfIdfRanker.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-17]]"]
imports: []
tags: ["file","ext/ts","cluster/17","t/ts","t/src","t/lib"]
---

# `src/lib/services/knowledge-search/TfIdfRanker.ts`
## For future Claude
> TF-IDF Ranker Service
cluster:: [[Clusters/cluster-17]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 303
## Summary

TF-IDF Ranker Service

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```