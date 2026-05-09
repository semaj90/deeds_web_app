---
type: "file"
path: "src/lib/services/knowledge-search/PostgresKnowledgeStore.ts"
aliases: ["PostgresKnowledgeStore.ts","src/lib/services/knowledge-search/PostgresKnowledgeStore.ts"]
clusterId: 17
ext: ".ts"
lineCount: 239
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/services/knowledge-search/PostgresKnowledgeStore.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-17]]"]
imports: ["[[Files/types]]","[[Files/qdrantknowledgestore]]"]
tags: ["file","ext/ts","cluster/17","t/ts","t/src","t/lib"]
---

# `src/lib/services/knowledge-search/PostgresKnowledgeStore.ts`
## For future Claude
> PostgreSQL Knowledge Store
cluster:: [[Clusters/cluster-17]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 239
## Summary

PostgreSQL Knowledge Store

## Imports

- imports:: [[Files/types]] `./types.js`
- imports:: [[Files/qdrantknowledgestore]] `./QdrantKnowledgeStore.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```