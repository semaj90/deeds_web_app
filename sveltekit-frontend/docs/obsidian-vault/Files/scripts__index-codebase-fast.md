---
type: "file"
path: "scripts/index-codebase-fast.mjs"
aliases: ["index-codebase-fast.mjs","scripts/index-codebase-fast.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 1324
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/scripts/index-codebase-fast.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","auth","zod","t/mjs","t/scripts","t/index-codebase-fast_mjs"]
---

# `scripts/index-codebase-fast.mjs`
## For future Claude
> Fast AST Codebase Indexer — 20-Gate Deep Audit
pagerank:: 0.000000
blend:: 0.000000
lines:: 1324
## Summary

Fast AST Codebase Indexer — 20-Gate Deep Audit

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```