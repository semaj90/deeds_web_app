---
type: "file"
path: "src/lib/server/embedding/embedding-repository.ts"
aliases: ["embedding-repository.ts","src/lib/server/embedding/embedding-repository.ts"]
clusterId: 6
ext: ".ts"
lineCount: 84
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/embedding/embedding-repository.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/ingestion-queue]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/embedding/embedding-repository.ts`
## For future Claude
> .ts at src/lib/server/embedding/embedding-repository.ts (84 lines).
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 84
## Imports

- imports:: [[Files/ingestion-queue]] `./ingestion-queue.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```