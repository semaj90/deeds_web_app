---
type: "file"
path: "src/lib/server/ace/tag-sync.ts"
aliases: ["tag-sync.ts","src/lib/server/ace/tag-sync.ts"]
clusterId: 6
ext: ".ts"
lineCount: 226
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ace/tag-sync.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/types]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/ace/tag-sync.ts`
## For future Claude
> Mirrored Tag Sync — CouchDB + Qdrant + pgvector
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 226
## Summary

Mirrored Tag Sync — CouchDB + Qdrant + pgvector

## Imports

- imports:: [[Files/types]] `./types.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```