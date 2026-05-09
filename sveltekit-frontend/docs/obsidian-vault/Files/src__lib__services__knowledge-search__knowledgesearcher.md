---
type: "file"
path: "src/lib/services/knowledge-search/KnowledgeSearcher.ts"
aliases: ["KnowledgeSearcher.ts","src/lib/services/knowledge-search/KnowledgeSearcher.ts"]
clusterId: 81
ext: ".ts"
lineCount: 301
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/services/knowledge-search/KnowledgeSearcher.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-81]]"]
imports: ["[[Files/types]]","[[Files/qdrantknowledgestore]]","[[Files/tfidfranker]]","[[Files/minioknowledgestore]]","[[Files/rediscacheservice]]"]
tags: ["file","ext/ts","cluster/81","t/ts","t/src","t/lib"]
---

# `src/lib/services/knowledge-search/KnowledgeSearcher.ts`
## For future Claude
> Knowledge Searcher
cluster:: [[Clusters/cluster-81]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 301
## Summary

Knowledge Searcher

## Imports

- imports:: [[Files/types]] `./types.js`
- imports:: [[Files/qdrantknowledgestore]] `./QdrantKnowledgeStore.js`
- imports:: [[Files/tfidfranker]] `./TfIdfRanker.js`
- imports:: [[Files/minioknowledgestore]] `./MinioKnowledgeStore.js`
- imports:: [[Files/rediscacheservice]] `./RedisCacheService.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```