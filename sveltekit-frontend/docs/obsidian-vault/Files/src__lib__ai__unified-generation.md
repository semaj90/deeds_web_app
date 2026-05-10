---
type: "file"
path: "src/lib/ai/unified-generation.ts"
aliases: ["unified-generation.ts","src/lib/ai/unified-generation.ts"]
clusterId: 14
ext: ".ts"
lineCount: 435
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/ai/unified-generation.ts"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-14]]"]
imports: ["[[Files/client-router]]","[[Files/model-ids]]","[[Files/model-ids]]"]
tags: ["file","ext/ts","cluster/14","t/ts","t/src","t/lib"]
---

# `src/lib/ai/unified-generation.ts`
## For future Claude
> Unified Client-Side Generation — E2B → LiteRT → ONNX → Server Fallback
cluster:: [[Clusters/cluster-14]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 435
## Summary

Unified Client-Side Generation — E2B → LiteRT → ONNX → Server Fallback

## Imports

- imports:: [[Files/client-router]] `./client-router.js`
- imports:: [[Files/model-ids]] `./model-ids.js`
- imports:: [[Files/model-ids]] `./model-ids.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```