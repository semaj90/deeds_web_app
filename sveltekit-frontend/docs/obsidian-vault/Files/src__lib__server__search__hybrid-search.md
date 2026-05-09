---
type: "file"
path: "src/lib/server/search/hybrid-search.ts"
aliases: ["hybrid-search.ts","src/lib/server/search/hybrid-search.ts"]
clusterId: 6
ext: ".ts"
lineCount: 267
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 8
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/search/hybrid-search.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/postgres-fts]]","[[Files/qdrant-search]]","[[Files/neo4j-rerank]]","[[Files/gpu-rerank]]","[[Files/retrieval-explainer]]"]
tags: ["file","ext/ts","cluster/6","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/search/hybrid-search.ts`
## For future Claude
> Hybrid retrieval orchestrator.
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 267
## Summary

Hybrid retrieval orchestrator.

## Imports

- imports:: [[Files/postgres-fts]] `./postgres-fts.js`
- imports:: [[Files/qdrant-search]] `./qdrant-search.js`
- imports:: [[Files/neo4j-rerank]] `./neo4j-rerank.js`
- imports:: [[Files/gpu-rerank]] `./gpu-rerank.js`
- imports:: [[Files/retrieval-explainer]] `./retrieval-explainer.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```