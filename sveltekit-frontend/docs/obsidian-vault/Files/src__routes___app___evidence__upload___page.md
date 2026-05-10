---
type: "file"
path: "src/routes/(app)/evidence/upload/+page.svelte"
aliases: ["+page.svelte","src/routes/(app)/evidence/upload/+page.svelte"]
clusterId: 92
ext: ".svelte"
lineCount: 443
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: true
isTest: false
hasAuth: true
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/routes/(app)/evidence/upload/+page.svelte"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-92]]"]
imports: ["[[Files/_types]]"]
tags: ["file","ext/svelte","cluster/92","route","svelte","auth","zod","t/svelte","t/src","t/routes"]
---

# `src/routes/(app)/evidence/upload/+page.svelte`
## For future Claude
> .svelte at src/routes/(app)/evidence/upload/+page.svelte (443 lines), SvelteKit route, Svelte component, auth-guarded.
cluster:: [[Clusters/cluster-92]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 443
## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```