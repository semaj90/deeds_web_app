---
type: "file"
path: "scripts/phase104-backups/src/lib/server/keyword-extractor.ts"
aliases: ["keyword-extractor.ts","scripts/phase104-backups/src/lib/server/keyword-extractor.ts"]
clusterId: -1
ext: ".ts"
lineCount: 446
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/scripts/phase104-backups/src/lib/server/keyword-extractor.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/ollama-service]]"]
tags: ["file","ext/ts","zod","t/ts","t/scripts","t/phase104-backups"]
---

# `scripts/phase104-backups/src/lib/server/keyword-extractor.ts`
## For future Claude
> Keyword Extractor Module
pagerank:: 0.000000
blend:: 0.000000
lines:: 446
## Summary

Keyword Extractor Module

## Imports

- imports:: [[Files/ollama-service]] `./ollama-service.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```