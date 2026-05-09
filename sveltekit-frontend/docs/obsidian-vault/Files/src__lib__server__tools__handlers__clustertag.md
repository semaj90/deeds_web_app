---
type: "file"
path: "src/lib/server/tools/handlers/clusterTag.ts"
aliases: ["clusterTag.ts","src/lib/server/tools/handlers/clusterTag.ts"]
clusterId: 70
ext: ".ts"
lineCount: 147
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/tools/handlers/clusterTag.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-70]]"]
imports: ["[[Files/registry]]"]
tags: ["file","ext/ts","cluster/70","t/ts","t/src","t/lib"]
---

# `src/lib/server/tools/handlers/clusterTag.ts`
## For future Claude
> cluster_tag Tool Handler
cluster:: [[Clusters/cluster-70]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 147
## Summary

cluster_tag Tool Handler

## Imports

- imports:: [[Files/registry]] `../registry.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```