---
type: "file"
path: "src/lib/server/ai/mcp-tool-dispatch.ts"
aliases: ["mcp-tool-dispatch.ts","src/lib/server/ai/mcp-tool-dispatch.ts"]
clusterId: -1
ext: ".ts"
lineCount: 477
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 9
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/ai/mcp-tool-dispatch.ts"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/ai/mcp-tool-dispatch.ts`
## For future Claude
> In-process MCP tool implementations for trace-mcp-server.ts.
pagerank:: 0.000000
blend:: 0.000000
lines:: 477
## Summary

In-process MCP tool implementations for trace-mcp-server.ts.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```