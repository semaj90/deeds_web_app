---
type: "file"
path: "src/lib/ai/e2b/inference.ts"
aliases: ["inference.ts","src/lib/ai/e2b/inference.ts"]
clusterId: 14
ext: ".ts"
lineCount: 213
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/ai/e2b/inference.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-14]]"]
imports: ["[[Files/session]]"]
tags: ["file","ext/ts","cluster/14","t/ts","t/src","t/lib"]
---

# `src/lib/ai/e2b/inference.ts`
## For future Claude
> Gemma 4 E2B Inference — Transformers.js Wrapper
cluster:: [[Clusters/cluster-14]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 213
## Summary

Gemma 4 E2B Inference — Transformers.js Wrapper

## Imports

- imports:: [[Files/session]] `./session.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```