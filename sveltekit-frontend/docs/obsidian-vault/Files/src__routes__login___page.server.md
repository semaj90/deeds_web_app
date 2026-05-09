---
type: "file"
path: "src/routes/login/+page.server.ts"
aliases: ["+page.server.ts","src/routes/login/+page.server.ts"]
clusterId: 83
ext: ".ts"
lineCount: 59
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: false
isTest: false
hasAuth: true
hasZod: true
importCount: 9
embedding_id: "qdrant://codebase_chunks_768/src/routes/login/+page.server.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-83]]"]
imports: ["[[Files/_types]]","[[Files/schema]]"]
tags: ["file","ext/ts","cluster/83","route","auth","zod","t/ts","t/src","t/routes"]
---

# `src/routes/login/+page.server.ts`
## For future Claude
> .ts at src/routes/login/+page.server.ts (59 lines), SvelteKit route, auth-guarded.
cluster:: [[Clusters/cluster-83]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 59
## Imports

- imports:: [[Files/_types]] `./$types`
- imports:: [[Files/schema]] `./schema.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```