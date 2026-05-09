---
type: "file"
path: "src/lib/server/pdf/legalPacketGenerator.ts"
aliases: ["legalPacketGenerator.ts","src/lib/server/pdf/legalPacketGenerator.ts"]
clusterId: 21
ext: ".ts"
lineCount: 220
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/pdf/legalPacketGenerator.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-21]]"]
imports: []
tags: ["file","ext/ts","cluster/21","t/ts","t/src","t/lib"]
---

# `src/lib/server/pdf/legalPacketGenerator.ts`
## For future Claude
> Generate a comprehensive legal case packet PDF
cluster:: [[Clusters/cluster-21]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 220
## Summary

Generate a comprehensive legal case packet PDF

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```