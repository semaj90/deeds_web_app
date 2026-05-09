---
type: "file"
path: "src/lib/server/indexer/gpu-karpathy-tagger.ts"
aliases: ["gpu-karpathy-tagger.ts","src/lib/server/indexer/gpu-karpathy-tagger.ts"]
clusterId: 20
ext: ".ts"
lineCount: 273
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/indexer/gpu-karpathy-tagger.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-20]]"]
imports: []
tags: ["file","ext/ts","cluster/20","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/indexer/gpu-karpathy-tagger.ts`
## For future Claude
> GPU-Accelerated Karpathy Semantic Tagger
cluster:: [[Clusters/cluster-20]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 273
## Summary

GPU-Accelerated Karpathy Semantic Tagger

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```