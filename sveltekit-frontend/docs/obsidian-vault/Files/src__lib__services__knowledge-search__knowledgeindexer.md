---
type: "file"
path: "src/lib/services/knowledge-search/KnowledgeIndexer.ts"
aliases: ["KnowledgeIndexer.ts","src/lib/services/knowledge-search/KnowledgeIndexer.ts"]
clusterId: 17
ext: ".ts"
lineCount: 479
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/services/knowledge-search/KnowledgeIndexer.ts"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-17]]"]
imports: ["[[Files/types]]"]
tags: ["file","ext/ts","cluster/17","t/ts","t/src","t/lib"]
---

# `src/lib/services/knowledge-search/KnowledgeIndexer.ts`
## For future Claude
> Knowledge Indexer Service
cluster:: [[Clusters/cluster-17]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 479
## Summary

Knowledge Indexer Service

## Imports

- imports:: [[Files/types]] `./types.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```