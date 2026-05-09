---
type: "file"
path: "src/lib/server/rag/ranker.ts"
aliases: ["ranker.ts","src/lib/server/rag/ranker.ts"]
clusterId: 73
ext: ".ts"
lineCount: 86
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/rag/ranker.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-73]]"]
imports: []
tags: ["file","ext/ts","cluster/73","t/ts","t/src","t/lib"]
---

# `src/lib/server/rag/ranker.ts`
## For future Claude
> Rerank search results using legal-aware scoring
cluster:: [[Clusters/cluster-73]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 86
## Summary

Rerank search results using legal-aware scoring

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```