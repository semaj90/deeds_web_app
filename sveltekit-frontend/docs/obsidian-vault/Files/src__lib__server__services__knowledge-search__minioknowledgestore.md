---
type: "file"
path: "src/lib/server/services/knowledge-search/MinioKnowledgeStore.ts"
aliases: ["MinioKnowledgeStore.ts","src/lib/server/services/knowledge-search/MinioKnowledgeStore.ts"]
clusterId: -1
ext: ".ts"
lineCount: 442
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/services/knowledge-search/MinioKnowledgeStore.ts"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/types]]"]
tags: ["file","ext/ts","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/services/knowledge-search/MinioKnowledgeStore.ts`
## For future Claude
> MinIO Knowledge Store
pagerank:: 0.000000
blend:: 0.000000
lines:: 442
## Summary

MinIO Knowledge Store

## Imports

- imports:: [[Files/types]] `./types.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```