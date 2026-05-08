---
type: "file"
path: "src/lib/courtroom/courtroom-scene.svelte.ts"
aliases: ["courtroom-scene.svelte.ts","src/lib/courtroom/courtroom-scene.svelte.ts"]
clusterId: 57
ext: ".ts"
lineCount: 1071
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/courtroom/courtroom-scene.svelte.ts"
last_updated_by_llm: "2026-05-08T16:20:53.376Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-57]]"]
imports: ["[[Files/courtroom-types]]","[[Files/crt-postprocess]]"]
tags: ["file","ext/ts","cluster/57","t/ts","t/src","t/lib"]
---

# `src/lib/courtroom/courtroom-scene.svelte.ts`
## For future Claude
> Phoenix Wright-style 3D courtroom scene manager.
cluster:: [[Clusters/cluster-57]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 1071
## Summary

Phoenix Wright-style 3D courtroom scene manager.

## Imports

- imports:: [[Files/courtroom-types]] `./courtroom-types.js`
- imports:: [[Files/crt-postprocess]] `./crt-postprocess.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```