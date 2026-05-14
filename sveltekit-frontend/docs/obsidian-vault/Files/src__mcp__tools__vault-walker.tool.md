---
type: "file"
path: "src/mcp/tools/vault-walker.tool.ts"
aliases: ["vault-walker.tool.ts","src/mcp/tools/vault-walker.tool.ts"]
clusterId: -1
ext: ".ts"
lineCount: 663
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/mcp/tools/vault-walker.tool.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","zod","t/ts","t/src","t/mcp"]
---

# `src/mcp/tools/vault-walker.tool.ts`
## For future Claude
> vault-walker.tool.ts — read-only MCP tools for the Obsidian codebase vault.
pagerank:: 0.000000
blend:: 0.000000
lines:: 663
## Summary

vault-walker.tool.ts — read-only MCP tools for the Obsidian codebase vault.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```