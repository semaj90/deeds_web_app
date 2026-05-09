---
type: "file"
path: "src/lib/server/observability/inference-log.ts"
aliases: ["inference-log.ts","src/lib/server/observability/inference-log.ts"]
clusterId: 59
ext: ".ts"
lineCount: 273
pagerank: 0.241103
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/observability/inference-log.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-59]]"]
imports: ["[[Files/langfuse]]"]
tags: ["file","ext/ts","cluster/59","t/ts","t/src","t/lib"]
---

# `src/lib/server/observability/inference-log.ts`
## For future Claude
> CouchDB Inference Log (P5B)
cluster:: [[Clusters/cluster-59]]
pagerank:: 0.241103
blend:: 0.000000
lines:: 273
## Summary

CouchDB Inference Log (P5B)

## Imports

- imports:: [[Files/langfuse]] `./langfuse.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```