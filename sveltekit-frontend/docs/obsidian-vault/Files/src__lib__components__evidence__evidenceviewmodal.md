---
type: "file"
path: "src/lib/components/evidence/EvidenceViewModal.svelte"
aliases: ["EvidenceViewModal.svelte","src/lib/components/evidence/EvidenceViewModal.svelte"]
clusterId: 59
ext: ".svelte"
lineCount: 1329
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: true
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/evidence/EvidenceViewModal.svelte"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-59]]"]
imports: ["[[Files/doclingextractionviewer]]","[[Files/evidence-utils]]"]
tags: ["file","ext/svelte","cluster/59","svelte","zod","t/svelte","t/src","t/lib"]
---

# `src/lib/components/evidence/EvidenceViewModal.svelte`
## For future Claude
> .svelte at src/lib/components/evidence/EvidenceViewModal.svelte (1329 lines), Svelte component.
cluster:: [[Clusters/cluster-59]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 1329
## Imports

- imports:: [[Files/doclingextractionviewer]] `./DoclingExtractionViewer.svelte`
- imports:: [[Files/evidence-utils]] `./evidence-utils.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```