---
type: "file"
path: "src/lib/server/research/research-to-wiki-encoder.ts"
aliases: ["research-to-wiki-encoder.ts","src/lib/server/research/research-to-wiki-encoder.ts"]
clusterId: 43
ext: ".ts"
lineCount: 77
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/research/research-to-wiki-encoder.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-43]]"]
imports: ["[[Files/indexer__karpathy-wiki]]","[[Files/grpc__embedding-client]]","[[Files/vector__qdrant-manager]]","[[Files/neo4j-driver]]"]
tags: ["file","ext/ts","cluster/43","t/ts","t/src","t/lib"]
---

# `src/lib/server/research/research-to-wiki-encoder.ts`
## For future Claude
> Research-to-Wiki Encoder: Bridges external research findings into the
cluster:: [[Clusters/cluster-43]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 77
## Summary

Research-to-Wiki Encoder: Bridges external research findings into the

## Imports

- imports:: [[Files/indexer__karpathy-wiki]] `../indexer/karpathy-wiki.js`
- imports:: [[Files/grpc__embedding-client]] `../grpc/embedding-client.js`
- imports:: [[Files/vector__qdrant-manager]] `../vector/qdrant-manager.js`
- imports:: [[Files/neo4j-driver]] `../neo4j-driver.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```