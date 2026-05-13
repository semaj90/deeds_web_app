---
type: "file"
path: "src/lib/components/forms/SmartDocumentForm.svelte"
aliases: ["SmartDocumentForm.svelte","src/lib/components/forms/SmartDocumentForm.svelte"]
clusterId: -1
ext: ".svelte"
lineCount: 939
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: true
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/forms/SmartDocumentForm.svelte"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/svelte","svelte","zod","t/svelte","t/src","t/lib"]
---

# `src/lib/components/forms/SmartDocumentForm.svelte`
## For future Claude
> Upload file to MinIO via POST /api/evidence/upload, then track via SSE
pagerank:: 0.000000
blend:: 0.000000
lines:: 939
## Summary

Upload file to MinIO via POST /api/evidence/upload, then track via SSE

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```