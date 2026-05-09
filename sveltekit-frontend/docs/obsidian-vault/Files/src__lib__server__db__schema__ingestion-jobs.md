---
type: "file"
path: "src/lib/server/db/schema/ingestion-jobs.ts"
aliases: ["ingestion-jobs.ts","src/lib/server/db/schema/ingestion-jobs.ts"]
clusterId: 55
ext: ".ts"
lineCount: 27
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/schema/ingestion-jobs.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-55]]"]
imports: ["[[Files/library-documents]]"]
tags: ["file","ext/ts","cluster/55","t/ts","t/src","t/lib"]
---

# `src/lib/server/db/schema/ingestion-jobs.ts`
## For future Claude
> Ingestion jobs — stage-tracked pipeline progress.
cluster:: [[Clusters/cluster-55]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 27
## Summary

Ingestion jobs — stage-tracked pipeline progress.

## Imports

- imports:: [[Files/library-documents]] `./library-documents`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```