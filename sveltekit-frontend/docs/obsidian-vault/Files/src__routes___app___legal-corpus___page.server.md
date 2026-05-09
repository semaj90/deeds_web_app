---
type: "file"
path: "src/routes/(app)/legal-corpus/+page.server.ts"
aliases: ["+page.server.ts","src/routes/(app)/legal-corpus/+page.server.ts"]
clusterId: 47
ext: ".ts"
lineCount: 67
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: false
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/routes/(app)/legal-corpus/+page.server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-47]]"]
imports: ["[[Files/_types]]"]
tags: ["file","ext/ts","cluster/47","route","auth","t/ts","t/src","t/routes"]
---

# `src/routes/(app)/legal-corpus/+page.server.ts`
## For future Claude
> .ts at src/routes/(app)/legal-corpus/+page.server.ts (67 lines), SvelteKit route, auth-guarded.
cluster:: [[Clusters/cluster-47]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 67
## Imports

- imports:: [[Files/_types]] `./$types.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```