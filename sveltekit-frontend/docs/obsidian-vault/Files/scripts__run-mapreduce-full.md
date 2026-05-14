---
type: "file"
path: "scripts/run-mapreduce-full.mjs"
aliases: ["run-mapreduce-full.mjs","scripts/run-mapreduce-full.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 494
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 10
embedding_id: "qdrant://codebase_chunks_768/scripts/run-mapreduce-full.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/mapreduce__reduce-neo4j]]"]
tags: ["file","ext/mjs","t/mjs","t/scripts","t/run-mapreduce-full_mjs"]
---

# `scripts/run-mapreduce-full.mjs`
## For future Claude
> run-mapreduce-full.mjs
pagerank:: 0.000000
blend:: 0.000000
lines:: 494
## Summary

run-mapreduce-full.mjs

## Imports

- imports:: [[Files/mapreduce__reduce-neo4j]] `./mapreduce/reduce-neo4j.mjs`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```