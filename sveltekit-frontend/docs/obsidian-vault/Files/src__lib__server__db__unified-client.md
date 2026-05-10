---
type: "file"
path: "src/lib/server/db/unified-client.ts"
aliases: ["unified-client.ts","src/lib/server/db/unified-client.ts"]
clusterId: 6
ext: ".ts"
lineCount: 476
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 9
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/unified-client.ts"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/schema-unified]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/db/unified-client.ts`
## For future Claude
> Unified Database Client - Consolidation of Multiple Database Patterns
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 476
## Summary

Unified Database Client - Consolidation of Multiple Database Patterns

## Imports

- imports:: [[Files/schema-unified]] `./schema-unified.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```