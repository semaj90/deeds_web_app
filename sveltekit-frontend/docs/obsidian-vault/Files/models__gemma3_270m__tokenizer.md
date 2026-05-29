---
type: "file"
path: "models/gemma3_270m/tokenizer.json"
aliases: ["tokenizer.json","models/gemma3_270m/tokenizer.json"]
clusterId: -1
ext: ".json"
lineCount: 2379611
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/models/gemma3_270m/tokenizer.json"
last_updated_by_llm: "2026-05-29T15:41:25.015Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/json","t/json"]
---

# `models/gemma3_270m/tokenizer.json`
## For future Claude
> JSON data file
pagerank:: 0.000000
blend:: 0.000000
lines:: 2379611
## Summary

JSON data file

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```