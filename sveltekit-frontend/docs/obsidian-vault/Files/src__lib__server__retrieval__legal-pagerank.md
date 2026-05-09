---
type: "file"
path: "src/lib/server/retrieval/legal-pagerank.ts"
aliases: ["legal-pagerank.ts","src/lib/server/retrieval/legal-pagerank.ts"]
clusterId: 73
ext: ".ts"
lineCount: 205
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/retrieval/legal-pagerank.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-73]]"]
imports: []
tags: ["file","ext/ts","cluster/73","t/ts","t/src","t/lib"]
---

# `src/lib/server/retrieval/legal-pagerank.ts`
## For future Claude
> Legal PageRank — Hybrid Ranking Algorithm
cluster:: [[Clusters/cluster-73]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 205
## Summary

Legal PageRank — Hybrid Ranking Algorithm

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```