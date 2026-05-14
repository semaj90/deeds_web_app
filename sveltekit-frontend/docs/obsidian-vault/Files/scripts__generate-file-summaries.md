---
type: "file"
path: "scripts/generate-file-summaries.mjs"
aliases: ["generate-file-summaries.mjs","scripts/generate-file-summaries.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 481
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 7
embedding_id: "qdrant://codebase_chunks_768/scripts/generate-file-summaries.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/lib__progress]]"]
tags: ["file","ext/mjs","zod","t/mjs","t/scripts","t/generate-file-summaries_mjs"]
---

# `scripts/generate-file-summaries.mjs`
## For future Claude
> generate-file-summaries.mjs
pagerank:: 0.000000
blend:: 0.000000
lines:: 481
## Summary

generate-file-summaries.mjs

## Imports

- imports:: [[Files/lib__progress]] `./lib/progress.mjs`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```