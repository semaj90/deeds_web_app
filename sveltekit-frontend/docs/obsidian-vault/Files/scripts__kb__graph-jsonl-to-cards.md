---
type: "file"
path: "scripts/kb/graph-jsonl-to-cards.mjs"
aliases: ["graph-jsonl-to-cards.mjs","scripts/kb/graph-jsonl-to-cards.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 502
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/scripts/kb/graph-jsonl-to-cards.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/mjs","zod","t/mjs","t/scripts","t/kb"]
---

# `scripts/kb/graph-jsonl-to-cards.mjs`
## For future Claude
> .mjs at scripts/kb/graph-jsonl-to-cards.mjs (502 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 502
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```