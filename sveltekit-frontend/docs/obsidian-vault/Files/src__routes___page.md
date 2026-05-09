---
type: "file"
path: "src/routes/+page.svelte"
aliases: ["+page.svelte","src/routes/+page.svelte"]
clusterId: -1
ext: ".svelte"
lineCount: 1653
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/routes/+page.svelte"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/_types]]"]
tags: ["file","ext/svelte","route","svelte","t/svelte","t/src","t/routes"]
---

# `src/routes/+page.svelte`
## For future Claude
> .svelte at src/routes/+page.svelte (1653 lines), SvelteKit route, Svelte component.
pagerank:: 0.000000
blend:: 0.000000
lines:: 1653
## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```