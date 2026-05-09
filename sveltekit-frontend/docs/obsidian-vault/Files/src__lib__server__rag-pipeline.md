---
type: "file"
path: "src/lib/server/rag-pipeline.ts"
aliases: ["rag-pipeline.ts","src/lib/server/rag-pipeline.ts"]
clusterId: 6
ext: ".ts"
lineCount: 104
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/rag-pipeline.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/rag__rag-types]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/rag-pipeline.ts`
## For future Claude
> RAG Pipeline — end-to-end retrieval-augmented generation entry point.
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 104
## Summary

RAG Pipeline — end-to-end retrieval-augmented generation entry point.

## Imports

- imports:: [[Files/rag__rag-types]] `./rag/rag-types.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```