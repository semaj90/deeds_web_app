---
type: "file"
path: "src/lib/gpu/rune-to-legal-doc.ts"
aliases: ["rune-to-legal-doc.ts","src/lib/gpu/rune-to-legal-doc.ts"]
clusterId: 17
ext: ".ts"
lineCount: 57
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: false
hasAuth: false
hasZod: false
importCount: 2
embedding_id: "qdrant://codebase_chunks_768/src/lib/gpu/rune-to-legal-doc.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: ["[[Clusters/cluster-17]]"]
imports: ["[[Files/nes-memory-architecture]]"]
tags: ["file","ext/ts","cluster/17","t/ts","t/src","t/lib"]
---

# `src/lib/gpu/rune-to-legal-doc.ts`
## For future Claude
> Maps CH-ROM97 ParsedRune data to NES LegalDocument format
cluster:: [[Clusters/cluster-17]]
pagerank:: 0.000000
blend:: 0.000000
lines:: 57
## Summary

Maps CH-ROM97 ParsedRune data to NES LegalDocument format

## Imports

- imports:: [[Files/nes-memory-architecture]] `./nes-memory-architecture.js`
## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```