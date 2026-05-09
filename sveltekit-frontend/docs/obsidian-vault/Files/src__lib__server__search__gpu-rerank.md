---
type: "file"
path: "src/lib/server/search/gpu-rerank.ts"
aliases: ["gpu-rerank.ts","src/lib/server/search/gpu-rerank.ts"]
clusterId: 6
ext: ".ts"
lineCount: 102
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/search/gpu-rerank.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/mla-kv-compress]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/search/gpu-rerank.ts`
## For future Claude
> GPU/CPU reranker for final-stage candidate scoring.
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 102
## Summary

GPU/CPU reranker for final-stage candidate scoring.

## Imports

- imports:: [[Files/mla-kv-compress]] `./mla-kv-compress.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```