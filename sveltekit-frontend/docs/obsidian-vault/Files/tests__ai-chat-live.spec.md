---
type: "file"
path: "tests/ai-chat-live.spec.ts"
aliases: ["ai-chat-live.spec.ts","tests/ai-chat-live.spec.ts"]
clusterId: -1
ext: ".ts"
lineCount: 336
pagerank: 0
blend: 0
isRoute: false
isSvelteComp: false
isTest: true
hasAuth: false
hasZod: false
importCount: 4
embedding_id: "qdrant://codebase_chunks_768/tests/ai-chat-live.spec.ts"
last_updated_by_llm: "2026-05-08T16:50:32.855Z"
ai-first: true
confidence: "high"
up: []
imports: []
tags: ["file","ext/ts","test","t/ts","t/tests","t/ai-chat-live_spec_ts"]
---

# `tests/ai-chat-live.spec.ts`
## For future Claude
> Return first CHAT model ID from llama-server /v1/models or Ollama /api/tags.
pagerank:: 0.000000
blend:: 0.000000
lines:: 336
## Summary

Return first CHAT model ID from llama-server /v1/models or Ollama /api/tags.

## Backlinks (Dataview)
```dataviewjs
const cur = dv.current().file.path;
dv.list(dv.pages().where(p => Array.isArray(p.imports) && p.imports.some(l => l && l.path === cur)).file.link);
```