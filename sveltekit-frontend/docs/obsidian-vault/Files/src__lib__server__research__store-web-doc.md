---
type: "file"
path: "src/lib/server/research/store-web-doc.ts"
aliases: ["store-web-doc.ts","src/lib/server/research/store-web-doc.ts"]
clusterId: 43
ext: ".ts"
lineCount: 12
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/research/store-web-doc.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-43]]"]
imports: ["[[Files/web-research-ingester]]"]
tags: ["file","ext/ts","cluster/43","t/ts","t/src","t/lib"]
---

# `src/lib/server/research/store-web-doc.ts`
## For future Claude
> store-web-doc.ts — Persistent storage for research chunks in Qdrant.
cluster:: [[Clusters/cluster-43]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 12
## Summary

store-web-doc.ts — Persistent storage for research chunks in Qdrant.

## Imports

- imports:: [[Files/web-research-ingester]] `./web-research-ingester.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```