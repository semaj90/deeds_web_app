---
type: "file"
path: "src/routes/(app)/cases/new/+page.svelte"
aliases: ["+page.svelte","src/routes/(app)/cases/new/+page.svelte"]
clusterId: -1
ext: ".svelte"
lineCount: 823
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: true
isTest: false
hasAuth: true
hasZod: false
importCount: 9
embedding_id: "qdrant://codebase_chunks_768/src/routes/(app)/cases/new/+page.svelte"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/schema]]","[[Files/_types]]"]
tags: ["file","ext/svelte","route","svelte","auth","t/svelte","t/src","t/routes"]
---

# `src/routes/(app)/cases/new/+page.svelte`
## For future Claude
> .svelte at src/routes/(app)/cases/new/+page.svelte (823 lines), SvelteKit route, Svelte component, auth-guarded.
pagerank:: 0.000000
blend:: 0.000000
lines:: 823
## Imports

- imports:: [[Files/schema]] `./schema.js`
- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```