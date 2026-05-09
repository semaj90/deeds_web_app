---
type: "file"
path: "src/lib/server/embedding/embed-schema.ts"
aliases: ["embed-schema.ts","src/lib/server/embedding/embed-schema.ts"]
clusterId: 77
ext: ".ts"
lineCount: 268
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/embedding/embed-schema.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-77]]"]
imports: []
tags: ["file","ext/ts","cluster/77","t/ts","t/src","t/lib"]
---

# `src/lib/server/embedding/embed-schema.ts`
## For future Claude
> Embedding Schema — Qdrant payload, Redis cache keys, Neo4j relations, embed_text builder
cluster:: [[Clusters/cluster-77]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 268
## Summary

Embedding Schema — Qdrant payload, Redis cache keys, Neo4j relations, embed_text builder

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```