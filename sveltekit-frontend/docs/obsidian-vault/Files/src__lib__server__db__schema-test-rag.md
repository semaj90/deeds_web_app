---
type: "file"
path: "src/lib/server/db/schema-test-rag.ts"
aliases: ["schema-test-rag.ts","src/lib/server/db/schema-test-rag.ts"]
clusterId: 63
ext: ".ts"
lineCount: 115
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/schema-test-rag.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-63]]"]
imports: []
tags: ["file","ext/ts","cluster/63","t/ts","t/src","t/lib"]
---

# `src/lib/server/db/schema-test-rag.ts`
## For future Claude
> Test RAG Schema - Separate tables for RAG testing
cluster:: [[Clusters/cluster-63]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 115
## Summary

Test RAG Schema - Separate tables for RAG testing

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```