---
type: "file"
path: "src/routes/.well-known/llms.txt/+server.ts"
aliases: ["+server.ts","src/routes/.well-known/llms.txt/+server.ts"]
clusterId: -1
ext: ".ts"
lineCount: 262
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/routes/.well-known/llms.txt/+server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","route","zod","t/ts","t/src","t/routes"]
---

# `src/routes/.well-known/llms.txt/+server.ts`
## For future Claude
> GET /.well-known/llms.txt  (and alias /llms.txt via SvelteKit rewrite)
pagerank:: 0.000000
blend:: 0.000000
lines:: 262
## Summary

GET /.well-known/llms.txt  (and alias /llms.txt via SvelteKit rewrite)

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```