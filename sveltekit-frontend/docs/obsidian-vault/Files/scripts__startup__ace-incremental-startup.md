---
type: "file"
path: "scripts/startup/ace-incremental-startup.mjs"
aliases: ["ace-incremental-startup.mjs","scripts/startup/ace-incremental-startup.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 448
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/scripts/startup/ace-incremental-startup.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","zod","t/mjs","t/scripts","t/startup"]
---

# `scripts/startup/ace-incremental-startup.mjs`
## For future Claude
> ace-incremental-startup.mjs
pagerank:: 0.000000
blend:: 0.000000
lines:: 448
## Summary

ace-incremental-startup.mjs

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```