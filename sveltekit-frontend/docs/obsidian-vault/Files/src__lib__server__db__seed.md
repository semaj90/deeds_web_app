---
type: "file"
path: "src/lib/server/db/seed.ts"
aliases: ["seed.ts","src/lib/server/db/seed.ts"]
clusterId: -1
ext: ".ts"
lineCount: 591
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 7
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/seed.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/schema-postgres]]"]
tags: ["file","ext/ts","t/ts","t/src","t/lib"]
---

# `src/lib/server/db/seed.ts`
## For future Claude
> Database Seed Script - Drizzle ORM 0.44
pagerank:: 0.000000
blend:: 0.000000
lines:: 591
## Summary

Database Seed Script - Drizzle ORM 0.44

## Imports

- imports:: [[Files/schema-postgres]] `./schema-postgres`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```