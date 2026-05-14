---
type: "file"
path: "src/lib/components/cases/CaseViewModal.svelte"
aliases: ["CaseViewModal.svelte","src/lib/components/cases/CaseViewModal.svelte"]
clusterId: -1
ext: ".svelte"
lineCount: 446
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/cases/CaseViewModal.svelte"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/svelte","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/cases/CaseViewModal.svelte`
## For future Claude
> .svelte at src/lib/components/cases/CaseViewModal.svelte (446 lines), Svelte component.
pagerank:: 0.000000
blend:: 0.000000
lines:: 446
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```