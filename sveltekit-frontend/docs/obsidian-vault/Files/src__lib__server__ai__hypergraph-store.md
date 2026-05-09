---
type: "file"
path: "src/lib/server/ai/hypergraph-store.ts"
aliases: ["hypergraph-store.ts","src/lib/server/ai/hypergraph-store.ts"]
clusterId: 19
ext: ".ts"
lineCount: 272
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ai/hypergraph-store.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-19]]"]
imports: ["[[Files/neo4j-driver]]","[[Files/db__client]]","[[Files/ollama]]","[[Files/db__schema]]"]
tags: ["file","ext/ts","cluster/19","t/ts","t/src","t/lib"]
---

# `src/lib/server/ai/hypergraph-store.ts`
## For future Claude
> hypergraph-store.ts — Unified "Lane 1" storage for interactive agent sessions.
cluster:: [[Clusters/cluster-19]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 272
## Summary

hypergraph-store.ts — Unified "Lane 1" storage for interactive agent sessions.

## Imports

- imports:: [[Files/neo4j-driver]] `../neo4j-driver.js`
- imports:: [[Files/db__client]] `../db/client.js`
- imports:: [[Files/ollama]] `../ollama.js`
- imports:: [[Files/db__schema]] `../db/schema.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```