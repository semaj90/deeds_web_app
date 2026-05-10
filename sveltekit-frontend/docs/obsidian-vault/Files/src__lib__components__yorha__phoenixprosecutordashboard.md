---
type: "file"
path: "src/lib/components/yorha/PhoenixProsecutorDashboard.svelte"
aliases: ["PhoenixProsecutorDashboard.svelte","src/lib/components/yorha/PhoenixProsecutorDashboard.svelte"]
clusterId: 50
ext: ".svelte"
lineCount: 655
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/yorha/PhoenixProsecutorDashboard.svelte"
last_updated_by_llm: "2026-05-09T22:35:57.577Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-50]]"]
imports: ["[[Files/contradictionreveal]]","[[Files/evidence__evidencecomparisonoverlay]]","[[Files/phoenixeventmonitor]]"]
tags: ["file","ext/svelte","cluster/50","svelte","zod","t/svelte","t/src","t/lib"]
---

# `src/lib/components/yorha/PhoenixProsecutorDashboard.svelte`
## For future Claude
> .svelte at src/lib/components/yorha/PhoenixProsecutorDashboard.svelte (655 lines), Svelte component.
cluster:: [[Clusters/cluster-50]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 655
## Imports

- imports:: [[Files/contradictionreveal]] `./ContradictionReveal.svelte`
- imports:: [[Files/evidence__evidencecomparisonoverlay]] `./evidence/EvidenceComparisonOverlay.svelte`
- imports:: [[Files/phoenixeventmonitor]] `./PhoenixEventMonitor.svelte`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```