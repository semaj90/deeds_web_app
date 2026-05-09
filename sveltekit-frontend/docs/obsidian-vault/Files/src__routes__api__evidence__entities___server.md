---
type: "file"
path: "src/routes/api/evidence/entities/+server.ts"
aliases: ["+server.ts","src/routes/api/evidence/entities/+server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 141
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/evidence/entities/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/api/evidence/entities/+server.ts`
## For future Claude
> GET /api/evidence/entities — Cross-evidence entity & forensic flag search
pagerank:: 0.000000
blend:: 0.000000
lines:: 141
## Summary

GET /api/evidence/entities — Cross-evidence entity & forensic flag search

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```