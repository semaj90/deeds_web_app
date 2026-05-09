---
type: "file"
path: "src/lib/server/workers/document-embed-consumer.ts"
aliases: ["document-embed-consumer.ts","src/lib/server/workers/document-embed-consumer.ts"]
clusterId: 24
ext: ".ts"
lineCount: 247
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/workers/document-embed-consumer.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-24]]"]
imports: []
tags: ["file","ext/ts","cluster/24","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/workers/document-embed-consumer.ts`
## For future Claude
> Document Embedding Consumer
cluster:: [[Clusters/cluster-24]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 247
## Summary

Document Embedding Consumer

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```