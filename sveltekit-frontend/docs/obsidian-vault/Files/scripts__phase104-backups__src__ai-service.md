---
type: "file"
path: "scripts/phase104-backups/src/ai-service.ts"
aliases: ["ai-service.ts","scripts/phase104-backups/src/ai-service.ts"]
clusterId: -1
ext: ".ts"
lineCount: 529
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 7
embedding_id: "qdrant://codebase_chunks_768/scripts/phase104-backups/src/ai-service.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/db__schema-postgres]]","[[Files/db__schema-postgres]]","[[Files/database__index]]"]
tags: ["file","ext/ts","zod","t/ts","t/scripts","t/phase104-backups"]
---

# `scripts/phase104-backups/src/ai-service.ts`
## For future Claude
> Minimal local type for the Ollama client shape we expect
pagerank:: 0.000000
blend:: 0.000000
lines:: 529
## Summary

Minimal local type for the Ollama client shape we expect

## Imports

- imports:: [[Files/db__schema-postgres]] `../db/schema-postgres.js`
- imports:: [[Files/db__schema-postgres]] `../db/schema-postgres.js`
- imports:: [[Files/database__index]] `../database/index.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```