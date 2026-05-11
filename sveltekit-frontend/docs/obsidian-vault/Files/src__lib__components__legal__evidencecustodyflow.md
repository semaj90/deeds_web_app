---
type: "file"
path: "src/lib/components/legal/EvidenceCustodyFlow.svelte"
aliases: ["EvidenceCustodyFlow.svelte","src/lib/components/legal/EvidenceCustodyFlow.svelte"]
clusterId: 21
ext: ".svelte"
lineCount: 507
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: true
importCount: 9
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/legal/EvidenceCustodyFlow.svelte"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-21]]"]
imports: ["[[Files/custodytimeline]]","[[Files/integrityverification]]","[[Files/collaborationpanel]]","[[Files/workflowprogress]]"]
tags: ["file","ext/svelte","cluster/21","svelte","zod","t/svelte","t/src","t/lib"]
---

# `src/lib/components/legal/EvidenceCustodyFlow.svelte`
## For future Claude
> .svelte at src/lib/components/legal/EvidenceCustodyFlow.svelte (507 lines), Svelte component.
cluster:: [[Clusters/cluster-21]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 507
## Imports

- imports:: [[Files/custodytimeline]] `./CustodyTimeline.svelte`
- imports:: [[Files/integrityverification]] `./IntegrityVerification.svelte`
- imports:: [[Files/collaborationpanel]] `./CollaborationPanel.svelte`
- imports:: [[Files/workflowprogress]] `./WorkflowProgress.svelte`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```