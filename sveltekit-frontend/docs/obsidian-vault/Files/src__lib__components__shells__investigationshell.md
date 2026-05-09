---
type: "file"
path: "src/lib/components/shells/InvestigationShell.svelte"
aliases: ["InvestigationShell.svelte","src/lib/components/shells/InvestigationShell.svelte"]
clusterId: 92
ext: ".svelte"
lineCount: 331
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 3
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/shells/InvestigationShell.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-92]]"]
imports: ["[[Files/bridgeactions]]"]
tags: ["file","ext/svelte","cluster/92","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/shells/InvestigationShell.svelte`
## For future Claude
> .svelte at src/lib/components/shells/InvestigationShell.svelte (331 lines), Svelte component.
cluster:: [[Clusters/cluster-92]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 331
## Imports

- imports:: [[Files/bridgeactions]] `./BridgeActions.svelte`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```