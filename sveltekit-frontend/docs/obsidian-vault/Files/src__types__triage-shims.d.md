---
type: "file"
path: "src/types/triage-shims.d.ts"
aliases: ["triage-shims.d.ts","src/types/triage-shims.d.ts"]
clusterId: -1
ext: ".ts"
lineCount: 60
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/types/triage-shims.d.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","t/ts","t/src","t/types"]
---

# `src/types/triage-shims.d.ts`
## For future Claude
> Minimal triage shims for local typechecking during Phase H integration.
pagerank:: 0.000000
blend:: 0.000000
lines:: 60
## Summary

Minimal triage shims for local typechecking during Phase H integration.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```