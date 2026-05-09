---
type: "file"
path: "src/lib/server/cartridge/glyph-record.ts"
aliases: ["glyph-record.ts","src/lib/server/cartridge/glyph-record.ts"]
clusterId: 12
ext: ".ts"
lineCount: 325
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/cartridge/glyph-record.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-12]]"]
imports: ["[[Files/chr97-builder]]"]
tags: ["file","ext/ts","cluster/12","t/ts","t/src","t/lib"]
---

# `src/lib/server/cartridge/glyph-record.ts`
## For future Claude
> GlyphRecord — unified 4-layer glyph schema for CHR97 cartridge assembly.
cluster:: [[Clusters/cluster-12]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 325
## Summary

GlyphRecord — unified 4-layer glyph schema for CHR97 cartridge assembly.

## Imports

- imports:: [[Files/chr97-builder]] `./chr97-builder.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```