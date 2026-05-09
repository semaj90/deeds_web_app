---
type: "file"
path: "src/lib/components/legal-corpus/LegalCorpusDemoView.svelte"
aliases: ["LegalCorpusDemoView.svelte","src/lib/components/legal-corpus/LegalCorpusDemoView.svelte"]
clusterId: 35
ext: ".svelte"
lineCount: 328
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/legal-corpus/LegalCorpusDemoView.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-35]]"]
imports: []
tags: ["file","ext/svelte","cluster/35","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/legal-corpus/LegalCorpusDemoView.svelte`
## For future Claude
> .svelte at src/lib/components/legal-corpus/LegalCorpusDemoView.svelte (328 lines), Svelte component.
cluster:: [[Clusters/cluster-35]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 328
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```