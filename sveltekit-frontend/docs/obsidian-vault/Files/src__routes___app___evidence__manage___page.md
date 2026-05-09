---
type: "file"
path: "src/routes/(app)/evidence/manage/+page.svelte"
aliases: ["+page.svelte","src/routes/(app)/evidence/manage/+page.svelte"]
clusterId: 29
ext: ".svelte"
lineCount: 166
pagerank: 0
blend: 0
isRoute: true
isSvelteComp: true
isTest: false
hasAuth: true
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/routes/(app)/evidence/manage/+page.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-29]]"]
imports: ["[[Files/_types]]"]
tags: ["file","ext/svelte","cluster/29","route","svelte","auth","t/svelte","t/src","t/routes"]
---

# `src/routes/(app)/evidence/manage/+page.svelte`
## For future Claude
> .svelte at src/routes/(app)/evidence/manage/+page.svelte (166 lines), SvelteKit route, Svelte component, auth-guarded.
cluster:: [[Clusters/cluster-29]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 166
## Imports

- imports:: [[Files/_types]] `./$types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```