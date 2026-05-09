---
type: "file"
path: "src/lib/server/db/schema/legal-chunks.ts"
aliases: ["legal-chunks.ts","src/lib/server/db/schema/legal-chunks.ts"]
clusterId: 95
ext: ".ts"
lineCount: 33
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/schema/legal-chunks.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-95]]"]
imports: ["[[Files/legal-nodes]]"]
tags: ["file","ext/ts","cluster/95","t/ts","t/src","t/lib"]
---

# `src/lib/server/db/schema/legal-chunks.ts`
## For future Claude
> Legal chunks — one or more chunks per legal node.
cluster:: [[Clusters/cluster-95]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 33
## Summary

Legal chunks — one or more chunks per legal node.

## Imports

- imports:: [[Files/legal-nodes]] `./legal-nodes`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```