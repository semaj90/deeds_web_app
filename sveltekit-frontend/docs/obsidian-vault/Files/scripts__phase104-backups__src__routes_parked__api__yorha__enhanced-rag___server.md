---
type: "file"
path: "scripts/phase104-backups/src/routes_parked/api/yorha/enhanced-rag/+server.ts"
aliases: ["+server.ts","scripts/phase104-backups/src/routes_parked/api/yorha/enhanced-rag/+server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 742
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 7
embedding_id: "qdrant://codebase_chunks_768/scripts/phase104-backups/src/routes_parked/api/yorha/enhanced-rag/+server.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","t/ts","t/scripts","t/phase104-backups"]
---

# `scripts/phase104-backups/src/routes_parked/api/yorha/enhanced-rag/+server.ts`
## For future Claude
> Process images/documents with VLM using gemma3-vision, latest
pagerank:: 0.000000
blend:: 0.000000
lines:: 742
## Summary

Process images/documents with VLM using gemma3-vision, latest

## Imports

- imports:: [[Files/_types]] `./$types.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```