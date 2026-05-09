---
type: "file"
path: "src/lib/server/agent/tools/web-search.ts"
aliases: ["web-search.ts","src/lib/server/agent/tools/web-search.ts"]
clusterId: 6
ext: ".ts"
lineCount: 274
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/agent/tools/web-search.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: []
tags: ["file","ext/ts","cluster/6","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/agent/tools/web-search.ts`
## For future Claude
> Web Search Tool - Simple Implementation
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 274
## Summary

Web Search Tool - Simple Implementation

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```