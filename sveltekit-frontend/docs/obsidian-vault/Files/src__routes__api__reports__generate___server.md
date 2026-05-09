---
type: "file"
path: "src/routes/api/reports/generate/+server.ts"
aliases: ["+server.ts","src/routes/api/reports/generate/+server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 387
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 11
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/reports/generate/+server.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/api/reports/generate/+server.ts`
## For future Claude
> Try Ollama AI generation, fall back to template if unavailable
pagerank:: 0.000000
blend:: 0.000000
lines:: 387
## Summary

Try Ollama AI generation, fall back to template if unavailable

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```