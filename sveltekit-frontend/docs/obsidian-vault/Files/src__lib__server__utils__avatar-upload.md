---
type: "file"
path: "src/lib/server/utils/avatar-upload.ts"
aliases: ["avatar-upload.ts","src/lib/server/utils/avatar-upload.ts"]
clusterId: 19
ext: ".ts"
lineCount: 319
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/utils/avatar-upload.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-19]]"]
imports: []
tags: ["file","ext/ts","cluster/19","t/ts","t/src","t/lib"]
---

# `src/lib/server/utils/avatar-upload.ts`
## For future Claude
> Minimal file-like interface for server-side file handling
cluster:: [[Clusters/cluster-19]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 319
## Summary

Minimal file-like interface for server-side file handling

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```