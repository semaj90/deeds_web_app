---
type: "file"
path: "src/mcp/trace-mcp-server.ts"
aliases: ["trace-mcp-server.ts","src/mcp/trace-mcp-server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 3491
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 20
embedding_id: "qdrant://codebase_chunks_768/src/mcp/trace-mcp-server.ts"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/new_tools]]","[[Files/admin_tools]]","[[Files/skill_tools]]","[[Files/codebase_tools]]","[[Files/research_tools]]","[[Files/lib__server__kb__search-logic]]","[[Files/bifrost_tools]]","[[Files/topology_mgmt_tools]]","[[Files/db-inspection-tools]]"]
tags: ["file","ext/ts","zod","t/ts","t/src","t/mcp"]
---

# `src/mcp/trace-mcp-server.ts`
## For future Claude
> trace-mcp-server.ts
pagerank:: 0.000000
blend:: 0.000000
lines:: 3491
## Summary

trace-mcp-server.ts

## Imports

- imports:: [[Files/new_tools]] `./new_tools.js`
- imports:: [[Files/admin_tools]] `./admin_tools.js`
- imports:: [[Files/skill_tools]] `./skill_tools.js`
- imports:: [[Files/codebase_tools]] `./codebase_tools.js`
- imports:: [[Files/research_tools]] `./research_tools.js`
- imports:: [[Files/lib__server__kb__search-logic]] `../lib/server/kb/search-logic.js`
- imports:: [[Files/bifrost_tools]] `./bifrost_tools.js`
- imports:: [[Files/topology_mgmt_tools]] `./topology_mgmt_tools.js`
- imports:: [[Files/db-inspection-tools]] `./db-inspection-tools.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```