---
type: "file"
path: "src/lib/server/hypergraph/hypergraph-builder.ts"
aliases: ["hypergraph-builder.ts","src/lib/server/hypergraph/hypergraph-builder.ts"]
clusterId: 6
ext: ".ts"
lineCount: 221
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/hypergraph/hypergraph-builder.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/hypergraph-types]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/hypergraph/hypergraph-builder.ts`
## For future Claude
> .ts at src/lib/server/hypergraph/hypergraph-builder.ts (221 lines).
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 221
## Imports

- imports:: [[Files/hypergraph-types]] `./hypergraph-types.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```