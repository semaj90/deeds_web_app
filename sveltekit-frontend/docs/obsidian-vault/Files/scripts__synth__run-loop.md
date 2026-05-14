---
type: "file"
path: "scripts/synth/run-loop.mjs"
aliases: ["run-loop.mjs","scripts/synth/run-loop.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 679
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/scripts/synth/run-loop.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","zod","t/mjs","t/scripts","t/synth"]
---

# `scripts/synth/run-loop.mjs`
## For future Claude
> run-loop.mjs — Gemma4 ⇄ MCP synthesis loop (Phase C)
pagerank:: 0.000000
blend:: 0.000000
lines:: 679
## Summary

run-loop.mjs — Gemma4 ⇄ MCP synthesis loop (Phase C)

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```