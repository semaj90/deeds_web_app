---
type: "file"
path: "src/localDocs.svelte.ts"
aliases: ["localDocs.svelte.ts","src/localDocs.svelte.ts"]
clusterId: -1
ext: ".ts"
lineCount: 398
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/localDocs.svelte.ts"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","t/ts","t/src","t/localDocs_svelte_ts"]
---

# `src/localDocs.svelte.ts`
## For future Claude
> Phase 76: Local Legal Document Store (LokiJS)
pagerank:: 0.000000
blend:: 0.000000
lines:: 398
## Summary

Phase 76: Local Legal Document Store (LokiJS)

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```