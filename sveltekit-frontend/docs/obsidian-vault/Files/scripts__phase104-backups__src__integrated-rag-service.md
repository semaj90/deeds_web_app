---
type: "file"
path: "scripts/phase104-backups/src/integrated-rag-service.ts"
aliases: ["integrated-rag-service.ts","scripts/phase104-backups/src/integrated-rag-service.ts"]
clusterId: -1
ext: ".ts"
lineCount: 863
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 8
embedding_id: "qdrant://codebase_chunks_768/scripts/phase104-backups/src/integrated-rag-service.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","zod","t/ts","t/scripts","t/phase104-backups"]
---

# `scripts/phase104-backups/src/integrated-rag-service.ts`
## For future Claude
> import Fuse from 'fuse.js';
pagerank:: 0.000000
blend:: 0.000000
lines:: 863
## Summary

import Fuse from 'fuse.js';

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```