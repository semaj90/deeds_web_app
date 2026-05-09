---
type: "file"
path: "src/lib/server/init/legal-search-init.ts"
aliases: ["legal-search-init.ts","src/lib/server/init/legal-search-init.ts"]
clusterId: 6
ext: ".ts"
lineCount: 105
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/init/legal-search-init.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/db__legal-db-init]]","[[Files/minio-client]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/init/legal-search-init.ts`
## For future Claude
> Legal Search System Initialization
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 105
## Summary

Legal Search System Initialization

## Imports

- imports:: [[Files/db__legal-db-init]] `../db/legal-db-init.js`
- imports:: [[Files/minio-client]] `../minio-client.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```