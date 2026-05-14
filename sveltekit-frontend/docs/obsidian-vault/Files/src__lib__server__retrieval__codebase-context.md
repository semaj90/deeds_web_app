---
type: "file"
path: "src/lib/server/retrieval/codebase-context.ts"
aliases: ["codebase-context.ts","src/lib/server/retrieval/codebase-context.ts"]
clusterId: -1
ext: ".ts"
lineCount: 866
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 9
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/retrieval/codebase-context.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/cross-encoder-reranker]]"]
tags: ["file","ext/ts","t/ts","t/src","t/lib"]
---

# `src/lib/server/retrieval/codebase-context.ts`
## For future Claude
> Shared codebase retrieval module: recall (Fuse.js) -> rerank (Qdrant tri-vector).
pagerank:: 0.000000
blend:: 0.000000
lines:: 866
## Summary

Shared codebase retrieval module: recall (Fuse.js) -> rerank (Qdrant tri-vector).

## Imports

- imports:: [[Files/cross-encoder-reranker]] `./cross-encoder-reranker.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```