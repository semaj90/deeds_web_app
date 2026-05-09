---
type: "file"
path: "src/lib/server/glyph/glyph-mappers.ts"
aliases: ["glyph-mappers.ts","src/lib/server/glyph/glyph-mappers.ts"]
clusterId: 6
ext: ".ts"
lineCount: 136
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/glyph/glyph-mappers.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-6]]"]
imports: []
tags: ["file","ext/ts","cluster/6","t/ts","t/src","t/lib"]
---

# `src/lib/server/glyph/glyph-mappers.ts`
## For future Claude
> GlyphRecord ↔ RuneData mappers — backward-compat bridge.
cluster:: [[Clusters/cluster-6]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 136
## Summary

GlyphRecord ↔ RuneData mappers — backward-compat bridge.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```