---
type: "file"
path: "src/routes/(app)/evidence/upload/+page.server.ts"
aliases: ["+page.server.ts","src/routes/(app)/evidence/upload/+page.server.ts"]
clusterId: 29
ext: ".ts"
lineCount: 379
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 12
embedding_id: "qdrant://codebase_chunks_768/src/routes/(app)/evidence/upload/+page.server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-29]]"]
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","cluster/29","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/(app)/evidence/upload/+page.server.ts`
## For future Claude
> Evidence Upload Server Actions
cluster:: [[Clusters/cluster-29]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 379
## Summary

Evidence Upload Server Actions

## Imports

- imports:: [[Files/_types]] `./$types.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```