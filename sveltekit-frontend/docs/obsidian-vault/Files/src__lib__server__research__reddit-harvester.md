---
type: "file"
path: "src/lib/server/research/reddit-harvester.ts"
aliases: ["reddit-harvester.ts","src/lib/server/research/reddit-harvester.ts"]
clusterId: 43
ext: ".ts"
lineCount: 181
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/research/reddit-harvester.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-43]]"]
imports: ["[[Files/web-research-ingester]]","[[Files/research-utils]]"]
tags: ["file","ext/ts","cluster/43","t/ts","t/src","t/lib"]
---

# `src/lib/server/research/reddit-harvester.ts`
## For future Claude
> reddit-harvester.ts — Lane 3 Research: Reddit keyword search ingestion
cluster:: [[Clusters/cluster-43]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 181
## Summary

reddit-harvester.ts — Lane 3 Research: Reddit keyword search ingestion

## Imports

- imports:: [[Files/web-research-ingester]] `./web-research-ingester.js`
- imports:: [[Files/research-utils]] `./research-utils.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```