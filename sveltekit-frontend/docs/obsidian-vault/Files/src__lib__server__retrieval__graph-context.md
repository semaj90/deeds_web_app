---
type: "file"
path: "src/lib/server/retrieval/graph-context.ts"
aliases: ["graph-context.ts","src/lib/server/retrieval/graph-context.ts"]
clusterId: 73
ext: ".ts"
lineCount: 432
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/retrieval/graph-context.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-73]]"]
imports: []
tags: ["file","ext/ts","cluster/73","t/ts","t/src","t/lib"]
---

# `src/lib/server/retrieval/graph-context.ts`
## For future Claude
> Shared KAG (Knowledge-Augmented Generation) module.
cluster:: [[Clusters/cluster-73]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 432
## Summary

Shared KAG (Knowledge-Augmented Generation) module.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```