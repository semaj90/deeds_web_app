---
type: "file"
path: "src/lib/server/auth.ts"
aliases: ["auth.ts","src/lib/server/auth.ts"]
clusterId: 90
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
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-90]]"]
imports: ["[[Files/db__client]]","[[Files/db__schema]]","[[Files/env]]","[[Files/errors]]","[[Files/utils__endpoints]]"]
tags: ["file","ext/ts","cluster/90","auth","t/ts","t/src","t/lib"]
---

# `src/lib/server/auth.ts`
## For future Claude
> src/lib/server/auth.ts
cluster:: [[Clusters/cluster-90]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 561
## Summary

src/lib/server/auth.ts

## Imports

- imports:: [[Files/db__client]] `./db/client`
- imports:: [[Files/db__schema]] `./db/schema.js`
- imports:: [[Files/env]] `./env.server.js`
- imports:: [[Files/errors]] `./errors.js`
- imports:: [[Files/utils__endpoints]] `./utils/endpoints.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```