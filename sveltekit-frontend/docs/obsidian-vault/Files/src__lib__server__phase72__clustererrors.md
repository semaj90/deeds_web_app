---
type: "file"
path: "src/lib/server/phase72/clusterErrors.ts"
aliases: ["clusterErrors.ts","src/lib/server/phase72/clusterErrors.ts"]
clusterId: 6
ext: ".ts"
lineCount: 110
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/phase72/clusterErrors.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/vectorizeerrors]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/phase72/clusterErrors.ts`
## For future Claude
> .ts at src/lib/server/phase72/clusterErrors.ts (110 lines).
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 110
## Imports

- imports:: [[Files/vectorizeerrors]] `./vectorizeErrors.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```