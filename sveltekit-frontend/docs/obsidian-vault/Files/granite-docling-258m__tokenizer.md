---
type: "file"
path: "granite-docling-258M/tokenizer.json"
aliases: ["tokenizer.json","granite-docling-258M/tokenizer.json"]
clusterId: -1
ext: ".json"
lineCount: 501256
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/granite-docling-258M/tokenizer.json"
last_updated_by_llm: "2026-05-23T02:58:14.645Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/json","t/json"]
---

# `granite-docling-258M/tokenizer.json`
## For future Claude
> JSON data file
pagerank:: 0.000000
blend:: 0.000000
lines:: 501256
## Summary

JSON data file

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```