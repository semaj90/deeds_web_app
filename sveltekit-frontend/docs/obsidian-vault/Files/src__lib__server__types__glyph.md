---
type: "file"
path: "src/lib/server/types/glyph.ts"
aliases: ["glyph.ts","src/lib/server/types/glyph.ts"]
clusterId: 46
ext: ".ts"
lineCount: 186
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 0
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/types/glyph.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-46]]"]
imports: []
tags: ["file","ext/ts","cluster/46","t/ts","t/src","t/lib"]
---

# `src/lib/server/types/glyph.ts`
## For future Claude
> Canonical GlyphRecord schema — four nested payload layers.
cluster:: [[Clusters/cluster-46]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 186
## Summary

Canonical GlyphRecord schema — four nested payload layers.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```