---
type: "file"
path: "src/lib/server/ace/retrieval-lanes.ts"
aliases: ["retrieval-lanes.ts","src/lib/server/ace/retrieval-lanes.ts"]
clusterId: 6
ext: ".ts"
lineCount: 446
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ace/retrieval-lanes.ts"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/cache-keys]]"]
tags: ["file","ext/ts","cluster/6","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/ace/retrieval-lanes.ts`
## For future Claude
> .ts at src/lib/server/ace/retrieval-lanes.ts (446 lines).
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 446
## Imports

- imports:: [[Files/cache-keys]] `./cache-keys.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```