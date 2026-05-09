---
type: "file"
path: "src/lib/components/ui/MarkdownSceneViewer.svelte"
aliases: ["MarkdownSceneViewer.svelte","src/lib/components/ui/MarkdownSceneViewer.svelte"]
clusterId: 34
ext: ".svelte"
lineCount: 354
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: true
isTest: false
hasAuth: false
hasZod: false
importCount: 1
embedding_id: "qdrant://codebase_chunks_768/src/lib/components/ui/MarkdownSceneViewer.svelte"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-34]]"]
imports: []
tags: ["file","ext/svelte","cluster/34","svelte","t/svelte","t/src","t/lib"]
---

# `src/lib/components/ui/MarkdownSceneViewer.svelte`
## For future Claude
> MarkdownSceneViewer Component
cluster:: [[Clusters/cluster-34]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 354
## Summary

MarkdownSceneViewer Component

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```