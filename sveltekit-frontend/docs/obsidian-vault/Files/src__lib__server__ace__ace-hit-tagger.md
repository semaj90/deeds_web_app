---
type: "file"
path: "src/lib/server/ace/ace-hit-tagger.ts"
aliases: ["ace-hit-tagger.ts","src/lib/server/ace/ace-hit-tagger.ts"]
clusterId: 6
ext: ".ts"
lineCount: 160
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ace/ace-hit-tagger.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: ["[[Files/types]]"]
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/ace/ace-hit-tagger.ts`
## For future Claude
> ACE Hit Tagger — marks Qdrant codebase chunks that are selected by ACE synthesis.
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 160
## Summary

ACE Hit Tagger — marks Qdrant codebase chunks that are selected by ACE synthesis.

## Imports

- imports:: [[Files/types]] `./types.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```