---
type: "file"
path: "src/lib/server/db/schema/state-constitution-sources.ts"
aliases: ["state-constitution-sources.ts","src/lib/server/db/schema/state-constitution-sources.ts"]
clusterId: 95
ext: ".ts"
lineCount: 35
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/schema/state-constitution-sources.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-95]]"]
imports: ["[[Files/library-documents]]"]
tags: ["file","ext/ts","cluster/95","t/ts","t/src","t/lib"]
---

# `src/lib/server/db/schema/state-constitution-sources.ts`
## For future Claude
> State constitution sources registry — one row per state/territory.
cluster:: [[Clusters/cluster-95]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 35
## Summary

State constitution sources registry — one row per state/territory.

## Imports

- imports:: [[Files/library-documents]] `./library-documents`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```