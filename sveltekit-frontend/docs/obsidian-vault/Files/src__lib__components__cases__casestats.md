---
type: "file"
path: "src/lib/components/cases/CaseStats.svelte"
aliases: ["CaseStats.svelte","src/lib/components/cases/CaseStats.svelte"]
clusterId: 2
ext: ".svelte"
lineCount: 73
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/cases/CaseStats.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-2]]"]
imports: []
tags: ["file","ext/svelte","cluster/2","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/cases/CaseStats.svelte`
## For future Claude
> .svelte at src/lib/components/cases/CaseStats.svelte (73 lines), Svelte component.
cluster:: [[Clusters/cluster-2]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 73
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```