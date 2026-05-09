---
type: "file"
path: "src/lib/server/db/schema/search-analytics.ts"
aliases: ["search-analytics.ts","src/lib/server/db/schema/search-analytics.ts"]
clusterId: 55
ext: ".ts"
lineCount: 341
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/schema/search-analytics.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-55]]"]
imports: ["[[Files/schema-postgres]]","[[Files/codebase-intelligence]]"]
tags: ["file","ext/ts","cluster/55","t/ts","t/src","t/lib"]
---

# `src/lib/server/db/schema/search-analytics.ts`
## For future Claude
> Search Analytics Schema
cluster:: [[Clusters/cluster-55]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 341
## Summary

Search Analytics Schema

## Imports

- imports:: [[Files/schema-postgres]] `../schema-postgres`
- imports:: [[Files/codebase-intelligence]] `./codebase-intelligence`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```