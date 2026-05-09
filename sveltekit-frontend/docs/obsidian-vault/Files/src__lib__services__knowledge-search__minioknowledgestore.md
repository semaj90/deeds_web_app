---
type: "file"
path: "src/lib/services/knowledge-search/MinioKnowledgeStore.ts"
aliases: ["MinioKnowledgeStore.ts","src/lib/services/knowledge-search/MinioKnowledgeStore.ts"]
clusterId: 17
ext: ".ts"
lineCount: 440
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/services/knowledge-search/MinioKnowledgeStore.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-17]]"]
imports: ["[[Files/types]]"]
tags: ["file","ext/ts","cluster/17","zod","t/ts","t/src","t/lib"]
---

# `src/lib/services/knowledge-search/MinioKnowledgeStore.ts`
## For future Claude
> MinIO Knowledge Store
cluster:: [[Clusters/cluster-17]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 440
## Summary

MinIO Knowledge Store

## Imports

- imports:: [[Files/types]] `./types.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```