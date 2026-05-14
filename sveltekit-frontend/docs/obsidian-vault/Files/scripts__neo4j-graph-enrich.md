---
type: "file"
path: "scripts/neo4j-graph-enrich.mjs"
aliases: ["neo4j-graph-enrich.mjs","scripts/neo4j-graph-enrich.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 819
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 7
embedding_id: "qdrant://codebase_chunks_768/scripts/neo4j-graph-enrich.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","t/mjs","t/scripts","t/neo4j-graph-enrich_mjs"]
---

# `scripts/neo4j-graph-enrich.mjs`
## For future Claude
> neo4j-graph-enrich.mjs  (Phase D2)
pagerank:: 0.000000
blend:: 0.000000
lines:: 819
## Summary

neo4j-graph-enrich.mjs  (Phase D2)

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```