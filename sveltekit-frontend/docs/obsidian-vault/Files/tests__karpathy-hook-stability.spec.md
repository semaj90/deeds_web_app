---
type: "file"
path: "tests/karpathy-hook-stability.spec.ts"
aliases: ["karpathy-hook-stability.spec.ts","tests/karpathy-hook-stability.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 59
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/tests/karpathy-hook-stability.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/src__lib__server__indexer__karpathy-hook]]"]
tags: ["file","ext/ts","test","t/ts","t/tests","t/karpathy-hook-stability_spec_ts"]
---

# `tests/karpathy-hook-stability.spec.ts`
## For future Claude
> .ts at tests/karpathy-hook-stability.spec.ts (59 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 59
## Imports

- imports:: [[Files/src__lib__server__indexer__karpathy-hook]] `../src/lib/server/indexer/karpathy-hook.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```