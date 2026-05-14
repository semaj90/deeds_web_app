---
type: "file"
path: "scripts/analyze-graph.mjs"
aliases: ["analyze-graph.mjs","scripts/analyze-graph.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 449
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/scripts/analyze-graph.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","zod","t/mjs","t/scripts","t/analyze-graph_mjs"]
---

# `scripts/analyze-graph.mjs`
## For future Claude
> analyze-graph.mjs
pagerank:: 0.000000
blend:: 0.000000
lines:: 449
## Summary

analyze-graph.mjs

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```