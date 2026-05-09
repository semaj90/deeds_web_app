---
type: "file"
path: "src/lib/server/graph/pg-neo4j-sync.ts"
aliases: ["pg-neo4j-sync.ts","src/lib/server/graph/pg-neo4j-sync.ts"]
clusterId: 70
ext: ".ts"
lineCount: 277
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/graph/pg-neo4j-sync.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-70]]"]
imports: ["[[Files/neo4j-schema]]"]
tags: ["file","ext/ts","cluster/70","t/ts","t/src","t/lib"]
---

# `src/lib/server/graph/pg-neo4j-sync.ts`
## For future Claude
> PostgreSQL → Neo4j Sync Pipeline
cluster:: [[Clusters/cluster-70]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 277
## Summary

PostgreSQL → Neo4j Sync Pipeline

## Imports

- imports:: [[Files/neo4j-schema]] `./neo4j-schema.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```