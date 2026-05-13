---
type: "file"
path: "src/lib/components/evidence/EvidenceBoard.svelte"
aliases: ["EvidenceBoard.svelte","src/lib/components/evidence/EvidenceBoard.svelte"]
clusterId: -1
ext: ".svelte"
lineCount: 2229
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: true
importCount: 13
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/evidence/EvidenceBoard.svelte"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "medium"
up: []
imports: ["[[Files/evidenceconnections]]","[[Files/evidencenode]]","[[Files/relationshipinspector]]","[[Files/boardsearchoverlay]]","[[Files/boardminimap]]","[[Files/board-history]]","[[Files/board-persistence]]"]
tags: ["file","ext/svelte","svelte","zod","t/svelte","t/src","t/lib"]
---

# `src/lib/components/evidence/EvidenceBoard.svelte`
## For future Claude
> .svelte at src/lib/components/evidence/EvidenceBoard.svelte (2229 lines), Svelte component.
pagerank:: 0.000000
blend:: 0.000000
lines:: 2229
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