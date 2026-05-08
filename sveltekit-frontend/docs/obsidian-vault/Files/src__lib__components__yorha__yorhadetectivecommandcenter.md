---
type: "file"
path: "src/lib/components/yorha/YoRHaDetectiveCommandCenter.svelte"
aliases: ["YoRHaDetectiveCommandCenter.svelte","src/lib/components/yorha/YoRHaDetectiveCommandCenter.svelte"]
clusterId: 50
ext: ".svelte"
lineCount: 906
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/yorha/YoRHaDetectiveCommandCenter.svelte"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-50]]"]
imports: ["[[Files/yorhadetectiveform]]","[[Files/yorhadetectivemodal]]","[[Files/yorhadetectivenotification]]"]
tags: ["file","ext/svelte","cluster/50","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/yorha/YoRHaDetectiveCommandCenter.svelte`
## For future Claude
> .svelte at src/lib/components/yorha/YoRHaDetectiveCommandCenter.svelte (906 lines), Svelte component.
cluster:: [[Clusters/cluster-50]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 906
## Imports

- imports:: [[Files/yorhadetectiveform]] `./YoRHaDetectiveForm.svelte`
- imports:: [[Files/yorhadetectivemodal]] `./YoRHaDetectiveModal.svelte`
- imports:: [[Files/yorhadetectivenotification]] `./YoRHaDetectiveNotification.svelte`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```