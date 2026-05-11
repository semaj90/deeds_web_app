---
type: "file"
path: "src/lib/server/retrieval/cross-encoder-reranker.ts"
aliases: ["cross-encoder-reranker.ts","src/lib/server/retrieval/cross-encoder-reranker.ts"]
clusterId: 58
ext: ".ts"
lineCount: 684
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 9
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/retrieval/cross-encoder-reranker.ts"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-58]]"]
imports: ["[[Files/triton-reranker]]"]
tags: ["file","ext/ts","cluster/58","t/ts","t/src","t/lib"]
---

# `src/lib/server/retrieval/cross-encoder-reranker.ts`
## For future Claude
> Cross-Encoder Reranker — Gemma4 pointwise scoring with Redis score cache.
cluster:: [[Clusters/cluster-58]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 684
## Summary

Cross-Encoder Reranker — Gemma4 pointwise scoring with Redis score cache.

## Imports

- imports:: [[Files/triton-reranker]] `./triton-reranker.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```