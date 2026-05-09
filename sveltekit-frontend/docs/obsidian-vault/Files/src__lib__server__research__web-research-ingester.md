---
type: "file"
path: "src/lib/server/research/web-research-ingester.ts"
aliases: ["web-research-ingester.ts","src/lib/server/research/web-research-ingester.ts"]
clusterId: 58
ext: ".ts"
lineCount: 291
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/research/web-research-ingester.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-58]]"]
imports: ["[[Files/research-utils]]"]
tags: ["file","ext/ts","cluster/58","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/research/web-research-ingester.ts`
## For future Claude
> web-research-ingester.ts — Lane 3: Qdrant chunks_web_search indexer
cluster:: [[Clusters/cluster-58]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 291
## Summary

web-research-ingester.ts — Lane 3: Qdrant chunks_web_search indexer

## Imports

- imports:: [[Files/research-utils]] `./research-utils.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```