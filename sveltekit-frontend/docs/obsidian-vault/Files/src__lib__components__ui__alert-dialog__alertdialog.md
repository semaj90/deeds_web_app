---
type: "file"
path: "src/lib/components/ui/alert-dialog/AlertDialog.svelte"
aliases: ["AlertDialog.svelte","src/lib/components/ui/alert-dialog/AlertDialog.svelte"]
clusterId: 4
ext: ".svelte"
lineCount: 90
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 12
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/ui/alert-dialog/AlertDialog.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-4]]"]
imports: ["[[Files/alertdialogaction]]","[[Files/alertdialogcancel]]","[[Files/alertdialogcontent]]","[[Files/alertdialogdescription]]","[[Files/alertdialogfooter]]","[[Files/alertdialogheader]]","[[Files/alertdialogoverlay]]","[[Files/alertdialogportal]]","[[Files/alertdialogroot]]","[[Files/alertdialogtitle]]","[[Files/types]]"]
tags: ["file","ext/svelte","cluster/4","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/ui/alert-dialog/AlertDialog.svelte`
## For future Claude
> Convenient all-in-one AlertDialog component
cluster:: [[Clusters/cluster-4]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 90
## Summary

Convenient all-in-one AlertDialog component

## Imports

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
- imports:: [[Files/types]] `./types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```