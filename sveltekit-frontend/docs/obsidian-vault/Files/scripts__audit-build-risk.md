---
type: "file"
path: "scripts/audit-build-risk.ts"
aliases: ["audit-build-risk.ts","scripts/audit-build-risk.ts"]
clusterId: -1
ext: ".ts"
lineCount: 570
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/scripts/audit-build-risk.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","t/ts","t/scripts","t/audit-build-risk_ts"]
---

# `scripts/audit-build-risk.ts`
## For future Claude
> Pre-build audit: catches chunk collisions, risky imports, missing files,
pagerank:: 0.000000
blend:: 0.000000
lines:: 570
## Summary

Pre-build audit: catches chunk collisions, risky imports, missing files,

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```