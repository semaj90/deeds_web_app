---
type: "file"
path: "src/lib/server/db/schema-ingestion.ts"
aliases: ["schema-ingestion.ts","src/lib/server/db/schema-ingestion.ts"]
clusterId: 53
ext: ".ts"
lineCount: 293
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/schema-ingestion.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-53]]"]
imports: ["[[Files/schema-postgres]]"]
tags: ["file","ext/ts","cluster/53","t/ts","t/src","t/lib"]
---

# `src/lib/server/db/schema-ingestion.ts`
## For future Claude
> Enhanced Schema Migration for Document Ingestion Pipeline
cluster:: [[Clusters/cluster-53]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 293
## Summary

Enhanced Schema Migration for Document Ingestion Pipeline

## Imports

- imports:: [[Files/schema-postgres]] `./schema-postgres.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```