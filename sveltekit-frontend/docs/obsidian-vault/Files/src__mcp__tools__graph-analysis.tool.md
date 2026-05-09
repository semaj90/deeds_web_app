---
type: "file"
path: "src/mcp/tools/graph-analysis.tool.ts"
aliases: ["graph-analysis.tool.ts","src/mcp/tools/graph-analysis.tool.ts"]
clusterId: -1
ext: ".ts"
lineCount: 97
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/mcp/tools/graph-analysis.tool.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/ts","zod","t/ts","t/src","t/mcp"]
---

# `src/mcp/tools/graph-analysis.tool.ts`
## For future Claude
> .ts at src/mcp/tools/graph-analysis.tool.ts (97 lines).
pagerank:: 0.000000
blend:: 0.000000
lines:: 97
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```