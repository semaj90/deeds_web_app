---
type: "file"
path: "sveltekit-frontend/memory/kb/notecards/graph_file_cards.rank.json"
aliases: ["graph_file_cards.rank.json","sveltekit-frontend/memory/kb/notecards/graph_file_cards.rank.json"]
clusterId: -1
ext: ".json"
lineCount: 1218263
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/sveltekit-frontend/memory/kb/notecards/graph_file_cards.rank.json"
last_updated_by_llm: "2026-05-20T21:32:13.151Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/json","t/json"]
---

# `sveltekit-frontend/memory/kb/notecards/graph_file_cards.rank.json`
## For future Claude
> JSON data file
pagerank:: 0.000000
blend:: 0.000000
lines:: 1218263
## Summary

JSON data file

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```