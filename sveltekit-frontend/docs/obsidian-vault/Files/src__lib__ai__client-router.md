---
type: "file"
path: "src/lib/ai/client-router.ts"
aliases: ["client-router.ts","src/lib/ai/client-router.ts"]
clusterId: 14
ext: ".ts"
lineCount: 506
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/ai/client-router.ts"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-14]]"]
imports: ["[[Files/model-ids]]","[[Files/model-ids]]"]
tags: ["file","ext/ts","cluster/14","t/ts","t/src","t/lib"]
---

# `src/lib/ai/client-router.ts`
## For future Claude
> Client Inference Router — 5-tier routing with Gemma 4 on-device inference.
cluster:: [[Clusters/cluster-14]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 506
## Summary

Client Inference Router — 5-tier routing with Gemma 4 on-device inference.

## Imports

- imports:: [[Files/model-ids]] `./model-ids.js`
- imports:: [[Files/model-ids]] `./model-ids.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```