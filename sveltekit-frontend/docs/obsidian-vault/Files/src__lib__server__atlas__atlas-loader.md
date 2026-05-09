---
type: "file"
path: "src/lib/server/atlas/atlas-loader.ts"
aliases: ["atlas-loader.ts","src/lib/server/atlas/atlas-loader.ts"]
clusterId: 6
ext: ".ts"
lineCount: 152
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/atlas/atlas-loader.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/types]]"]
tags: ["file","ext/ts","cluster/6","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/atlas/atlas-loader.ts`
## For future Claude
> atlas-loader — single point that pulls the YoRHa Knowledge Atlas + its
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 152
## Summary

atlas-loader — single point that pulls the YoRHa Knowledge Atlas + its

## Imports

- imports:: [[Files/types]] `./types.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```