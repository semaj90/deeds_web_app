---
type: "file"
path: "src/lib/components/dashboard/GamificationWidget.svelte"
aliases: ["GamificationWidget.svelte","src/lib/components/dashboard/GamificationWidget.svelte"]
clusterId: 21
ext: ".svelte"
lineCount: 264
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/dashboard/GamificationWidget.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "medium"
up: ["[[Clusters/cluster-21]]"]
imports: ["[[Files/detectiverankbadge]]","[[Files/achievementbadge]]","[[Files/gamification-types]]"]
tags: ["file","ext/svelte","cluster/21","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/dashboard/GamificationWidget.svelte`
## For future Claude
> .svelte at src/lib/components/dashboard/GamificationWidget.svelte (264 lines), Svelte component.
cluster:: [[Clusters/cluster-21]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 264
## Imports

- imports:: [[Files/detectiverankbadge]] `./DetectiveRankBadge.svelte`
- imports:: [[Files/achievementbadge]] `./AchievementBadge.svelte`
- imports:: [[Files/gamification-types]] `./gamification-types.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```