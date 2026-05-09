---
type: "file"
path: "src/routes/(app)/library/[documentId]/node/[nodeId]/+page.server.ts"
aliases: ["+page.server.ts","src/routes/(app)/library/[documentId]/node/[nodeId]/+page.server.ts"]
clusterId: 8
ext: ".ts"
lineCount: 217
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/routes/(app)/library/[documentId]/node/[nodeId]/+page.server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-8]]"]
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","cluster/8","route","auth","t/ts","t/src","t/routes"]
---

# `src/routes/(app)/library/[documentId]/node/[nodeId]/+page.server.ts`
## For future Claude
> Extract citation-like references from text using common legal patterns
cluster:: [[Clusters/cluster-8]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 217
## Summary

Extract citation-like references from text using common legal patterns

## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```