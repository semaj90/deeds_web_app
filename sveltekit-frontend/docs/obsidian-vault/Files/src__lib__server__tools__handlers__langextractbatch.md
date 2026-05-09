---
type: "file"
path: "src/lib/server/tools/handlers/langextractBatch.ts"
aliases: ["langextractBatch.ts","src/lib/server/tools/handlers/langextractBatch.ts"]
clusterId: 32
ext: ".ts"
lineCount: 187
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/tools/handlers/langextractBatch.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-32]]"]
imports: ["[[Files/registry]]"]
tags: ["file","ext/ts","cluster/32","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/tools/handlers/langextractBatch.ts`
## For future Claude
> langextract_batch Tool Handler
cluster:: [[Clusters/cluster-32]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 187
## Summary

langextract_batch Tool Handler

## Imports

- imports:: [[Files/registry]] `../registry.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```