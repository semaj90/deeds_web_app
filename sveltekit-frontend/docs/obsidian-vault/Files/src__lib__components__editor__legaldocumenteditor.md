---
type: "file"
path: "src/lib/components/editor/LegalDocumentEditor.svelte"
aliases: ["LegalDocumentEditor.svelte","src/lib/components/editor/LegalDocumentEditor.svelte"]
clusterId: 92
ext: ".svelte"
lineCount: 528
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 9
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/editor/LegalDocumentEditor.svelte"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-92]]"]
imports: []
tags: ["file","ext/svelte","cluster/92","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/editor/LegalDocumentEditor.svelte`
## For future Claude
> .svelte at src/lib/components/editor/LegalDocumentEditor.svelte (528 lines), Svelte component.
cluster:: [[Clusters/cluster-92]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 528
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```