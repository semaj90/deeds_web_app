---
type: "file"
path: "scripts/skills/codebase-todo-aggregator.mjs"
aliases: ["codebase-todo-aggregator.mjs","scripts/skills/codebase-todo-aggregator.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 510
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/scripts/skills/codebase-todo-aggregator.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","zod","t/mjs","t/scripts","t/skills"]
---

# `scripts/skills/codebase-todo-aggregator.mjs`
## For future Claude
> codebase-todo-aggregator.mjs
pagerank:: 0.000000
blend:: 0.000000
lines:: 510
## Summary

codebase-todo-aggregator.mjs

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```