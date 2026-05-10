---
type: "file"
path: "src/lib/server/retrieval/citation-graph.ts"
aliases: ["citation-graph.ts","src/lib/server/retrieval/citation-graph.ts"]
clusterId: 73
ext: ".ts"
lineCount: 389
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/retrieval/citation-graph.ts"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-73]]"]
imports: ["[[Files/legal-pagerank]]"]
tags: ["file","ext/ts","cluster/73","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/retrieval/citation-graph.ts`
## For future Claude
> Citation Network Graph — Iterative PageRank for Legal Documents
cluster:: [[Clusters/cluster-73]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 389
## Summary

Citation Network Graph — Iterative PageRank for Legal Documents

## Imports

- imports:: [[Files/legal-pagerank]] `./legal-pagerank.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```