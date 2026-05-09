---
type: "file"
path: "src/lib/components/ui/dialog/Dialog.svelte"
aliases: ["Dialog.svelte","src/lib/components/ui/dialog/Dialog.svelte"]
clusterId: 4
ext: ".svelte"
lineCount: 77
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 9
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/ui/dialog/Dialog.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-4]]"]
imports: ["[[Files/dialogclose]]","[[Files/dialogcontent]]","[[Files/dialogdescription]]","[[Files/dialogoverlay]]","[[Files/dialogportal]]","[[Files/dialogroot]]","[[Files/dialogtitle]]","[[Files/types]]"]
tags: ["file","ext/svelte","cluster/4","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/ui/dialog/Dialog.svelte`
## For future Claude
> A convenient all-in-one Dialog component that combines Root, Portal, Overlay, and Content.
cluster:: [[Clusters/cluster-4]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 77
## Summary

A convenient all-in-one Dialog component that combines Root, Portal, Overlay, and Content.

## Imports

- imports:: [[Files/dialogclose]] `./DialogClose.svelte`
- imports:: [[Files/dialogcontent]] `./DialogContent.svelte`
- imports:: [[Files/dialogdescription]] `./DialogDescription.svelte`
- imports:: [[Files/dialogoverlay]] `./DialogOverlay.svelte`
- imports:: [[Files/dialogportal]] `./DialogPortal.svelte`
- imports:: [[Files/dialogroot]] `./DialogRoot.svelte`
- imports:: [[Files/dialogtitle]] `./DialogTitle.svelte`
- imports:: [[Files/types]] `./types`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```