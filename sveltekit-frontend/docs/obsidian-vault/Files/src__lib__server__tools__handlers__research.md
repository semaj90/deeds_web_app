---
type: "file"
path: "src/lib/server/tools/handlers/research.ts"
aliases: ["research.ts","src/lib/server/tools/handlers/research.ts"]
clusterId: 70
ext: ".ts"
lineCount: 59
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/tools/handlers/research.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-70]]"]
imports: ["[[Files/..__research__github-search]]","[[Files/..__research__reddit-search]]","[[Files/.]]","[[Files/..__research__store-web-doc]]","[[Files/..__env]]"]
tags: ["file","ext/ts","cluster/70","t/ts","t/src","t/lib"]
---

# `src/lib/server/tools/handlers/research.ts`
## For future Claude
> Lane 3 Deep Research — convenience handlers.
cluster:: [[Clusters/cluster-70]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 59
## Summary

Lane 3 Deep Research — convenience handlers.

## Imports

- imports:: [[Files/..__research__github-search]] `../../research/github-search.js`
- imports:: [[Files/..__research__reddit-search]] `../../research/reddit-search.js`
- imports:: [[Files/.]] `../../research/fastcrawl.js`
- imports:: [[Files/..__research__store-web-doc]] `../../research/store-web-doc.js`
- imports:: [[Files/..__env]] `../../env.server.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```