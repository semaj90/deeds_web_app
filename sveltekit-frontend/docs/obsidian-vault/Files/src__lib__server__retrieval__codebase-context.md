---
type: "file"
path: "src/lib/server/retrieval/codebase-context.ts"
aliases: ["codebase-context.ts","src/lib/server/retrieval/codebase-context.ts"]
clusterId: 58
ext: ".ts"
lineCount: 774
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 9
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/retrieval/codebase-context.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-58]]"]
imports: ["[[Files/cross-encoder-reranker]]"]
tags: ["file","ext/ts","cluster/58","t/ts","t/src","t/lib"]
---

# `src/lib/server/retrieval/codebase-context.ts`
## For future Claude
> Shared codebase retrieval module: recall (Fuse.js) -> rerank (Qdrant tri-vector).
cluster:: [[Clusters/cluster-58]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 774
## Summary

Shared codebase retrieval module: recall (Fuse.js) -> rerank (Qdrant tri-vector).

## Imports

- imports:: [[Files/cross-encoder-reranker]] `./cross-encoder-reranker.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```