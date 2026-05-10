---
type: "file"
path: "src/routes/api/contextual/chat/+server.ts"
aliases: ["+server.ts","src/routes/api/contextual/chat/+server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 438
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 10
embedding_id: "qdrant://codebase_chunks_768/src/routes/api/contextual/chat/+server.ts"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/api/contextual/chat/+server.ts`
## For future Claude
> Pre-assembled ACE context text from selected evidence/notes (checkbox panel)
pagerank:: 0.000000
blend:: 0.000000
lines:: 438
## Summary

Pre-assembled ACE context text from selected evidence/notes (checkbox panel)

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```