---
type: "file"
path: "scripts/codebase-semantic-indexer.ts"
aliases: ["codebase-semantic-indexer.ts","scripts/codebase-semantic-indexer.ts"]
clusterId: -1
ext: ".ts"
lineCount: 553
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/scripts/codebase-semantic-indexer.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","zod","t/ts","t/scripts","t/codebase-semantic-indexer_ts"]
---

# `scripts/codebase-semantic-indexer.ts`
## For future Claude
> Codebase Semantic Indexer — Qdrant + Ollama + Redis
pagerank:: 0.000000
blend:: 0.000000
lines:: 553
## Summary

Codebase Semantic Indexer — Qdrant + Ollama + Redis

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```