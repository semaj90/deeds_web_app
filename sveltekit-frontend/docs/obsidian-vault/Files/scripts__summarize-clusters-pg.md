---
type: "file"
path: "scripts/summarize-clusters-pg.ts"
aliases: ["summarize-clusters-pg.ts","scripts/summarize-clusters-pg.ts"]
clusterId: -1
ext: ".ts"
lineCount: 606
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/scripts/summarize-clusters-pg.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","zod","t/ts","t/scripts","t/summarize-clusters-pg_ts"]
---

# `scripts/summarize-clusters-pg.ts`
## For future Claude
> summarize-clusters-pg.ts — Gemma4 cluster summaries with agentic tool calling.
pagerank:: 0.000000
blend:: 0.000000
lines:: 606
## Summary

summarize-clusters-pg.ts — Gemma4 cluster summaries with agentic tool calling.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```