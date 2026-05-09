---
type: "file"
path: "src/lib/server/helpers/service-discovery.ts"
aliases: ["service-discovery.ts","src/lib/server/helpers/service-discovery.ts"]
clusterId: 6
ext: ".ts"
lineCount: 141
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/helpers/service-discovery.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/docker-discovery]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/helpers/service-discovery.ts`
## For future Claude
> Service Discovery & Configuration
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 141
## Summary

Service Discovery & Configuration

## Imports

- imports:: [[Files/docker-discovery]] `./docker-discovery.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```