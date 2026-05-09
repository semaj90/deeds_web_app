---
type: "file"
path: "src/lib/server/db/client.ts"
aliases: ["client.ts","src/lib/server/db/client.ts"]
clusterId: 6
ext: ".ts"
lineCount: 112
pagerank: 0.73
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 7
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/client.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/schema-canvas-autosaves]]","[[Files/schema]]","[[Files/drizzle-cache]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/db/client.ts`
## For future Claude
> Reset pool health flag after successful connectivity check
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.730000
blend:: 0.000000
lines:: 112
## Summary

Reset pool health flag after successful connectivity check

## Imports

- imports:: [[Files/schema-canvas-autosaves]] `./schema-canvas-autosaves.js`
- imports:: [[Files/schema]] `./schema.js`
- imports:: [[Files/drizzle-cache]] `./drizzle-cache.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```