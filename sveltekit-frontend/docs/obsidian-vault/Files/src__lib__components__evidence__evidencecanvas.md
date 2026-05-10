---
type: "file"
path: "src/lib/components/evidence/EvidenceCanvas.svelte"
aliases: ["EvidenceCanvas.svelte","src/lib/components/evidence/EvidenceCanvas.svelte"]
clusterId: 59
ext: ".svelte"
lineCount: 635
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: true
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/evidence/EvidenceCanvas.svelte"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-59]]"]
imports: []
tags: ["file","ext/svelte","cluster/59","svelte","zod","t/svelte","t/src","t/lib"]
---

# `src/lib/components/evidence/EvidenceCanvas.svelte`
## For future Claude
> .svelte at src/lib/components/evidence/EvidenceCanvas.svelte (635 lines), Svelte component.
cluster:: [[Clusters/cluster-59]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 635
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```