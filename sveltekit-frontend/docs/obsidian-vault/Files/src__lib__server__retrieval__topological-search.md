---
type: "file"
path: "src/lib/server/retrieval/topological-search.ts"
aliases: ["topological-search.ts","src/lib/server/retrieval/topological-search.ts"]
clusterId: 73
ext: ".ts"
lineCount: 236
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/retrieval/topological-search.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-73]]"]
imports: ["[[Files/codebase-context]]","[[Files/manifold4-search]]"]
tags: ["file","ext/ts","cluster/73","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/retrieval/topological-search.ts`
## For future Claude
> Advanced Topological Retrieval Boost
cluster:: [[Clusters/cluster-73]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 236
## Summary

Advanced Topological Retrieval Boost

## Imports

- imports:: [[Files/codebase-context]] `./codebase-context`
- imports:: [[Files/manifold4-search]] `./manifold4-search.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```