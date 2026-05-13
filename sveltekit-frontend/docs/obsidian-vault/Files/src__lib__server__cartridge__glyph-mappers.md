---
type: "file"
path: "src/lib/server/cartridge/glyph-mappers.ts"
aliases: ["glyph-mappers.ts","src/lib/server/cartridge/glyph-mappers.ts"]
clusterId: -1
ext: ".ts"
lineCount: 480
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/src/lib/server/cartridge/glyph-mappers.ts"
last_updated_by_llm: "2026-05-13T00:29:45.067Z"
ai-first: true
confidence: "high"
up: []
imports: ["[[Files/chr97-builder]]"]
tags: ["file","ext/ts","t/ts","t/src","t/lib"]
---

# `src/lib/server/cartridge/glyph-mappers.ts`
## For future Claude
> Glyph Mappers — CHR97 ↔ GlyphRecord backward-compat bridge.
pagerank:: 0.000000
blend:: 0.000000
lines:: 480
## Summary

Glyph Mappers — CHR97 ↔ GlyphRecord backward-compat bridge.

## Imports

- imports:: [[Files/chr97-builder]] `./chr97-builder.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```