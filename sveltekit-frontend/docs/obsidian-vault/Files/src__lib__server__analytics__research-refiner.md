---
type: "file"
path: "src/lib/server/analytics/research-refiner.ts"
aliases: ["research-refiner.ts","src/lib/server/analytics/research-refiner.ts"]
clusterId: 60
ext: ".ts"
lineCount: 135
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/analytics/research-refiner.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-60]]"]
imports: ["[[Files/indexer__dual-embedder]]","[[Files/retrieval__triton-reranker]]","[[Files/ollama]]","[[Files/env]]","[[Files/deep-research]]"]
tags: ["file","ext/ts","cluster/60","t/ts","t/src","t/lib"]
---

# `src/lib/server/analytics/research-refiner.ts`
## For future Claude
> Autonomous Research Refiner
cluster:: [[Clusters/cluster-60]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 135
## Summary

Autonomous Research Refiner

## Imports

- imports:: [[Files/indexer__dual-embedder]] `../indexer/dual-embedder.js`
- imports:: [[Files/retrieval__triton-reranker]] `../retrieval/triton-reranker.js`
- imports:: [[Files/ollama]] `../ollama.js`
- imports:: [[Files/env]] `../env.server.js`
- imports:: [[Files/deep-research]] `./deep-research.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```