---
type: "file"
path: "src/lib/server/kb/payload-builders.ts"
aliases: ["payload-builders.ts","src/lib/server/kb/payload-builders.ts"]
clusterId: 6
ext: ".ts"
lineCount: 86
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/kb/payload-builders.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/types__qdrant]]","[[Files/embed-text]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/kb/payload-builders.ts`
## For future Claude
> Payload factory functions for Qdrant upsert and enrichment operations.
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 86
## Summary

Payload factory functions for Qdrant upsert and enrichment operations.

## Imports

- imports:: [[Files/types__qdrant]] `../types/qdrant.js`
- imports:: [[Files/embed-text]] `./embed-text.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```