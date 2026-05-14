---
type: "file"
path: "src/lib/server/kb/wiki-logic.ts"
aliases: ["wiki-logic.ts","src/lib/server/kb/wiki-logic.ts"]
clusterId: -1
ext: ".ts"
lineCount: 542
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 11
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/kb/wiki-logic.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/env]]","[[Files/redis]]","[[Files/db__client]]","[[Files/db__schema__graph-mappings]]","[[Files/db__schema__features]]","[[Files/neo4j-driver]]","[[Files/wiki__wiki-couchdb-client]]"]
tags: ["file","ext/ts","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/kb/wiki-logic.ts`
## For future Claude
> .ts at src/lib/server/kb/wiki-logic.ts (542 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 542
## Imports

- imports:: [[Files/env]] `../env.server.js`
- imports:: [[Files/redis]] `../redis.js`
- imports:: [[Files/db__client]] `../db/client.js`
- imports:: [[Files/db__schema__graph-mappings]] `../db/schema/graph-mappings.js`
- imports:: [[Files/db__schema__features]] `../db/schema/features.js`
- imports:: [[Files/neo4j-driver]] `../neo4j-driver.js`
- imports:: [[Files/wiki__wiki-couchdb-client]] `../wiki/wiki-couchdb-client.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```