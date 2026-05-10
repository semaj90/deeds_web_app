---
type: "file"
path: "src/lib/server/indexer/karpathy-wiki.ts"
aliases: ["karpathy-wiki.ts","src/lib/server/indexer/karpathy-wiki.ts"]
clusterId: 60
ext: ".ts"
lineCount: 860
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/indexer/karpathy-wiki.ts"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-60]]"]
imports: []
tags: ["file","ext/ts","cluster/60","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/indexer/karpathy-wiki.ts`
## For future Claude
> Karpathy Wiki — Layer 3 Durable Memory
cluster:: [[Clusters/cluster-60]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 860
## Summary

Karpathy Wiki — Layer 3 Durable Memory

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```