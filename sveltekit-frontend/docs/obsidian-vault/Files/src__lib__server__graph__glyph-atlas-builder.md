---
type: "file"
path: "src/lib/server/graph/glyph-atlas-builder.ts"
aliases: ["glyph-atlas-builder.ts","src/lib/server/graph/glyph-atlas-builder.ts"]
clusterId: -1
ext: ".ts"
lineCount: 488
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: true
importCount: 5
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/graph/glyph-atlas-builder.ts"
last_updated_by_llm: "2026-05-14T01:10:45.024Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","zod","t/ts","t/src","t/lib"]
---

# `src/lib/server/graph/glyph-atlas-builder.ts`
## For future Claude
> GlyphAtlas Builder — MapReduce over cluster summaries, BoW tiles, and PageRank scores.
pagerank:: 0.000000
blend:: 0.000000
lines:: 488
## Summary

GlyphAtlas Builder — MapReduce over cluster summaries, BoW tiles, and PageRank scores.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```