---
type: "file"
path: "src/lib/server/indexer/dual-embedder.ts"
aliases: ["dual-embedder.ts","src/lib/server/indexer/dual-embedder.ts"]
clusterId: 58
ext: ".ts"
lineCount: 577
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 9
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/indexer/dual-embedder.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-58]]"]
imports: ["[[Files/ast-chunker]]","[[Files/ast-ingest-logger]]"]
tags: ["file","ext/ts","cluster/58","t/ts","t/src","t/lib"]
---

# `src/lib/server/indexer/dual-embedder.ts`
## For future Claude
> Dual Embedding Indexer
cluster:: [[Clusters/cluster-58]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 577
## Summary

Dual Embedding Indexer

## Imports

- imports:: [[Files/ast-chunker]] `./ast-chunker.js`
- imports:: [[Files/ast-ingest-logger]] `./ast-ingest-logger.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```