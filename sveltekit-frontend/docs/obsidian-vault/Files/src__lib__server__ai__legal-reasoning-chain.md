---
type: "file"
path: "src/lib/server/ai/legal-reasoning-chain.ts"
aliases: ["legal-reasoning-chain.ts","src/lib/server/ai/legal-reasoning-chain.ts"]
clusterId: 19
ext: ".ts"
lineCount: 195
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ai/legal-reasoning-chain.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-19]]"]
imports: []
tags: ["file","ext/ts","cluster/19","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/ai/legal-reasoning-chain.ts`
## For future Claude
> Legal Reasoning Chain — 4-Step Sequential Analysis
cluster:: [[Clusters/cluster-19]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 195
## Summary

Legal Reasoning Chain — 4-Step Sequential Analysis

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```