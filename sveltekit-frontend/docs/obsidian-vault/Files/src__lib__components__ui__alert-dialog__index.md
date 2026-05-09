---
type: "file"
path: "src/lib/components/ui/alert-dialog/index.js"
aliases: ["index.js","src/lib/components/ui/alert-dialog/index.js"]
clusterId: 4
ext: ".js"
lineCount: 29
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 12
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/ui/alert-dialog/index.js"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-4]]"]
imports: ["[[Files/alertdialog]]","[[Files/alertdialogaction]]","[[Files/alertdialogcancel]]","[[Files/alertdialogcontent]]","[[Files/alertdialogdescription]]","[[Files/alertdialogfooter]]","[[Files/alertdialogheader]]","[[Files/alertdialogoverlay]]","[[Files/alertdialogportal]]","[[Files/alertdialogroot]]","[[Files/alertdialogtitle]]","[[Files/alertdialogtrigger]]"]
tags: ["file","ext/js","cluster/4","t/js","t/src","t/lib"]
---

# `src/lib/components/ui/alert-dialog/index.js`
## For future Claude
> .js at src/lib/components/ui/alert-dialog/index.js (29 lines).
cluster:: [[Clusters/cluster-4]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 29
## Imports

- imports:: [[Files/alertdialog]] `./AlertDialog.svelte`
- imports:: [[Files/alertdialogaction]] `./AlertDialogAction.svelte`
- imports:: [[Files/alertdialogcancel]] `./AlertDialogCancel.svelte`
- imports:: [[Files/alertdialogcontent]] `./AlertDialogContent.svelte`
- imports:: [[Files/alertdialogdescription]] `./AlertDialogDescription.svelte`
- imports:: [[Files/alertdialogfooter]] `./AlertDialogFooter.svelte`
- imports:: [[Files/alertdialogheader]] `./AlertDialogHeader.svelte`
- imports:: [[Files/alertdialogoverlay]] `./AlertDialogOverlay.svelte`
- imports:: [[Files/alertdialogportal]] `./AlertDialogPortal.svelte`
- imports:: [[Files/alertdialogroot]] `./AlertDialogRoot.svelte`
- imports:: [[Files/alertdialogtitle]] `./AlertDialogTitle.svelte`
- imports:: [[Files/alertdialogtrigger]] `./AlertDialogTrigger.svelte`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```