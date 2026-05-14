---
type: "file"
path: "scripts/phase104-backups/src/lib/services/ollama-service.ts"
aliases: ["ollama-service.ts","scripts/phase104-backups/src/lib/services/ollama-service.ts"]
clusterId: -1
ext: ".ts"
lineCount: 576
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/scripts/phase104-backups/src/lib/services/ollama-service.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/config__local-llm]]"]
tags: ["file","ext/ts","zod","t/ts","t/scripts","t/phase104-backups"]
---

# `scripts/phase104-backups/src/lib/services/ollama-service.ts`
## For future Claude
> .ts at scripts/phase104-backups/src/lib/services/ollama-service.ts (576 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 576
## Imports

- imports:: [[Files/config__local-llm]] `../config/local-llm.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```