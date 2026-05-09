---
type: "file"
path: "src/lib/server/vector/qdrant-api-wrapper.ts"
aliases: ["qdrant-api-wrapper.ts","src/lib/server/vector/qdrant-api-wrapper.ts"]
clusterId: 18
ext: ".ts"
lineCount: 229
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/vector/qdrant-api-wrapper.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-18]]"]
imports: ["[[Files/production-logger]]"]
tags: ["file","ext/ts","cluster/18","t/ts","t/src","t/lib"]
---

# `src/lib/server/vector/qdrant-api-wrapper.ts`
## For future Claude
> .ts at src/lib/server/vector/qdrant-api-wrapper.ts (229 lines).
cluster:: [[Clusters/cluster-18]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 229
## Imports

- imports:: [[Files/production-logger]] `../production-logger.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```