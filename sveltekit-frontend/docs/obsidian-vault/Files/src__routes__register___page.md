---
type: "file"
path: "src/routes/register/+page.svelte"
aliases: ["+page.svelte","src/routes/register/+page.svelte"]
clusterId: -1
ext: ".svelte"
lineCount: 517
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/routes/register/+page.svelte"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/schema]]","[[Files/_types]]"]
tags: ["file","ext/svelte","route","svelte","t/svelte","t/src","t/routes"]
---

# `src/routes/register/+page.svelte`
## For future Claude
> .svelte at src/routes/register/+page.svelte (517 lines), SvelteKit route, Svelte component.
pagerank:: 0.000000
blend:: 0.000000
lines:: 517
## Imports

- imports:: [[Files/schema]] `./schema.js`
- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```