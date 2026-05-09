---
type: "file"
path: "src/lib/ai/gemma4-e2b-client.ts"
aliases: ["gemma4-e2b-client.ts","src/lib/ai/gemma4-e2b-client.ts"]
clusterId: 14
ext: ".ts"
lineCount: 340
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/ai/gemma4-e2b-client.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-14]]"]
imports: ["[[Files/model-ids]]"]
tags: ["file","ext/ts","cluster/14","t/ts","t/src","t/lib"]
---

# `src/lib/ai/gemma4-e2b-client.ts`
## For future Claude
> Gemma 4 E2B Client — 2.3B text generation in-browser via Transformers.js v4.
cluster:: [[Clusters/cluster-14]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 340
## Summary

Gemma 4 E2B Client — 2.3B text generation in-browser via Transformers.js v4.

## Imports

- imports:: [[Files/model-ids]] `./model-ids.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```