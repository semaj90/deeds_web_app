---
type: "file"
path: "src/lib/components/evidence/EvidenceBoard.svelte"
aliases: ["EvidenceBoard.svelte","src/lib/components/evidence/EvidenceBoard.svelte"]
clusterId: 59
ext: ".svelte"
lineCount: 1291
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 8
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/evidence/EvidenceBoard.svelte"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-59]]"]
imports: ["[[Files/evidenceconnections]]","[[Files/evidencenode]]","[[Files/relationshipinspector]]","[[Files/boardsearchoverlay]]","[[Files/boardminimap]]","[[Files/board-history]]","[[Files/board-persistence]]"]
tags: ["file","ext/svelte","cluster/59","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/evidence/EvidenceBoard.svelte`
## For future Claude
> .svelte at src/lib/components/evidence/EvidenceBoard.svelte (1291 lines), Svelte component.
cluster:: [[Clusters/cluster-59]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 1291
## Imports

- imports:: [[Files/evidenceconnections]] `./EvidenceConnections.svelte`
- imports:: [[Files/evidencenode]] `./EvidenceNode.svelte`
- imports:: [[Files/relationshipinspector]] `./RelationshipInspector.svelte`
- imports:: [[Files/boardsearchoverlay]] `./BoardSearchOverlay.svelte`
- imports:: [[Files/boardminimap]] `./BoardMinimap.svelte`
- imports:: [[Files/board-history]] `./board-history.svelte.js`
- imports:: [[Files/board-persistence]] `./board-persistence.svelte.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```