---
type: "file"
path: "src/lib/components/evidence/EvidencePrimaryUpload.svelte"
aliases: ["EvidencePrimaryUpload.svelte","src/lib/components/evidence/EvidencePrimaryUpload.svelte"]
clusterId: -1
ext: ".svelte"
lineCount: 500
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 6
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/evidence/EvidencePrimaryUpload.svelte"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/evidenceuploadresults]]","[[Files/evidence-utils]]"]
tags: ["file","ext/svelte","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/evidence/EvidencePrimaryUpload.svelte`
## For future Claude
> .svelte at src/lib/components/evidence/EvidencePrimaryUpload.svelte (500 lines), Svelte component.
pagerank:: 0.000000
blend:: 0.000000
lines:: 500
## Imports

- imports:: [[Files/evidenceuploadresults]] `./EvidenceUploadResults.svelte`
- imports:: [[Files/evidence-utils]] `./evidence-utils.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```