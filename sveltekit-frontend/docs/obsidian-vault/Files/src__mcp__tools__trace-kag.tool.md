---
type: "file"
path: "src/mcp/tools/trace-kag.tool.ts"
aliases: ["trace-kag.tool.ts","src/mcp/tools/trace-kag.tool.ts"]
clusterId: -1
ext: ".ts"
lineCount: 165
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/mcp/tools/trace-kag.tool.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/ts","zod","t/ts","t/src","t/mcp"]
---

# `src/mcp/tools/trace-kag.tool.ts`
## For future Claude
> .ts at src/mcp/tools/trace-kag.tool.ts (165 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 165
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```