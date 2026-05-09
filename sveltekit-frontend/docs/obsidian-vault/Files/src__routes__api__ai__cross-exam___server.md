---
type: "file"
path: "src/routes/api/ai/cross-exam/+server.ts"
aliases: ["+server.ts","src/routes/api/ai/cross-exam/+server.ts"]
clusterId: 44
ext: ".ts"
lineCount: 113
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/ai/cross-exam/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-44]]"]
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","cluster/44","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/api/ai/cross-exam/+server.ts`
## For future Claude
> GBNF-constrained response schema for cross-examination
cluster:: [[Clusters/cluster-44]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 113
## Summary

GBNF-constrained response schema for cross-examination

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```