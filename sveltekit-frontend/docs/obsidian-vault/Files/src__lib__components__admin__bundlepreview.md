---
type: "file"
path: "src/lib/components/admin/BundlePreview.svelte"
aliases: ["BundlePreview.svelte","src/lib/components/admin/BundlePreview.svelte"]
clusterId: 7
ext: ".svelte"
lineCount: 284
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/admin/BundlePreview.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-7]]"]
imports: []
tags: ["file","ext/svelte","cluster/7","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/admin/BundlePreview.svelte`
## For future Claude
> .svelte at src/lib/components/admin/BundlePreview.svelte (284 lines), Svelte component.
cluster:: [[Clusters/cluster-7]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 284
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```