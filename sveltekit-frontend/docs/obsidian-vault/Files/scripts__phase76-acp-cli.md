---
type: "file"
path: "scripts/phase76-acp-cli.mjs"
aliases: ["phase76-acp-cli.mjs","scripts/phase76-acp-cli.mjs"]
clusterId: -1
ext: ".mjs"
lineCount: 917
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/scripts/phase76-acp-cli.mjs"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/mjs","zod","t/mjs","t/scripts","t/phase76-acp-cli_mjs"]
---

# `scripts/phase76-acp-cli.mjs`
## For future Claude
> phase76-acp-cli.mjs — MCP/ACP Tool CLI Tester
pagerank:: 0.000000
blend:: 0.000000
lines:: 917
## Summary

phase76-acp-cli.mjs — MCP/ACP Tool CLI Tester

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```