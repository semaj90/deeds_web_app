---
type: "file"
path: "scripts/run-hypergraph.ts"
aliases: ["run-hypergraph.ts","scripts/run-hypergraph.ts"]
clusterId: -1
ext: ".ts"
lineCount: 703
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/scripts/run-hypergraph.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","zod","t/ts","t/scripts","t/run-hypergraph_ts"]
---

# `scripts/run-hypergraph.ts`
## For future Claude
> run-hypergraph.ts — Standalone 4D hypergraph builder.
pagerank:: 0.000000
blend:: 0.000000
lines:: 703
## Summary

run-hypergraph.ts — Standalone 4D hypergraph builder.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```