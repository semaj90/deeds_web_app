---
type: "file"
path: "src/lib/server/search/retrieval-explainer.ts"
aliases: ["retrieval-explainer.ts","src/lib/server/search/retrieval-explainer.ts"]
clusterId: 6
ext: ".ts"
lineCount: 66
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/search/retrieval-explainer.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/hybrid-search]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/search/retrieval-explainer.ts`
## For future Claude
> Builds the score breakdown JSON stored under ace:explain:{hash} in Redis
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 66
## Summary

Builds the score breakdown JSON stored under ace:explain:{hash} in Redis

## Imports

- imports:: [[Files/hybrid-search]] `./hybrid-search.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```