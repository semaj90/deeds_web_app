---
type: "file"
path: "src/lib/server/ff1/audit/diagnostic-collector.ts"
aliases: ["diagnostic-collector.ts","src/lib/server/ff1/audit/diagnostic-collector.ts"]
clusterId: 6
ext: ".ts"
lineCount: 236
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ff1/audit/diagnostic-collector.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/graph__graph-schema]]","[[Files/graph__graph-schema]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/ff1/audit/diagnostic-collector.ts`
## For future Claude
> FF1 Diagnostic Collector
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 236
## Summary

FF1 Diagnostic Collector

## Imports

- imports:: [[Files/graph__graph-schema]] `../graph/graph-schema.js`
- imports:: [[Files/graph__graph-schema]] `../graph/graph-schema.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```