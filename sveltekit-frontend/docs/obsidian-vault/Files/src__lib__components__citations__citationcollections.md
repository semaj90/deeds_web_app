---
type: "file"
path: "src/lib/components/citations/CitationCollections.svelte"
aliases: ["CitationCollections.svelte","src/lib/components/citations/CitationCollections.svelte"]
clusterId: -1
ext: ".svelte"
lineCount: 636
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/citations/CitationCollections.svelte"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "medium"
up: []
imports: []
tags: ["file","ext/svelte","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/citations/CitationCollections.svelte`
## For future Claude
> .svelte at src/lib/components/citations/CitationCollections.svelte (636 lines), Svelte component.
pagerank:: 0.000000
blend:: 0.000000
lines:: 636
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```