---
type: "file"
path: "src/lib/components/evidence/LinkEvidenceToCaseDialog.svelte"
aliases: ["LinkEvidenceToCaseDialog.svelte","src/lib/components/evidence/LinkEvidenceToCaseDialog.svelte"]
clusterId: 59
ext: ".svelte"
lineCount: 204
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/evidence/LinkEvidenceToCaseDialog.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-59]]"]
imports: ["[[Files/evidence-utils]]"]
tags: ["file","ext/svelte","cluster/59","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/evidence/LinkEvidenceToCaseDialog.svelte`
## For future Claude
> .svelte at src/lib/components/evidence/LinkEvidenceToCaseDialog.svelte (204 lines), Svelte component.
cluster:: [[Clusters/cluster-59]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 204
## Imports

- imports:: [[Files/evidence-utils]] `./evidence-utils.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```