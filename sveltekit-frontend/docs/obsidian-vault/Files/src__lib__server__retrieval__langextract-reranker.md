---
type: "file"
path: "src/lib/server/retrieval/langextract-reranker.ts"
aliases: ["langextract-reranker.ts","src/lib/server/retrieval/langextract-reranker.ts"]
clusterId: 58
ext: ".ts"
lineCount: 251
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/retrieval/langextract-reranker.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-58]]"]
imports: []
tags: ["file","ext/ts","cluster/58","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/retrieval/langextract-reranker.ts`
## For future Claude
> LangExtract Entity-Aware GRPO Reranker
cluster:: [[Clusters/cluster-58]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 251
## Summary

LangExtract Entity-Aware GRPO Reranker

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```