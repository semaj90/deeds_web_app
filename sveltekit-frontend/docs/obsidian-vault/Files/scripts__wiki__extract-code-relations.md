---
type: "file"
path: "scripts/wiki/extract-code-relations.mjs"
aliases: ["extract-code-relations.mjs","scripts/wiki/extract-code-relations.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 523
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/scripts/wiki/extract-code-relations.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","t/mjs","t/scripts","t/wiki"]
---

# `scripts/wiki/extract-code-relations.mjs`
## For future Claude
> P5 — Codebase Relationship Mapper
pagerank:: 0.000000
blend:: 0.000000
lines:: 523
## Summary

P5 — Codebase Relationship Mapper

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```