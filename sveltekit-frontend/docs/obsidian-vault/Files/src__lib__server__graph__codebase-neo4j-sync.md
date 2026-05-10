---
type: "file"
path: "src/lib/server/graph/codebase-neo4j-sync.ts"
aliases: ["codebase-neo4j-sync.ts","src/lib/server/graph/codebase-neo4j-sync.ts"]
clusterId: 73
ext: ".ts"
lineCount: 425
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 9
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/graph/codebase-neo4j-sync.ts"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-73]]"]
imports: ["[[Files/neo4j-schema]]","[[Files/codebase-scanner-v2]]","[[Files/codebase-scanner]]","[[Files/couchdb-pagerank]]","[[Files/relationship-extractor]]","[[Files/codebase-scanner-v2]]","[[Files/codebase-scanner]]"]
tags: ["file","ext/ts","cluster/73","t/ts","t/src","t/lib"]
---

# `src/lib/server/graph/codebase-neo4j-sync.ts`
## For future Claude
> Codebase → Neo4j Sync
cluster:: [[Clusters/cluster-73]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 425
## Summary

Codebase → Neo4j Sync

## Imports

- imports:: [[Files/neo4j-schema]] `./neo4j-schema.js`
- imports:: [[Files/codebase-scanner-v2]] `./codebase-scanner-v2.js`
- imports:: [[Files/codebase-scanner]] `./codebase-scanner.js`
- imports:: [[Files/couchdb-pagerank]] `./couchdb-pagerank.js`
- imports:: [[Files/relationship-extractor]] `./relationship-extractor.js`
- imports:: [[Files/codebase-scanner-v2]] `./codebase-scanner-v2.js`
- imports:: [[Files/codebase-scanner]] `./codebase-scanner.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```