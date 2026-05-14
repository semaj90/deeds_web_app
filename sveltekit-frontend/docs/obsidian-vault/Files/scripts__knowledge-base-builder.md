---
type: "file"
path: "scripts/knowledge-base-builder.ts"
aliases: ["knowledge-base-builder.ts","scripts/knowledge-base-builder.ts"]
clusterId: -1
ext: ".ts"
lineCount: 708
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 7
embedding_id: "qdrant://codebase_chunks_768/scripts/knowledge-base-builder.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/src__lib__server__vector__bm42-sparse]]"]
tags: ["file","ext/ts","t/ts","t/scripts","t/knowledge-base-builder_ts"]
---

# `scripts/knowledge-base-builder.ts`
## For future Claude
> .ts at scripts/knowledge-base-builder.ts (708 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 708
## Imports

- imports:: [[Files/src__lib__server__vector__bm42-sparse]] `../src/lib/server/vector/bm42-sparse.ts`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```