---
type: "file"
path: "src/lib/server/db/schema/library-document-versions.ts"
aliases: ["library-document-versions.ts","src/lib/server/db/schema/library-document-versions.ts"]
clusterId: 53
ext: ".ts"
lineCount: 25
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/schema/library-document-versions.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-53]]"]
imports: ["[[Files/library-documents]]"]
tags: ["file","ext/ts","cluster/53","t/ts","t/src","t/lib"]
---

# `src/lib/server/db/schema/library-document-versions.ts`
## For future Claude
> Library document versions — one row per version or amendment state.
cluster:: [[Clusters/cluster-53]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 25
## Summary

Library document versions — one row per version or amendment state.

## Imports

- imports:: [[Files/library-documents]] `./library-documents`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```