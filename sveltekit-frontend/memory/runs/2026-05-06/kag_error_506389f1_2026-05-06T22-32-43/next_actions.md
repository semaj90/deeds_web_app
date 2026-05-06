# Next Actions: kag_error_506389f1_2026-05-06T22-32-43

> ⚠ **Low confidence — deep research required**

1. POST /api/ai/agent with pipeline:"coding" to trigger full Gemma4 agent run
2. Call MCP tool kag.record_agent_run with needsDeepResearch:true
3. Review graph neighborhood: kag.ingest_memory_directory after run
4. Check related patterns: npm run smoke:kag

## Context for agent
Paste this into POST /api/ai/agent → body.query:

```
Redis memberIds shape mismatch in hypergraph-store.ts at buildHyperedge
```

Related files: unknown

---
_Use kag.record_agent_run to close the loop after patching._
