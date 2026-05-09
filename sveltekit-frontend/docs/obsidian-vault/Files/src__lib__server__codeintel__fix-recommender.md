---
type: "file"
path: "src/lib/server/codeintel/fix-recommender.ts"
aliases: ["fix-recommender.ts","src/lib/server/codeintel/fix-recommender.ts"]
clusterId: 6
ext: ".ts"
lineCount: 498
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/codeintel/fix-recommender.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: []
tags: ["file","ext/ts","cluster/6","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/codeintel/fix-recommender.ts`
## For future Claude
> fix-recommender.ts — CodeIntel-aware error-fix recommendation engine
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 498
## Summary

fix-recommender.ts — CodeIntel-aware error-fix recommendation engine

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```