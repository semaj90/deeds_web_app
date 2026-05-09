---
type: "file"
path: "src/lib/server/indexer/som-summary.ts"
aliases: ["som-summary.ts","src/lib/server/indexer/som-summary.ts"]
clusterId: 58
ext: ".ts"
lineCount: 196
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/indexer/som-summary.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-58]]"]
imports: []
tags: ["file","ext/ts","cluster/58","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/indexer/som-summary.ts`
## For future Claude
> SOM cell narrative summaries.
cluster:: [[Clusters/cluster-58]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 196
## Summary

SOM cell narrative summaries.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```