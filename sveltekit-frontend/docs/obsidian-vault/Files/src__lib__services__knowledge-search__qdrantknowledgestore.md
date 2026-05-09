---
type: "file"
path: "src/lib/services/knowledge-search/QdrantKnowledgeStore.ts"
aliases: ["QdrantKnowledgeStore.ts","src/lib/services/knowledge-search/QdrantKnowledgeStore.ts"]
clusterId: 75
ext: ".ts"
lineCount: 443
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/services/knowledge-search/QdrantKnowledgeStore.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-75]]"]
imports: ["[[Files/types]]"]
tags: ["file","ext/ts","cluster/75","t/ts","t/src","t/lib"]
---

# `src/lib/services/knowledge-search/QdrantKnowledgeStore.ts`
## For future Claude
> Qdrant Knowledge Store
cluster:: [[Clusters/cluster-75]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 443
## Summary

Qdrant Knowledge Store

## Imports

- imports:: [[Files/types]] `./types.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```