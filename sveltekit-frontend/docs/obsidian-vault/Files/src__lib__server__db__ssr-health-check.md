---
type: "file"
path: "src/lib/server/db/ssr-health-check.ts"
aliases: ["ssr-health-check.ts","src/lib/server/db/ssr-health-check.ts"]
clusterId: 6
ext: ".ts"
lineCount: 178
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/db/ssr-health-check.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/connections]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/db/ssr-health-check.ts`
## For future Claude
> SSR Database Health Check Utility
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 178
## Summary

SSR Database Health Check Utility

## Imports

- imports:: [[Files/connections]] `./connections.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```