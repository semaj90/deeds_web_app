---
type: "file"
path: "src/mcp/index.ts"
aliases: ["index.ts","src/mcp/index.ts"]
clusterId: -1
ext: ".ts"
lineCount: 465
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/mcp/index.ts"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/ts","t/ts","t/src","t/mcp"]
---

# `src/mcp/index.ts`
## For future Claude
> .ts at src/mcp/index.ts (465 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 465
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```