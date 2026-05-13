---
type: "file"
path: "src/lib/server/vector/qdrant-manager.ts"
aliases: ["qdrant-manager.ts","src/lib/server/vector/qdrant-manager.ts"]
clusterId: -1
ext: ".ts"
lineCount: 960
pagerank: 0.209264
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 8
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/vector/qdrant-manager.ts"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/bm42-sparse]]"]
tags: ["file","ext/ts","t/ts","t/src","t/lib"]
---

# `src/lib/server/vector/qdrant-manager.ts`
## For future Claude
> Shared return shape for all search methods (hybridSearch, _denseSearch, sectionFilteredSearch, sparseHybridSearch).
pagerank:: 0.209264
blend:: 0.000000
lines:: 960
## Summary

Shared return shape for all search methods (hybridSearch, _denseSearch, sectionFilteredSearch, sparseHybridSearch).

## Imports

- imports:: [[Files/bm42-sparse]] `./bm42-sparse.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```