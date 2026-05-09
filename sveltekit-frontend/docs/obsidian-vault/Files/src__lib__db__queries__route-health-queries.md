---
type: "file"
path: "src/lib/db/queries/route-health-queries.ts"
aliases: ["route-health-queries.ts","src/lib/db/queries/route-health-queries.ts"]
clusterId: 91
ext: ".ts"
lineCount: 503
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/db/queries/route-health-queries.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-91]]"]
imports: ["[[Files/pool]]","[[Files/schema__route-health-tables]]"]
tags: ["file","ext/ts","cluster/91","t/ts","t/src","t/lib"]
---

# `src/lib/db/queries/route-health-queries.ts`
## For future Claude
> NES Command Center Database Query Helpers
cluster:: [[Clusters/cluster-91]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 503
## Summary

NES Command Center Database Query Helpers

## Imports

- imports:: [[Files/pool]] `../pool.js`
- imports:: [[Files/schema__route-health-tables]] `../schema/route-health-tables.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```