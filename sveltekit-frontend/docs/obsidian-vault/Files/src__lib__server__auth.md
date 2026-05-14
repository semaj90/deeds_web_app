---
type: "file"
path: "src/lib/server/auth.ts"
aliases: ["auth.ts","src/lib/server/auth.ts"]
clusterId: -1
ext: ".ts"
lineCount: 561
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: false
importCount: 10
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/auth.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/db__client]]","[[Files/db__schema-postgres]]","[[Files/env]]","[[Files/errors]]","[[Files/utils__endpoints]]"]
tags: ["file","ext/ts","auth","t/ts","t/src","t/lib"]
---

# `src/lib/server/auth.ts`
## For future Claude
> src/lib/server/auth.ts
pagerank:: 0.000000
blend:: 0.000000
lines:: 561
## Summary

src/lib/server/auth.ts

## Imports

- imports:: [[Files/db__client]] `./db/client`
- imports:: [[Files/db__schema-postgres]] `./db/schema-postgres.js`
- imports:: [[Files/env]] `./env.server.js`
- imports:: [[Files/errors]] `./errors.js`
- imports:: [[Files/utils__endpoints]] `./utils/endpoints.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```