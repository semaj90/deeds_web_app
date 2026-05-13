---
type: "file"
path: "src/lib/components/evidence/EvidenceList.svelte"
aliases: ["EvidenceList.svelte","src/lib/components/evidence/EvidenceList.svelte"]
clusterId: -1
ext: ".svelte"
lineCount: 505
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/evidence/EvidenceList.svelte"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/evidence-utils]]"]
tags: ["file","ext/svelte","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/evidence/EvidenceList.svelte`
## For future Claude
> .svelte at src/lib/components/evidence/EvidenceList.svelte (505 lines), Svelte component.
pagerank:: 0.000000
blend:: 0.000000
lines:: 505
## Imports

- imports:: [[Files/evidence-utils]] `./evidence-utils.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```