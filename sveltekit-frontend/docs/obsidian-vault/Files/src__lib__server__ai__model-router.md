---
type: "file"
path: "src/lib/server/ai/model-router.ts"
aliases: ["model-router.ts","src/lib/server/ai/model-router.ts"]
clusterId: 19
ext: ".ts"
lineCount: 149
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ai/model-router.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-19]]"]
imports: ["[[Files/model-loader]]"]
tags: ["file","ext/ts","cluster/19","t/ts","t/src","t/lib"]
---

# `src/lib/server/ai/model-router.ts`
## For future Claude
> Model Router — pure routing decision for a given query.
cluster:: [[Clusters/cluster-19]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 149
## Summary

Model Router — pure routing decision for a given query.

## Imports

- imports:: [[Files/model-loader]] `./model-loader.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```