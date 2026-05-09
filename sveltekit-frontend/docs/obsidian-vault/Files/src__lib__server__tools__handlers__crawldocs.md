---
type: "file"
path: "src/lib/server/tools/handlers/crawlDocs.ts"
aliases: ["crawlDocs.ts","src/lib/server/tools/handlers/crawlDocs.ts"]
clusterId: 70
ext: ".ts"
lineCount: 208
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/tools/handlers/crawlDocs.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-70]]"]
imports: ["[[Files/registry]]"]
tags: ["file","ext/ts","cluster/70","t/ts","t/src","t/lib"]
---

# `src/lib/server/tools/handlers/crawlDocs.ts`
## For future Claude
> crawl_docs Tool Handler
cluster:: [[Clusters/cluster-70]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 208
## Summary

crawl_docs Tool Handler

## Imports

- imports:: [[Files/registry]] `../registry.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```